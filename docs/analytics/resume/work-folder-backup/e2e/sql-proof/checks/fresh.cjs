'use strict';
// Runs first, on a database with no analytics schema at all (contract section 3,
// "Before any job ran" and "Fresh database").
const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

module.exports = {
  title: 'Fresh database: page reads before any job, first sync creates storage',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, requirement, transitionsOf, logRowsOf, runSyncJob }) => {
    const metaRequired = requirement('CrmAnalyticsMetaService');
    const metricsRequired = requirement('CrmAnalyticsMetricsService');
    const reportRequired = requirement('CrmAnalyticsReportService');
    const reader = createMetricsReader({ loader, services });

    const workspace = await harness.fixture('A0', 'workspace on a database with no analytics schema', async () => {
      const created = await newWorkspace();

      created.trackingStart = daysAgo(30);
      created.vars.set('CRM_ANALYTICS_TRACKING_START_AT', created.trackingStart.toISOString());

      const personId = await created.fixtures.insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(10) });

      await created.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(5) });

      return created;
    });

    await harness.check({ id: 'A1', title: 'Meta says NEVER_SYNCED and creates nothing', requires: [metaRequired], needs: [workspace] }, async (t) => {
      const meta = await services.get('CrmAnalyticsMetaService').getMeta(workspace.workspaceId);
      const [{ exists }] = await query(`SELECT to_regnamespace('analytics') IS NOT NULL AS exists`);

      t.equal('state', meta.state, 'NEVER_SYNCED');
      t.equal('sync', meta.sync, {
        lastSuccessfulSyncAt: null,
        lastReconciliationAt: null,
        lastAttemptAt: null,
        lastAttemptStatus: null,
        isStale: false,
        restoredInLastReconciliation: null,
      });
      t.equal('page read created nothing', exists, false);
    });

    await harness.check({ id: 'A2', title: 'Metrics and reports read as empty, with no error, before storage exists', requires: [metricsRequired, reportRequired], needs: [workspace] }, async (t) => {
      const report = services.get('CrmAnalyticsReportService');

      t.equal('overview', await reader.getOverview(workspace.workspaceId), null);
      t.equal('funnel', await reader.getFunnel(workspace.workspaceId), null);
      t.equal('categories', await reader.getCategories(workspace.workspaceId, 'SOURCE'), null);
      t.equal('trends', await reader.getTrends(workspace.workspaceId, 'TOTAL_CONTACTS', null), null);
      t.equal('report list', await report.listReports(workspace.workspaceId), []);
      t.equal('one report', await report.getReport({ workspaceId: workspace.workspaceId, periodType: 'WEEK', periodStart: '2026-10-26' }), null);
    });

    await harness.check({ id: 'A3', title: 'First sync job creates storage, reads since tracking start and enqueues the baseline once', needs: [workspace] }, async (t) => {
      services.queueCalls.length = 0;
      await runSyncJob(workspace.workspaceId);

      const rows = await transitionsOf(workspace.workspaceId);
      const logRows = await logRowsOf(workspace.workspaceId, 'sync');

      t.equal('rows read', rows.length, 1);
      t.equal('log row', [logRows[0]?.status, logRows[0]?.processed_count], ['ok', 1]);
      t.equal('daily job enqueued', services.queueCalls, [
        { jobName: 'CrmAnalyticsWorkspaceDailyJob', data: { workspaceId: workspace.workspaceId } },
      ]);
    });

    await harness.check({ id: 'A4', title: 'Dropping the schema returns the page to NEVER_SYNCED and the next job recreates it', requires: [metaRequired], needs: [workspace] }, async (t) => {
      await query('DROP SCHEMA analytics CASCADE');

      const before = await services.get('CrmAnalyticsMetaService').getMeta(workspace.workspaceId);

      t.equal('state after drop', before.state, 'NEVER_SYNCED');

      await runSyncJob(workspace.workspaceId);

      const after = await services.get('CrmAnalyticsMetaService').getMeta(workspace.workspaceId);

      t.equal('state after job', after.state, 'READY');
      await query('DROP SCHEMA analytics CASCADE');
    });
  },
};
