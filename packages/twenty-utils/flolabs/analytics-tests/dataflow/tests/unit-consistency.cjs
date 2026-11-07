'use strict';
// A value must not change meaning along its path: instants stay UTC instants, local dates
// only make buckets, rates stay fractions until the UI, counts stay integers.
const path = require('node:path');

const { REPO_ROOT } = require('../lib/context.cjs');
const { createSinkReader, diffCaptures, toIso } = require('../lib/sinks.cjs');
const { seedBaseline, seedDistinct } = require('../lib/seed.cjs');
const { createTapReader, toDate, weekStart } = require('../lib/taps.cjs');

const DAY_MS = 86_400_000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const INSTANT_KEYS = new Set(['asOf', 'trackingStartedAt', 'stageEnteredAt', 'generatedAt', 'lastSuccessfulSyncAt', 'lastReconciliationAt', 'lastAttemptAt']);
const DATE_KEYS = new Set(['bucketStart', 'newApplicationsFrom', 'newApplicationsTo', 'periodStart', 'periodEnd', 'from', 'to']);
// value in a trend series is a count, a rate or days; the walk checks it by metric instead.
const NON_INTEGER_KEYS = new Set(['medianDays', 'value', 'previousValue']);

const isRateKey = (key) => /rate$/i.test(key);

const walkLeaves = (value, visit, key = '', trail = '') => {
  if (Array.isArray(value)) {
    value.forEach((element, position) => walkLeaves(element, visit, key, `${trail}[${position}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [innerKey, inner] of Object.entries(value)) {
      walkLeaves(inner, visit, innerKey, `${trail}.${innerKey}`);
    }
  } else {
    visit({ key, trail, value });
  }
};

// A Sunday at least 20 days old, at 23:30 UTC: past every 14 day limit. It is Monday 04:30
// in Karachi, so a date taken in the wrong zone lands in the wrong week.
const lateSunday = (now) => {
  const date = new Date(now.getTime() - 21 * DAY_MS);

  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  date.setUTCHours(23, 30, 0, 0);

  return date;
};

module.exports = {
  title: 'Unit consistency along the path',
  run: async ({ context, createScope }) => {
    const { fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsReportService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const { daysAgo, query } = context;

    const allPayloads = async (workspace) => {
      const { page } = context;
      const payloads = {
        meta: await page.meta(workspace),
        overview: await page.overview(workspace),
        funnel: await page.funnel(workspace),
        categoriesTrack: await page.categories(workspace, 'TRACK_PROGRAM'),
        categoriesSource: await page.categories(workspace, 'SOURCE'),
      };

      for (const metric of ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT', 'OVERALL_CONVERSION', 'DROP_OFF', 'MEDIAN_DAYS']) {
        payloads[metric] = await page.trends(workspace, metric, metric === 'OVERALL_CONVERSION' ? { filter: { period: 'MONTH' } } : undefined);
      }

      payloads.reports = await page.reports(workspace);

      const [latest] = payloads.reports;

      if (latest !== undefined) {
        payloads.report = await page.report(workspace, latest.periodType, latest.periodStart);
      }

      return payloads;
    };

    const prepared = await fixture('both workspaces with every payload', async () => {
      const small = await seedBaseline(context);
      const distinct = await seedDistinct(context);

      for (const workspace of [small, distinct]) {
        await context.runSync(workspace);
        await context.runDaily(workspace);
      }

      return {
        distinct,
        small,
        distinctPayloads: await allPayloads(distinct),
        smallPayloads: await allPayloads(small),
      };
    });

    const needs = [prepared];
    const eachPayload = (visit) => {
      for (const payloads of [prepared.smallPayloads, prepared.distinctPayloads]) {
        for (const [name, payload] of Object.entries(payloads)) {
          walkLeaves(payload, ({ key, trail, value }) => visit({ key, trail: `${name}${trail}`, value }));
        }
      }
    };

    // ---- instants
    const boundary = await fixture('a person, a move and a submission late on a Sunday', async () => {
      const sunday = lateSunday(context.now);
      const workspace = await context.createWorkspace();
      const { insertForm, insertPerson, insertStageChange, insertSubmission } = workspace.fixtures;

      workspace.setTrackingStart(daysAgo(70));

      const personId = await insertPerson({ firstName: 'Late', stage: 'CONTACTED', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', createdAt: sunday });
      const formId = await insertForm({ name: 'Internship Application' });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: sunday, updatedAt: sunday });
      await insertSubmission({ formId, personId, submittedAt: sunday });

      return { personId, sunday, workspace };
    });

    await test('UNIT-01 happened_at keeps the exact instant from CRM to stored row to payload', async (t) => {
      const { personId, sunday, workspace } = boundary;

      await context.runSync(workspace);
      await context.runDaily(workspace);

      const [row] = await query(
        `SELECT happened_at, to_char(happened_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') AS utc_text
         FROM analytics.stage_transition WHERE person_id = $1`,
        [personId],
      );

      t.equal('stored instant', toIso(row.happened_at), toIso(sunday));
      t.equal('reads as UTC', row.utc_text, sunday.toISOString().replace('T', ' ').slice(0, 23));

      const { stuck } = await context.page.overview(workspace);

      t.equal('payload instant', stuck.rows[0]?.stageEnteredAt, toIso(sunday));
    }, { needs: [boundary] });

    await test('UNIT-02 local dates use the reporting zone, never the session zone: a Karachi session changes nothing', async (t) => {
      const { workspace } = boundary;
      const sinks = createSinkReader(context);
      const before = await sinks.capture(workspace);

      await query(`ALTER DATABASE ${context.databaseName} SET timezone TO 'Asia/Karachi'`);

      const pool = context.createPagePool();

      try {
        const karachi = context.createServiceSet({ pool });
        const [{ timezone }] = (await pool.query(`SELECT current_setting('TimeZone') AS timezone`)).rows;

        t.equal('the session really is in Karachi', timezone, 'Asia/Karachi');

        await karachi.runSync(workspace);
        await karachi.runDaily(workspace);

        const after = await createSinkReader({ page: karachi.page, query }).capture(workspace);

        t.equal('every sink is identical', diffCaptures(before, after), {});

        const week = weekStart(boundary.sunday);
        const trends = await karachi.page.trends(workspace, 'NEW_APPLICATIONS');

        t.equal('the Sunday stays in its own week', trends.series.find(({ bucketStart }) => bucketStart === week)?.value, 1);
      } finally {
        await pool.end();
        await query(`ALTER DATABASE ${context.databaseName} RESET timezone`);
      }
    }, { needs: [boundary] });

    await test('UNIT-03 a reporting zone moves buckets and the snapshot date only: instants, counts and stored rows stay', async (t) => {
      const zone = 'Asia/Karachi';
      const workspace = await context.createWorkspace();
      const sunday = lateSunday(context.now);
      const { insertForm, insertPerson, insertStageChange, insertSubmission } = workspace.fixtures;

      workspace.setTrackingStart(daysAgo(70));

      const personId = await insertPerson({ stage: 'CONTACTED', createdAt: sunday });
      const formId = await insertForm({ name: 'Internship Application' });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: sunday, updatedAt: sunday });
      await insertSubmission({ formId, personId, submittedAt: sunday });

      await context.withAlteredConfig(
        (config) => {
          config.reportingTimeZone = zone;
        },
        async ({ page, runDaily, runSync }) => {
          await runSync(workspace);
          await runDaily(workspace);

          const utcWeek = weekStart(sunday);
          const localWeek = toDate(new Date(`${utcWeek}T00:00:00.000Z`).getTime() + 7 * DAY_MS);
          const trends = await page.trends(workspace, 'NEW_APPLICATIONS');
          const overview = await page.overview(workspace);
          const [stored] = await query(`SELECT happened_at FROM analytics.stage_transition WHERE person_id = $1`, [personId]);
          const [snapshot] = await query(
            `SELECT snapshot_date FROM analytics.daily_snapshot WHERE workspace_id = $1 LIMIT 1`,
            [workspace.workspaceId],
          );

          t.equal('reported', trends.reportingTimeZone, zone);
          t.equal('submission bucket is the local Monday', trends.series.find(({ bucketStart }) => bucketStart === localWeek)?.value, 1);
          t.equal('not the UTC week', trends.series.find(({ bucketStart }) => bucketStart === utcWeek)?.value, 0);
          t.equal('cohort bucket too', trends.cohorts.map(({ bucketStart }) => bucketStart), [localWeek]);
          t.equal('stored instant unchanged', toIso(stored.happened_at), toIso(sunday));
          t.equal('payload instant unchanged', overview.stuck.rows[0]?.stageEnteredAt, toIso(sunday));
          t.equal('snapshot date is the local today', snapshot.snapshot_date, new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date()));
        },
      );
    }, { needs });

    await test('UNIT-04 stored column types carry the meaning', async (t) => {
      const columns = await query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'analytics'`,
      );
      const typeOf = (table, column) => columns.find((row) => row.table_name === table && row.column_name === column)?.data_type;
      const instant = 'timestamp with time zone';

      t.equal('happened_at', typeOf('stage_transition', 'happened_at'), instant);
      t.equal('source_updated_at', typeOf('stage_transition', 'source_updated_at'), instant);
      t.equal('generated_at', typeOf('report', 'generated_at'), instant);
      t.equal('started_at', typeOf('sync_log', 'started_at'), instant);
      t.equal('finished_at', typeOf('sync_log', 'finished_at'), instant);
      t.equal('snapshot_date is a local date', typeOf('daily_snapshot', 'snapshot_date'), 'date');
      t.equal('period_start is a local date', typeOf('report', 'period_start'), 'date');
      t.equal('period_end is a local date', typeOf('report', 'period_end'), 'date');
      t.equal('person_count', typeOf('daily_snapshot', 'person_count'), 'integer');
      t.equal('processed_count', typeOf('sync_log', 'processed_count'), 'integer');
      t.equal('restored_count', typeOf('sync_log', 'restored_count'), 'integer');
    }, { needs });

    await test('UNIT-05 every instant in a payload is an ISO UTC string, every date a plain local date', (t) => {
      let instants = 0;
      let dates = 0;

      eachPayload(({ key, trail, value }) => {
        if (value === null) return;

        if (INSTANT_KEYS.has(key)) {
          instants += 1;
          t.ok(`${trail} is an ISO UTC instant`, ISO_INSTANT.test(value), value);
        }

        if (DATE_KEYS.has(key)) {
          dates += 1;
          t.ok(`${trail} is a local date`, LOCAL_DATE.test(value), value);
        }
      });

      t.ok('instants were checked', instants > 20, instants);
      t.ok('dates were checked', dates > 20, dates);
    }, { needs });

    // ---- rates
    await test('UNIT-06 every rate in every payload and stored report is a fraction from 0 to 1, or null', (t) => {
      const seen = [];

      eachPayload(({ key, trail, value }) => {
        if (isRateKey(key) && value !== null) {
          seen.push(value);
          t.ok(`${trail} is a fraction`, typeof value === 'number' && value >= 0 && value <= 1, value);
        }
      });

      t.ok('rates were checked', seen.length > 50, seen.length);
      t.ok('a rate strictly between 0 and 1 is among them', seen.some((rate) => rate > 0 && rate < 1), seen.slice(0, 5));
    }, { needs });

    await test('UNIT-07 rate trend lines stay fractions; count lines stay integers; median lines stay days', (t) => {
      const { distinctPayloads, smallPayloads } = prepared;
      const values = (payload) => payload.series.flatMap(({ value, previousValue }) => [value, previousValue]).filter((value) => value !== null);

      t.ok('overall line has a value', values(distinctPayloads.OVERALL_CONVERSION).length > 0);
      t.ok('overall line is a fraction', values(distinctPayloads.OVERALL_CONVERSION).every((value) => value >= 0 && value <= 1), values(distinctPayloads.OVERALL_CONVERSION));
      t.ok('drop-off line has a value', values(distinctPayloads.DROP_OFF).length > 0);
      t.ok('drop-off line is a fraction', values(distinctPayloads.DROP_OFF).every((value) => value >= 0 && value <= 1), values(distinctPayloads.DROP_OFF));

      for (const metric of ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT']) {
        t.ok(`${metric} is whole numbers`, values(smallPayloads[metric]).every(Number.isInteger), values(smallPayloads[metric]));
      }

      t.ok('median days, not milliseconds', values(smallPayloads.MEDIAN_DAYS).every((value) => value > 0 && value <= 100), values(smallPayloads.MEDIAN_DAYS));
    }, { needs });

    await test('UNIT-12 median days are rounded to one decimal before leaving the server; the stay itself keeps the exact time', async (t) => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;
      const { page } = context;
      const createdAt = daysAgo(30);
      const movedAt = new Date(createdAt.getTime() + 10 * DAY_MS + 8 * 3_600_000);

      workspace.setTrackingStart(daysAgo(45));

      const personId = await insertPerson({ stage: 'CONTACTED', createdAt });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: movedAt });
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const { collect, tapOf } = createTapReader(context);
      const funnel = await page.funnel(workspace);
      const tap = tapOf(await collect(() => page.funnel(workspace)));
      const [stay] = await tap('completed_stay', 'SELECT stay_days FROM completed_stay');
      const { series } = await page.trends(workspace, 'MEDIAN_DAYS');
      const [report] = await page.reports(workspace);
      const { funnel: stored } = await page.report(workspace, report.periodType, report.periodStart);
      const medianOfNew = ({ rows }) => rows.find(({ stageKey }) => stageKey === 'NEW').medianDays;

      t.ok('the stay is 10 days 8 hours', Math.abs(Number(stay.stay_days) - 31 / 3) < 1e-6, stay);
      t.equal('funnel', medianOfNew(funnel), 10.3);
      t.equal('trend line', series.find(({ bucketStart }) => bucketStart === weekStart(movedAt))?.value, 10.3);
      t.equal('stored report', medianOfNew(stored), 10.3);
    }, { needs });

    await test('UNIT-08 the rate becomes a percent only in the front helper', (t) => {
      const { formatAnalyticsRate } = require(path.join(
        REPO_ROOT,
        'packages/twenty-front/src/modules/crm-analytics/utils/formatAnalyticsRate.ts',
      ));
      const row = prepared.distinctPayloads.funnel.rows.find(({ stageKey }) => stageKey === 'NEW');

      t.equal('in the payload', row.stepRate, 7 / 13);
      t.equal('on screen', formatAnalyticsRate(row.stepRate), '54%');
      t.equal('unknown stays unknown', formatAnalyticsRate(null), null);
      t.equal('zero is a real zero', formatAnalyticsRate(0), '0%');
    }, { needs });

    // ---- counts
    await test('UNIT-09 every count in every payload is a JavaScript integer, not a string', (t) => {
      let counts = 0;

      eachPayload(({ key, trail, value }) => {
        if (typeof value === 'number' && !isRateKey(key) && !NON_INTEGER_KEYS.has(key)) {
          counts += 1;
          t.ok(`${trail} is an integer`, Number.isInteger(value), value);
        }

        if (typeof value === 'string' && /^\d+$/.test(value)) {
          t.fail(`${trail} is a number sent as text: ${value}`);
        }
      });

      t.ok('counts were checked', counts > 100, counts);
    }, { needs });

    await test('UNIT-10 identities hold on every funnel row: nothing is lost between the columns', (t) => {
      for (const payloads of [prepared.smallPayloads, prepared.distinctPayloads]) {
        for (const row of payloads.funnel.rows) {
          if (row.windowDays !== null) {
            t.equal(`${row.stageKey} entered`, row.entered, row.eligible + row.inWindow);
            t.equal(`${row.stageKey} eligible`, row.eligible, row.reachedNext + row.timedOut + row.exited);
          } else {
            t.equal(`${row.stageKey} has no step columns`, [row.eligible, row.reachedNext, row.timedOut, row.exited, row.inWindow], [0, 0, 0, 0, 0]);
          }
        }
      }
    }, { needs });

    await test('UNIT-11 no value is lost on the wire: no payload holds undefined, NaN or a Date', async (t) => {
      const metrics = context.services.get('CrmAnalyticsMetricsService');
      const filter = { dateFrom: null, dateTo: null, trackKey: null, programKey: null, sourceKey: null, status: 'ALL', period: 'WEEK' };
      const { workspaceId } = prepared.small;

      for (const [name, payload] of [
        ['overview', await metrics.getOverview({ workspaceId, filter })],
        ['funnel', await metrics.getFunnel({ workspaceId, filter })],
        ['categories', await metrics.getCategories({ workspaceId, filter, groupBy: 'TRACK_PROGRAM' })],
        ['trends', await metrics.getTrends({ workspaceId, filter, metric: 'DROP_OFF', stageKey: null })],
      ]) {
        t.equal(`${name} survives JSON unchanged`, JSON.parse(JSON.stringify(payload)), payload);
      }
    }, { needs });
  },
};
