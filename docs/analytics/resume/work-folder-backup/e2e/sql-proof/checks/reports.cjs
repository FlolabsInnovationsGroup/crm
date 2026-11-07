'use strict';
// Reports through the real daily job. Dates are worked out from a Monday so the expected
// periods hold on any day this runs.
const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

const DAY_MS = 86_400_000;

const buildLocalDate = (date) => date.toISOString().slice(0, 10);

const utcMidnight = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

module.exports = {
  title: 'Reports: built once, frozen on rerun',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, logRowsOf, runSyncJob, runDailyJob, requirement, now }) => {
    const required = [requirement('CrmAnalyticsReportService'), requirement('CrmAnalyticsMetricsService')];
    const reader = createMetricsReader({ loader, services });

    const readReports = (workspaceId) =>
      query(
        `SELECT period_type, period_start::text AS period_start, period_end::text AS period_end, generated_at, payload::text AS payload_text, payload
         FROM analytics.report WHERE workspace_id = $1 ORDER BY period_start, period_type`,
        [workspaceId],
      );

    // Three whole weeks since tracking start: at most 27 days, so no month has finished.
    const buildWeeklyWorkspace = async () => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange, insertForm, insertSubmission } = workspace.fixtures;
      const today = utcMidnight(now);
      const mondayOfThisWeek = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
      const start = new Date(mondayOfThisWeek.getTime() - 21 * DAY_MS);
      const at = (dayOffset) => new Date(start.getTime() + dayOffset * DAY_MS + 3_600_000);

      workspace.start = start;
      workspace.weeks = [0, 7, 14].map((offset) => buildLocalDate(new Date(start.getTime() + offset * DAY_MS)));
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', start.toISOString());

      const form = await insertForm({ name: 'Internship Application' });

      const first = await insertPerson({ firstName: 'Secretname', lastName: 'Firstperson', stage: 'CONTACTED', createdAt: at(1), positions: ['FINANCE_INTERN'], source: 'LINKEDIN' });

      await insertSubmission({ formId: form, personId: first, submittedAt: at(1) });
      await insertStageChange({ personId: first, before: 'NEW', after: 'CONTACTED', happensAt: at(2) });

      const second = await insertPerson({ stage: 'CONTACTED', createdAt: at(8), positions: ['AI_AGI_INTERN'], source: 'REFERRAL' });

      await insertSubmission({ formId: form, personId: second, submittedAt: at(8) });
      await insertStageChange({ personId: second, before: 'NEW', after: 'CONTACTED', happensAt: at(9) });

      const third = await insertPerson({ stage: 'NEW', createdAt: at(9), positions: ['AI_AGI_INTERN'] });

      await insertSubmission({ formId: form, personId: third, submittedAt: at(9) });

      const imported = await insertPerson({ stage: 'CONTACTED', createdAt: new Date(start.getTime() - 50 * DAY_MS) });

      await insertStageChange({ personId: imported, before: 'NEW', after: 'CONTACTED', happensAt: at(16) });

      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      return workspace;
    };

    const weekly = required.every((requirementEntry) => requirementEntry.isAvailable)
      ? await harness.fixture('Q0', 'three finished weeks', buildWeeklyWorkspace)
      : null;

    await harness.check({ id: 'Q1', title: 'Daily job builds exactly the finished periods, none for the current week', requires: required, needs: [weekly] }, async (t) => {
      const rows = await readReports(weekly.workspaceId);
      const [logRow] = await logRowsOf(weekly.workspaceId, 'daily');

      t.equal('periods', rows.map((row) => [row.period_type, row.period_start]), weekly.weeks.map((week) => ['WEEK', week]));
      t.equal('period_end is exclusive', rows[0]?.period_end, weekly.weeks[1]);
      t.equal('reportsBuilt', logRow?.details?.reportsBuilt, 3);
      t.equal('status', logRow?.status, 'ok');

      weekly.frozen = rows;
    });

    await harness.check({ id: 'Q2', title: 'Report numbers: applications by submittedAt, movement by event date', requires: required, needs: [weekly] }, async (t) => {
      const [first, second, third] = weekly.frozen.map((row) => row.payload);
      const entered = (report, stageKey) => report?.movement.find((row) => row.stageKey === stageKey)?.enteredInPeriod;

      t.equal('week 1 applications', [first?.newApplications, first?.newApplicationsPrevious], [1, 0]);
      t.equal('week 2 applications', [second?.newApplications, second?.newApplicationsPrevious], [2, 1]);
      t.equal('week 3 applications', [third?.newApplications, third?.newApplicationsPrevious], [0, 2]);
      t.equal('movement into CONTACTED', [entered(first, 'CONTACTED'), entered(second, 'CONTACTED'), entered(third, 'CONTACTED')], [1, 1, 1]);
      t.equal('comparison', second?.comparisons.find((row) => row.metricKey === 'NEW_APPLICATIONS'), {
        metricKey: 'NEW_APPLICATIONS',
        label: 'New applications',
        current: 2,
        previous: 1,
        isSignificant: false,
      });
      t.equal('funnel basis is everyone up to the period end', [first?.funnel.cohortSize, second?.funnel.cohortSize, third?.funnel.cohortSize], [1, 3, 3]);
      t.equal('weekly reports have no cohorts', first?.cohorts, []);
      t.equal('category new applications are the period', second?.categories.rows.find((row) => row.key === 'AI_AGI_INTERN')?.newApplications, 2);
      t.equal('current people at generation', first?.categories.distinctPeople, 4);
    });

    await harness.check({ id: 'Q3', title: 'Report holds counts only, no names', requires: required, needs: [weekly] }, async (t) => {
      for (const row of weekly.frozen) {
        t.ok(`${row.period_start} has no first name`, !row.payload_text.includes('Secretname'));
        t.ok(`${row.period_start} has no last name`, !row.payload_text.includes('Firstperson'));
      }
    });

    await harness.check({ id: 'Q4', title: 'Frozen on rerun: CRM changes rewrite nothing, byte for byte', requires: required, needs: [weekly] }, async (t) => {
      const { insertPerson } = weekly.fixtures;

      await insertPerson({ stage: 'ATTENDED', createdAt: new Date(weekly.start.getTime() + 3_600_000), positions: ['FINANCE_INTERN'] });
      await runDailyJob(weekly.workspaceId);

      const rows = await readReports(weekly.workspaceId);
      const logRows = await logRowsOf(weekly.workspaceId, 'daily');

      t.equal('reportsBuilt on rerun', logRows.at(-1)?.details?.reportsBuilt, 0);
      t.equal('rows', rows.map((row) => [row.period_start, row.generated_at, row.payload_text]), weekly.frozen.map((row) => [row.period_start, row.generated_at, row.payload_text]));
    });

    await harness.check({ id: 'Q5', title: 'Page reads of reports: list newest first, one report is the stored payload', requires: required, needs: [weekly] }, async (t) => {
      const report = services.get('CrmAnalyticsReportService');
      const list = await report.listReports(weekly.workspaceId);
      const stored = await report.getReport({ workspaceId: weekly.workspaceId, periodType: 'WEEK', periodStart: weekly.weeks[1] });
      const missing = await report.getReport({ workspaceId: weekly.workspaceId, periodType: 'MONTH', periodStart: weekly.weeks[1] });

      t.equal('list', list.map((item) => [item.periodType, item.periodStart, item.periodEnd]), [
        ['WEEK', weekly.weeks[2], buildLocalDate(new Date(weekly.start.getTime() + 21 * DAY_MS))],
        ['WEEK', weekly.weeks[1], weekly.weeks[2]],
        ['WEEK', weekly.weeks[0], weekly.weeks[1]],
      ]);
      t.equal('generatedAt is the build time', list[0]?.generatedAt, weekly.frozen[2]?.generated_at.toISOString());
      t.equal('stored payload', stored, weekly.frozen[1]?.payload);
      t.equal('absent report', missing, null);
    });

    await harness.check({ id: 'Q6', title: 'A report built now equals the page for the same cutoff', requires: required, needs: [weekly] }, async (t) => {
      const payload = weekly.frozen[1]?.payload;
      const lastDay = buildLocalDate(new Date(weekly.start.getTime() + 13 * DAY_MS));
      const fresh = await newWorkspace();

      // The frozen report predates the Q4 person, so compare on a workspace with no later edits.
      fresh.vars.set('CRM_ANALYTICS_TRACKING_START_AT', weekly.start.toISOString());

      const person = await fresh.fixtures.insertPerson({ stage: 'CONTACTED', createdAt: new Date(weekly.start.getTime() + 8 * DAY_MS + 3_600_000) });

      await fresh.fixtures.insertStageChange({ personId: person, before: 'NEW', after: 'CONTACTED', happensAt: new Date(weekly.start.getTime() + 9 * DAY_MS) });
      await runSyncJob(fresh.workspaceId);
      await runDailyJob(fresh.workspaceId);

      const [, stored] = await readReports(fresh.workspaceId);
      const page = await reader.getFunnel(fresh.workspaceId, { dateTo: lastDay });

      t.equal('funnel rows', stored?.payload.funnel.rows, page.rows);
      t.ok('week two exists in the first check too', payload !== undefined);
    });

    await harness.check({ id: 'Q7', title: 'Catch-up: at most 8 per run, oldest first, months carry cohorts, all built exactly once', requires: required, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const today = utcMidnight(now);
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1));

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', start.toISOString());
      await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: new Date(start.getTime() + DAY_MS) });

      await runDailyJob(workspace.workspaceId);

      const afterFirst = await readReports(workspace.workspaceId);

      t.equal('first run is capped', afterFirst.length, 8);

      let previousCount = afterFirst.length;
      let runs = 1;

      while (runs < 8) {
        await runDailyJob(workspace.workspaceId);
        runs += 1;

        const count = (await readReports(workspace.workspaceId)).length;

        if (count === previousCount) break;

        previousCount = count;
      }

      const final = await readReports(workspace.workspaceId);
      const months = final.filter((row) => row.period_type === 'MONTH');
      const weeks = final.filter((row) => row.period_type === 'WEEK');
      const expectedMonths = [3, 2, 1].map((back) => buildLocalDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1))));
      const firstMonday = (() => {
        const day = (start.getUTCDay() + 6) % 7;

        return new Date(start.getTime() + (day === 0 ? 0 : 7 - day) * DAY_MS);
      })();
      const mondayOfThisWeek = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
      const expectedWeeks = Math.round((mondayOfThisWeek.getTime() - firstMonday.getTime()) / (7 * DAY_MS));

      const keyOf = (row) => `${row.period_type} ${row.period_start}`;
      const earliestEight = [...final]
        .sort((first, second) => (first.period_end < second.period_end ? -1 : first.period_end > second.period_end ? 1 : 0))
        .slice(0, 8)
        .map(keyOf)
        .sort();

      t.equal('oldest first: the first run built the 8 earliest to finish', afterFirst.map(keyOf).sort(), earliestEight);
      t.equal('months', months.map((row) => row.period_start), expectedMonths);
      t.equal('weeks', weeks.length, expectedWeeks);
      t.ok('months have cohorts', months.every((row) => Array.isArray(row.payload.cohorts) && row.payload.cohorts.length > 0), months.map((row) => row.payload.cohorts));
      t.ok('every report keeps the first build', afterFirst.every((row) => final.find((candidate) => candidate.period_type === row.period_type && candidate.period_start === row.period_start)?.payload_text === row.payload_text));
    });

    await harness.check({ id: 'Q8', title: 'A failed reconcile leaves reports for the next run, and the job says failed', requires: required, needs: [] }, async (t) => {
      const workspace = await newWorkspace();

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(30).toISOString());
      await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });

      const sync = services.get('CrmAnalyticsSyncService');
      const realReconcile = sync.reconcile;
      let thrown;

      sync.reconcile = async () => {
        throw new Error('forced reconcile failure');
      };

      try {
        await runDailyJob(workspace.workspaceId);
      } catch (error) {
        thrown = error;
      } finally {
        sync.reconcile = realReconcile;
      }

      const [logRow] = await logRowsOf(workspace.workspaceId, 'daily');

      t.ok('rethrown', thrown instanceof Error, thrown);
      t.equal('status', logRow?.status, 'failed');
      t.equal('reconcile step', logRow?.details?.steps?.reconcile?.status, 'failed');
      t.equal('reports step skipped', logRow?.details?.steps?.reports?.status, 'skipped');
      t.equal('no report built', await readReports(workspace.workspaceId), []);

      await runDailyJob(workspace.workspaceId);

      const logRows = await logRowsOf(workspace.workspaceId, 'daily');

      t.equal('next run recovers', logRows.at(-1)?.status, 'ok');
      t.ok('reports catch up', (await readReports(workspace.workspaceId)).length > 0);
    });
  },
};
