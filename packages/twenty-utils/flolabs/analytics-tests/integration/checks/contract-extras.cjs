'use strict';
// Section 9 cases the other sections leave open. Every expected number is hand-counted
// from the people written here.
const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

const DAY_MS = 86_400_000;

const buildLocalDate = (date) => date.toISOString().slice(0, 10);

const SAMPLE_PEOPLE = [
  ['A', 40, 'CONTACTED', [['NEW', 'CONTACTED', 35]]],
  ['B', 40, 'CONTACTED', [['NEW', 'CONTACTED', 20]]],
  ['C', 40, 'NOT_INTERESTED', [['NEW', 'NOT_INTERESTED', 30]]],
  ['D', 40, 'NEW', []],
  ['E', 5, 'CONTACTED', [['NEW', 'CONTACTED', 1]]],
  ['F', 5, 'NEW', []],
  ['G', 40, 'ATTENDED', [['NEW', 'ATTENDED', 35]]],
  ['H', 100, 'CONTACTED', [['NEW', 'CONTACTED', 10]]],
];

const pickRow = (funnel, stageKey) => {
  const row = funnel.rows.find((candidate) => candidate.stageKey === stageKey);

  return (
    row && {
      entered: row.entered,
      eligible: row.eligible,
      reachedNext: row.reachedNext,
      exited: row.exited,
      timedOut: row.timedOut,
      inWindow: row.inWindow,
      completedStays: row.completedStays,
    }
  );
};

const EMPTY_ROW = { entered: 0, eligible: 0, reachedNext: 0, exited: 0, timedOut: 0, inWindow: 0, completedStays: 0 };

const EXPECTED_SAMPLE_ROWS = {
  NEW: { entered: 7, eligible: 5, reachedNext: 2, exited: 1, timedOut: 2, inWindow: 2, completedStays: 5 },
  CONTACTED: { entered: 4, eligible: 3, reachedNext: 1, exited: 0, timedOut: 2, inWindow: 1, completedStays: 0 },
  BEFORE_MEETING: { entered: 1, eligible: 1, reachedNext: 1, exited: 0, timedOut: 0, inWindow: 0, completedStays: 0 },
  SATURDAY_MEETING: { entered: 1, eligible: 1, reachedNext: 1, exited: 0, timedOut: 0, inWindow: 0, completedStays: 0 },
  ATTENDED: { entered: 1, eligible: 1, reachedNext: 0, exited: 0, timedOut: 1, inWindow: 0, completedStays: 0 },
  SECOND_MEETING: EMPTY_ROW,
  AGREEMENT_SENT: EMPTY_ROW,
  SIGNED: EMPTY_ROW,
};

module.exports = {
  title: 'Contract extras: restore, three-way totals, replayed sample, stuck cap, cohorts, significance',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, now, transitionsOf, runSyncJob, runDailyJob, requirement }) => {
    const requires = [requirement('CrmAnalyticsMetricsService')];
    const reader = createMetricsReader({ loader, services });

    const newTrackedWorkspace = async (trackingStartAge = 200) => {
      const workspace = await newWorkspace();

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(trackingStartAge).toISOString());

      return workspace;
    };

    await harness.check({ id: 'X1', title: 'Soft delete then restore: counts drop then return, no new transition, no reconcile row', requires }, async (t) => {
      const workspace = await newTrackedWorkspace();
      const { insertPerson, insertStageChange, softDeletePerson } = workspace.fixtures;
      const moved = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });

      await insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });
      await insertStageChange({ personId: moved, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(10) });
      await runSyncJob(workspace.workspaceId);

      const countsNow = async () => {
        const overview = await reader.getOverview(workspace.workspaceId);
        const funnel = await reader.getFunnel(workspace.workspaceId);

        return {
          total: overview.figures.totalContacts,
          cohort: funnel.cohortSize,
          contacted: pickRow(funnel, 'CONTACTED').entered,
          transitions: (await transitionsOf(workspace.workspaceId)).length,
        };
      };

      t.equal('before', await countsNow(), { total: 2, cohort: 2, contacted: 1, transitions: 1 });

      await softDeletePerson({ personId: moved, deletedAt: daysAgo(1) });
      await runDailyJob(workspace.workspaceId);

      t.equal('while deleted, the transition stays', await countsNow(), { total: 1, cohort: 1, contacted: 0, transitions: 1 });

      await softDeletePerson({ personId: moved, deletedAt: null });
      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      t.equal('after restore', await countsNow(), { total: 2, cohort: 2, contacted: 1, transitions: 1 });
    });

    await harness.check({ id: 'X2', title: 'Three ways to count people agree: stage totals, stored snapshot, the person table', requires }, async (t) => {
      const workspace = await newTrackedWorkspace();
      const { insertPerson } = workspace.fixtures;

      await insertPerson({ stage: 'NEW', source: 'LINKEDIN', createdAt: daysAgo(10) });
      await insertPerson({ stage: 'SIGNED_PAID', source: 'REFERRAL', createdAt: daysAgo(10) });
      await insertPerson({ stage: 'SIGNED_NON_PAID', createdAt: daysAgo(10) });
      await insertPerson({ stage: 'REJECTED_BY_US', createdAt: daysAgo(10) });
      await insertPerson({ stage: 'LEGACY_TEST', createdAt: daysAgo(10) });
      await insertPerson({ stage: null, createdAt: daysAgo(10) });
      await insertPerson({ stage: 'NEW', createdAt: daysAgo(10), deletedAt: daysAgo(1) });
      await runDailyJob(workspace.workspaceId);

      const overview = await reader.getOverview(workspace.workspaceId);
      const [{ live }] = await query(
        `SELECT count(*)::int AS live FROM ${workspace.table('person')} WHERE "deletedAt" IS NULL`,
      );
      const [{ stored, stored_sources: storedSources }] = await query(
        `SELECT COALESCE(sum(person_count) FILTER (WHERE dimension = 'all'), 0)::int AS stored,
                COALESCE(sum(person_count) FILTER (WHERE dimension = 'source'), 0)::int AS stored_sources
         FROM analytics.daily_snapshot WHERE workspace_id = $1`,
        [workspace.workspaceId],
      );

      t.equal('person table', live, 6);
      t.equal('stored all rows', stored, 6);
      t.equal('stored source rows', storedSources, 6);
      t.equal('total contacts', overview.figures.totalContacts, 6);
      t.equal(
        'stage total top rows',
        overview.stageTotals.filter((row) => row.rowKind !== 'NESTED').reduce((sum, row) => sum + row.count, 0),
        6,
      );
    });

    await harness.check({ id: 'X3', title: 'The sample survives replay: every funnel row is still the hand count', requires }, async (t) => {
      const workspace = await newTrackedWorkspace(60);
      const { insertPerson, insertStageChange } = workspace.fixtures;

      for (const [firstName, createdAge, stage, moves] of SAMPLE_PEOPLE) {
        const personId = await insertPerson({ firstName, stage, createdAt: daysAgo(createdAge) });

        for (const [before, after, age] of moves) {
          await insertStageChange({ personId, before, after, happensAt: daysAgo(age) });
        }
      }

      await runSyncJob(workspace.workspaceId);

      const first = await reader.getFunnel(workspace.workspaceId);
      const storedFirst = await transitionsOf(workspace.workspaceId);

      for (const [stageKey, expected] of Object.entries(EXPECTED_SAMPLE_ROWS)) {
        t.equal(`first read ${stageKey}`, pickRow(first, stageKey), expected);
      }

      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);
      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const second = await reader.getFunnel(workspace.workspaceId);

      t.equal('rows unchanged by replay', second.rows, first.rows);
      t.equal('cohort unchanged by replay', second.cohortSize, 7);
      t.equal('transitions unchanged by replay', await transitionsOf(workspace.workspaceId), storedFirst);
    });

    await harness.check({ id: 'X4', title: 'Stuck list: longest over limit first, 100 rows, the total still counts everyone', requires }, async (t) => {
      const workspace = await newTrackedWorkspace();

      await query(
        `INSERT INTO ${workspace.table('person')} ("nameFirstName", "nameLastName", stage, "createdAt", "updatedAt")
         SELECT 'P' || n, '', 'NEW', $1::timestamptz - (15 + n) * interval '1 day', $1::timestamptz - (15 + n) * interval '1 day'
         FROM generate_series(1, 101) AS n`,
        [now],
      );
      await workspace.fixtures.insertPerson({ firstName: 'Fresh', stage: 'NEW', createdAt: daysAgo(3) });
      await runSyncJob(workspace.workspaceId);

      const { stuck, figures, stageTotals } = await reader.getOverview(workspace.workspaceId);

      t.equal('rows are capped', stuck.rows.length, 100);
      t.equal('total counts everyone past the limit', stuck.total, 101);
      t.equal('figure matches the total', figures.stuckPeople, 101);
      t.equal('totals row counts them too', stageTotals.find((row) => row.rowKey === 'NEW')?.pastLimitCount, 101);
      t.equal('longest first', [stuck.rows[0]?.displayName, stuck.rows[0]?.daysInStage, stuck.rows[0]?.daysOverLimit], ['P101', 116, 102]);
      t.equal('last row kept', [stuck.rows[99]?.displayName, stuck.rows[99]?.daysInStage], ['P2', 17]);
      t.ok('someone inside the limit is not listed', !stuck.rows.some((row) => row.displayName === 'Fresh'));
    });

    // Four months back is past the 90-day window whatever today is.
    const today = new Date(`${buildLocalDate(now)}T00:00:00Z`);
    const oldMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 1));
    const oldCreated = new Date(oldMonthStart.getTime() + 2 * DAY_MS);
    const afterCreated = (days) => new Date(oldCreated.getTime() + days * DAY_MS);
    const buildOldMonthWorkspace = async () => {
      const workspace = await newTrackedWorkspace(200);
      const { insertPerson, insertStageChange } = workspace.fixtures;
      const signed = await insertPerson({ stage: 'SIGNED_PAID', createdAt: oldCreated });
      const contacted = await insertPerson({ stage: 'CONTACTED', createdAt: oldCreated });
      const exited = await insertPerson({ stage: 'NOT_INTERESTED', createdAt: oldCreated });

      await insertPerson({ stage: 'NEW', createdAt: oldCreated });
      await insertPerson({ stage: 'NEW', createdAt: daysAgo(5) });
      await insertStageChange({ personId: signed, before: 'NEW', after: 'SIGNED_PAID', happensAt: afterCreated(10) });
      await insertStageChange({ personId: contacted, before: 'NEW', after: 'CONTACTED', happensAt: afterCreated(5) });
      await insertStageChange({ personId: exited, before: 'NEW', after: 'NOT_INTERESTED', happensAt: afterCreated(3) });
      await runSyncJob(workspace.workspaceId);

      return workspace;
    };

    const oldMonth = requires[0].isAvailable
      ? await harness.fixture('X0', 'one finished month and one person too recent', buildOldMonthWorkspace)
      : null;

    await harness.check({ id: 'X5', title: 'Cohort table: a mature month has rates, a recent one only the so-far form', requires, needs: [oldMonth] }, async (t) => {
      const { cohorts } = await reader.getTrends(oldMonth.workspaceId, 'OVERALL_CONVERSION', null, { period: 'MONTH' });
      const oldRow = cohorts.find((row) => row.bucketStart === buildLocalDate(oldMonthStart));
      const recentRow = cohorts.find((row) => row.bucketStart === buildLocalDate(new Date(Date.UTC(daysAgo(5).getUTCFullYear(), daysAgo(5).getUTCMonth(), 1))));
      const cellOf = (row, stageKey) => {
        const cell = row?.cells.find((candidate) => candidate.stageKey === stageKey);

        return cell && [cell.entered, cell.eligible, cell.rate, cell.isMature];
      };

      t.equal('old month size', oldRow?.size, 4);
      t.equal('old month overall', oldRow?.overallRate, 1 / 4);
      t.equal('old month NEW cell', cellOf(oldRow, 'NEW'), [4, 4, 2 / 4, true]);
      t.equal('recent month size', recentRow?.size, 1);
      t.equal('recent month overall stays unknown', recentRow?.overallRate, null);
      t.equal('recent month NEW cell', cellOf(recentRow, 'NEW'), [1, 0, null, false]);
    });

    await harness.check({ id: 'X6', title: 'Rate trend lines: the mature month has its number, recent months stay null, never 0', requires, needs: [oldMonth] }, async (t) => {
      const overall = await reader.getTrends(oldMonth.workspaceId, 'OVERALL_CONVERSION', null, { period: 'MONTH' });
      const dropOff = await reader.getTrends(oldMonth.workspaceId, 'DROP_OFF', 'NEW', { period: 'MONTH' });
      const valueAt = (trends) => trends.series.find((point) => point.bucketStart === buildLocalDate(oldMonthStart))?.value;
      const others = (trends) =>
        trends.series.filter((point) => point.bucketStart !== buildLocalDate(oldMonthStart) && point.value !== null);

      t.equal('overall conversion', valueAt(overall), 1 / 4);
      t.equal('drop-off from NEW', valueAt(dropOff), 2 / 4);
      t.equal('no other month has an overall number', others(overall), []);
      t.equal('no other month has a drop-off number', others(dropOff), []);
    });

    await harness.check({ id: 'X7', title: 'Report comparison: 30 to 40 is significant, 40 to 33 is not, an empty previous is not', requires: [...requires, requirement('CrmAnalyticsReportService')] }, async (t) => {
      const mondayOfThisWeek = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
      const start = new Date(mondayOfThisWeek.getTime() - 21 * DAY_MS);
      const workspace = await newWorkspace();
      const { insertForm, insertPerson } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', start.toISOString());

      const formId = await insertForm({ name: 'Internship Application' });
      const personId = await insertPerson({ stage: 'NEW', createdAt: new Date(start.getTime() + DAY_MS) });

      for (const [weekOffset, count] of [[0, 30], [7, 40], [14, 33]]) {
        await query(
          `INSERT INTO ${workspace.table('_formSubmission')} ("formId", "personId", "submittedAt")
           SELECT $1::uuid, $2::uuid, $3::timestamptz + n * interval '1 minute' FROM generate_series(1, $4::int) AS n`,
          [formId, personId, new Date(start.getTime() + weekOffset * DAY_MS + DAY_MS), count],
        );
      }

      await runDailyJob(workspace.workspaceId);

      const rows = await query(
        `SELECT payload FROM analytics.report WHERE workspace_id = $1 AND period_type = 'WEEK' ORDER BY period_start`,
        [workspace.workspaceId],
      );
      const comparison = (row) => {
        const entry = row?.payload.comparisons.find((candidate) => candidate.metricKey === 'NEW_APPLICATIONS');

        return entry && [entry.current, entry.previous, entry.isSignificant];
      };

      t.equal('three weeks', rows.length, 3);
      t.equal('week 1', comparison(rows[0]), [30, 0, false]);
      t.equal('week 2', comparison(rows[1]), [40, 30, true]);
      t.equal('week 3', comparison(rows[2]), [33, 40, false]);
    });
  },
};
