'use strict';
// analytics.report: built by the daily job from the same metric methods as the page,
// frozen, and read back unchanged.
const util = require('node:util');

const { seedBaseline, insertPeople } = require('../lib/seed.cjs');
const { toIso } = require('../lib/sinks.cjs');
const { monthStart, toDate, weekStart } = require('../lib/taps.cjs');

const DAY_MS = 86_400_000;

const addDays = (date, days) => toDate(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS);

const rowOf = (rows, field, key) => rows.find((row) => row[field] === key);

module.exports = {
  title: 'Report path',
  run: async ({ context, createScope }) => {
    const { edge, fixture } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsReportService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const weekly = await fixture('baseline workspace with its weekly reports', async () => {
      const workspace = await seedBaseline(context);

      // In a week old enough that the week after it has finished too.
      await workspace.fixtures.insertSubmission({
        formId: workspace.forms.application,
        personId: workspace.people.ben,
        submittedAt: context.daysAgo(21),
      });
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const rows = await context.query(
        `SELECT period_type, period_start::text AS period_start, period_end::text AS period_end, generated_at, payload
         FROM analytics.report WHERE workspace_id = $1 ORDER BY period_start DESC`,
        [workspace.workspaceId],
      );

      return {
        rows,
        workspace,
        reportOf: (periodStart) => rows.find((row) => row.period_type === 'WEEK' && row.period_start === periodStart)?.payload,
      };
    });

    // 62 days always holds one finished calendar month. Two daily runs: at most 8 per run.
    const monthly = await fixture('a workspace holding a finished month', async () => {
      const workspace = await context.createWorkspace();

      workspace.setTrackingStart(context.daysAgo(62));

      const firstFullDay = toDate(context.daysAgo(61));
      const month = firstFullDay.endsWith('-01')
        ? firstFullDay
        : monthStart(new Date(`${firstFullDay.slice(0, 7)}-28T00:00:00.000Z`).getTime() + 7 * DAY_MS);
      const createdAge = Math.round((context.now.getTime() - new Date(`${month}T12:00:00.000Z`).getTime()) / DAY_MS) - 2;

      await insertPeople({
        workspace,
        people: { mia: { firstName: 'Mia', lastName: 'Monthly', createdAge, stage: 'NEW', positions: ['FINANCE_INTERN'], source: 'LINKEDIN' } },
        daysAgo: context.daysAgo,
      });
      await context.runSync(workspace);
      await context.runDaily(workspace);
      await context.runDaily(workspace);

      const rows = await context.query(
        `SELECT period_type, period_start::text AS period_start, period_end::text AS period_end, payload
         FROM analytics.report WHERE workspace_id = $1`,
        [workspace.workspaceId],
      );

      return { month, rows, workspace };
    });

    const needs = [weekly];
    const check = (from, to, work, options = {}) => edge(from, to, work, { needs, ...options });
    const withMonthly = { needs: [weekly, monthly] };

    await check('report.periods', 'analytics.report.period_type', (t) => {
      t.equal('both kinds', [...new Set(monthly.rows.map((row) => row.period_type))].sort(), ['MONTH', 'WEEK']);
    }, withMonthly);

    await check('report.periods', 'analytics.report.period_start', (t) => {
      for (const row of monthly.rows) {
        if (row.period_type === 'WEEK') {
          t.equal(`${row.period_start} is a Monday`, weekStart(row.period_start), row.period_start);
        } else {
          t.equal(`${row.period_start} is the first`, monthStart(row.period_start), row.period_start);
        }
      }
    }, withMonthly);

    await check('report.periods', 'analytics.report.period_end', (t) => {
      for (const row of monthly.rows) {
        const expected =
          row.period_type === 'WEEK'
            ? addDays(row.period_start, 7)
            : monthStart(new Date(`${row.period_start}T00:00:00.000Z`).getTime() + 32 * DAY_MS);

        t.equal(`${row.period_type} ${row.period_start} ends exclusive`, row.period_end, expected);
      }
    }, withMonthly);

    await check('report.builder', 'analytics.report.generated_at', (t) => {
      t.ok('the database clock', weekly.rows.every((row) => new Date(row.generated_at) >= context.now), weekly.rows.map((row) => row.generated_at));
    });

    await check('report.builder', 'analytics.report.payload', (t) => {
      const keys = Object.keys(weekly.rows[0].payload).sort();

      t.equal('an AnalyticsReport', keys, [
        'asOf', 'categories', 'cohorts', 'comparisons', 'funnel', 'generatedAt', 'minimumSample', 'movement',
        'newApplications', 'newApplicationsPrevious', 'periodEnd', 'periodStart', 'periodType', 'reportingTimeZone',
        'stuckByStage', 'trackingStartedAt',
      ]);
    });

    await check('job.context.workspaceId', 'analytics.report.workspace_id', async (t) => {
      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.report WHERE workspace_id = $1`,
        [weekly.workspace.workspaceId],
      );

      t.equal('stored under its workspace', total, weekly.rows.length);
      t.ok('rows exist', total > 0);
    });

    await check('settings.trackingStart', 'report.periods', (t) => {
      const firstFullDay = toDate(context.daysAgo(44));

      t.ok('nothing starts before the first full day', weekly.rows.every((row) => row.period_start >= firstFullDay), weekly.rows.map((row) => row.period_start));
      t.ok('a report exists for every finished Monday after it', weekly.rows.filter((row) => row.period_type === 'WEEK').length >= 5, weekly.rows.length);
    });

    await check('config.reportingTimeZone', 'report.periods', (t) => {
      const { computeCrmAnalyticsReportPeriods } = context.loader.real('src/modules/analytics/utils/compute-crm-analytics-report-periods.util');
      const compute = (timeZone) =>
        computeCrmAnalyticsReportPeriods({
          trackingStartAt: '2026-11-01T00:00:00.000Z',
          // Sunday 20:00 in UTC is already Monday 01:00 in Karachi.
          now: '2026-11-15T20:00:00.000Z',
          timeZone,
          existingPeriods: [],
        }).map(({ periodStart }) => periodStart);

      t.equal('the week has not finished in UTC', compute('UTC').includes('2026-11-09'), false);
      t.equal('it has in Karachi', compute('Asia/Karachi').includes('2026-11-09'), true);
    });

    await check('analytics.report.period_start', 'report.periods', async (t) => {
      await context.runDaily(weekly.workspace);

      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.report WHERE workspace_id = $1`,
        [weekly.workspace.workspaceId],
      );
      const [{ details }] = await context.query(
        `SELECT details FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'daily' ORDER BY started_at DESC LIMIT 1`,
        [weekly.workspace.workspaceId],
      );

      t.equal('no new rows', total, weekly.rows.length);
      t.equal('nothing built', details.reportsBuilt, 0);
    });

    await check('report.periods', 'report.builder', (t) => {
      const moveWeek = weekStart(context.daysAgo(25));
      const lastWeek = weekStart(context.daysAgo(7));
      const entered = (week) => rowOf(weekly.reportOf(week).movement, 'stageKey', 'CONTACTED').enteredInPeriod;

      t.equal('the period of the move', entered(moveWeek), 1);
      t.equal('another period', entered(lastWeek), 0);
    });

    await check('metric.newApplications', 'report.builder', (t) => {
      const week = weekStart(context.daysAgo(21));
      const report = weekly.reportOf(week);
      const next = weekly.reportOf(addDays(week, 7));

      t.equal("ben's week", report.newApplications, 1);
      t.equal('the week after has it as previous', next.newApplicationsPrevious, 1);
    });

    await check('metric.movement', 'report.builder', (t) => {
      const report = weekly.reportOf(weekStart(context.daysAgo(25)));

      t.equal('left NEW', rowOf(report.movement, 'stageKey', 'NEW').leftInPeriod >= 1, true);
      t.equal('count as of generation', rowOf(report.movement, 'stageKey', 'NEW').countNow, 3);
    });

    await check('metric.categoryRows', 'report.builder', (t) => {
      const report = weekly.reportOf(weekStart(context.daysAgo(10)));
      const row = rowOf(report.categories.rows, 'key', 'AI_SOFTWARE');

      t.equal('track and program', report.categories.groupBy, 'TRACK_PROGRAM');
      t.equal('people as of generation', row.people, 2);
      t.equal('submissions of the period', row.newApplications, 1);
    });

    await check('metric.stuckByStage', 'report.builder', (t) => {
      const [{ payload }] = weekly.rows;

      t.equal('NEW', rowOf(payload.stuckByStage, 'stageKey', 'NEW').count, 1);
    });

    await check('metric.comparisons', 'report.builder', (t) => {
      const report = weekly.reportOf(weekStart(context.daysAgo(10)));

      t.equal('new applications first', report.comparisons[0].metricKey, 'NEW_APPLICATIONS');
      t.equal('one per stage after it', report.comparisons.length, 1 + report.movement.length);
    });

    await check('metric.cohortTable', 'report.builder', (t) => {
      const monthRow = monthly.rows.find((row) => row.period_type === 'MONTH' && row.period_start === monthly.month);
      const weekRow = monthly.rows.find((row) => row.period_type === 'WEEK');

      t.equal('monthly has cohorts', monthRow.payload.cohorts.map(({ bucketStart, size }) => [bucketStart, size]), [[monthly.month, 1]]);
      t.equal('weekly has none', weekRow.payload.cohorts, []);
    }, withMonthly);

    await check('metric.stepRate', 'report.builder', async (t) => {
      const [{ payload }] = weekly.rows.filter((row) => row.period_type === 'WEEK');
      const dateTo = addDays(payload.periodEnd, -1);
      const page = await context.page.funnel(weekly.workspace, { dateTo });
      const { asOf: _reportAsOf, ...reportFunnel } = payload.funnel;
      const { asOf: _pageAsOf, ...pageFunnel } = page;

      t.equal('the same method gives the same funnel', reportFunnel, pageFunnel);
    });

    await check('metric.queryContext', 'report.builder', (t) => {
      const [{ payload, generated_at: generatedAt }] = weekly.rows;

      t.equal('asOf', payload.asOf, toIso(generatedAt));
      t.equal('tracking start', payload.trackingStartedAt, weekly.workspace.trackingStart.toISOString());
      t.equal('zone', payload.reportingTimeZone, 'UTC');
    });

    // ---- the list
    const list = () => context.page.reports(weekly.workspace);

    await check('analytics.report.period_type', 'payload.reports[].periodType', async (t) => {
      t.equal('as stored', (await list()).map(({ periodType }) => periodType), weekly.rows.map((row) => row.period_type));
    });

    await check('analytics.report.period_start', 'payload.reports[].periodStart', async (t) => {
      t.equal('newest first', (await list()).map(({ periodStart }) => periodStart), weekly.rows.map((row) => row.period_start));
    }, { field: 'period_start' });

    await check('analytics.report.period_end', 'payload.reports[].periodEnd', async (t) => {
      t.equal('as stored', (await list()).map(({ periodEnd }) => periodEnd), weekly.rows.map((row) => row.period_end));
    });

    await check('analytics.report.generated_at', 'payload.reports[].generatedAt', async (t) => {
      t.equal('as stored', (await list()).map(({ generatedAt }) => generatedAt), weekly.rows.map((row) => toIso(row.generated_at)));
    });

    await check('analytics.report.workspace_id', 'payload.reports[].periodStart', async (t) => {
      const empty = await context.createWorkspace();

      await context.runSync(empty);
      t.equal("another workspace's reports never appear", await context.page.reports(empty), []);
    }, { field: 'workspace_id' });

    // ---- one report, read back
    const stored = (periodStart) => weekly.reportOf(periodStart);
    const read = (periodStart) => context.page.report(weekly.workspace, 'WEEK', periodStart);
    const week = () => weekStart(context.daysAgo(10));

    await check('report.periods', 'payload.report.periodType', async (t) => {
      t.equal('kind', (await read(week())).periodType, 'WEEK');
    });

    await check('report.periods', 'payload.report.periodStart', async (t) => {
      t.equal('start', (await read(week())).periodStart, week());
    });

    await check('report.periods', 'payload.report.periodEnd', async (t) => {
      t.equal('exclusive end', (await read(week())).periodEnd, addDays(week(), 7));
    });

    await check('metric.queryContext', 'payload.report.generatedAt', async (t) => {
      const row = weekly.rows.find((candidate) => candidate.period_start === week());

      t.equal('the stored time', (await read(week())).generatedAt, toIso(row.generated_at));
    });

    const readBack = (part, field) => async (t) => {
      const report = await read(week());

      t.ok(`${part} is the stored copy`, util.isDeepStrictEqual(report[part], stored(week())[part]));
      t.ok(`${part} is present`, report[part] !== undefined);

      if (field !== undefined) field(t, report[part]);
    };

    await check('analytics.report.payload', 'payload.report.newApplications', readBack('newApplications', (t, value) => t.equal('value', value, 1)));
    await check('analytics.report.payload', 'payload.report.newApplicationsPrevious', readBack('newApplicationsPrevious'));
    await check('analytics.report.payload', 'payload.report.categories', readBack('categories', (t, value) => t.ok('counts only', !JSON.stringify(value).includes('displayName'))));
    await check('analytics.report.payload', 'payload.report.funnel', readBack('funnel', (t, value) => t.equal('NEW entered', rowOf(value.rows, 'stageKey', 'NEW').entered, 3)));
    await check('analytics.report.payload', 'payload.report.movement[]', readBack('movement'));
    await check('analytics.report.payload', 'payload.report.stuckByStage[]', readBack('stuckByStage'));
    await check('analytics.report.payload', 'payload.report.cohorts[]', readBack('cohorts'));

    const comparisonField = (name, expected) => async (t) => {
      const report = await read(week());
      const row = rowOf(report.comparisons, 'metricKey', 'NEW_APPLICATIONS');

      t.equal(name, row[name], expected);
      t.equal('the stored copy', report.comparisons, stored(week()).comparisons);
    };

    await check('analytics.report.payload', 'payload.report.comparisons[].metricKey', comparisonField('metricKey', 'NEW_APPLICATIONS'));
    await check('analytics.report.payload', 'payload.report.comparisons[].label', comparisonField('label', 'New applications'));
    await check('analytics.report.payload', 'payload.report.comparisons[].current', comparisonField('current', 1));
    await check('analytics.report.payload', 'payload.report.comparisons[].previous', (t) =>
      // The submission at age 21 falls in the week before on some weekdays.
      comparisonField('previous', weekStart(context.daysAgo(21)) === addDays(week(), -7) ? 1 : 0)(t),
    );
    await check('analytics.report.payload', 'payload.report.comparisons[].isSignificant', comparisonField('isSignificant', false));
  },
};
