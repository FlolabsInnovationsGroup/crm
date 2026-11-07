'use strict';
// Sync state rules of contract section 5, from sync_log rows.
module.exports = {
  title: 'Meta: page state and sync line',
  run: async ({ harness, services, query, newWorkspace, daysAgo, minutesAgo, runSyncJob, runDailyJob, requirement }) => {
    const requires = [requirement('CrmAnalyticsMetaService')];
    const meta = () => services.get('CrmAnalyticsMetaService');

    const newMetaWorkspace = async (options) => {
      const workspace = await newWorkspace(options);

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      return workspace;
    };

    const insertLog = ({ workspaceId, jobName = 'sync', status, startedAt, finishedAt = startedAt, restoredCount = 0 }) =>
      query(
        `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, finished_at, status, restored_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, jobName, startedAt, status === 'running' ? null : finishedAt, status, restoredCount],
      );

    await harness.check({ id: 'Z1', title: 'After a real sync: READY, not stale, last attempt OK', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await runSyncJob(workspace.workspaceId);

      const result = await meta().getMeta(workspace.workspaceId);
      const [{ finished_at: finishedAt }] = await query(
        `SELECT finished_at FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'sync'`,
        [workspace.workspaceId],
      );

      t.equal('state', result.state, 'READY');
      t.equal('lastSuccessfulSyncAt', result.sync.lastSuccessfulSyncAt, finishedAt.toISOString());
      t.equal('status', result.sync.lastAttemptStatus, 'OK');
      t.equal('isStale', result.sync.isStale, false);
      t.equal('no reconciliation yet', [result.sync.lastReconciliationAt, result.sync.restoredInLastReconciliation], [null, null]);
      t.equal('tracking start from the override', result.trackingStartedAt, workspace.vars.get('CRM_ANALYTICS_TRACKING_START_AT'));
    });

    await harness.check({ id: 'Z2', title: 'A daily success cannot hide a stopped sync: stale stays true', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, status: 'ok', startedAt: minutesAgo(120) });
      await runDailyJob(workspace.workspaceId);

      const { sync } = await meta().getMeta(workspace.workspaceId);

      t.equal('isStale', sync.isStale, true);
      t.ok('reconciliation time comes from the daily row', sync.lastReconciliationAt !== null, sync);
      t.equal('restored', sync.restoredInLastReconciliation, 0);
    });

    await harness.check({ id: 'Z3', title: 'A young running row is ignored in favour of the row before it', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, status: 'failed', startedAt: minutesAgo(20) });
      await insertLog({ workspaceId: workspace.workspaceId, status: 'running', startedAt: minutesAgo(2) });

      const { sync } = await meta().getMeta(workspace.workspaceId);

      t.equal('status', sync.lastAttemptStatus, 'FAILED');
      t.equal('attempt time', sync.lastAttemptAt, minutesAgo(20).toISOString());
    });

    await harness.check({ id: 'Z4', title: 'An old running row was killed mid-job and reads FAILED', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, status: 'ok', startedAt: minutesAgo(50) });
      await insertLog({ workspaceId: workspace.workspaceId, status: 'running', startedAt: minutesAgo(35) });

      const { sync } = await meta().getMeta(workspace.workspaceId);

      t.equal('status', sync.lastAttemptStatus, 'FAILED');
      t.equal('attempt time', sync.lastAttemptAt, minutesAgo(35).toISOString());
      t.equal('not stale yet', sync.isStale, false);
    });

    await harness.check({ id: 'Z5', title: 'No sync row: null status, NEVER_SYNCED, not stale', requires }, async (t) => {
      const workspace = await newMetaWorkspace();
      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('state', result.state, 'NEVER_SYNCED');
      t.equal('status', result.sync.lastAttemptStatus, null);
      t.equal('isStale', result.sync.isStale, false);
    });

    await harness.check({ id: 'Z6', title: 'A failed row with no success ever: stale and FAILED, not READY', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, status: 'failed', startedAt: minutesAgo(5) });

      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('state', result.state, 'NEVER_SYNCED');
      t.equal('status', result.sync.lastAttemptStatus, 'FAILED');
      t.equal('isStale', result.sync.isStale, true);
    });

    await harness.check({ id: 'Z11', title: 'First sync still running: NEVER_SYNCED, not yet stale', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, status: 'running', startedAt: minutesAgo(1) });

      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('state', result.state, 'NEVER_SYNCED');
      t.equal('status', result.sync.lastAttemptStatus, null);
      t.equal('isStale', result.sync.isStale, false);
    });

    await harness.check({ id: 'Z7', title: 'No stage field: NO_STAGE_FIELD, whatever the log says', requires }, async (t) => {
      const workspace = await newMetaWorkspace({ personFields: 'NONE', forms: 'NONE' });

      await runSyncJob(workspace.workspaceId);

      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('state', result.state, 'NO_STAGE_FIELD');
      t.equal('fields', [result.fields.stage, result.fields.positionsAppliedFor, result.fields.applicantSource, result.fields.hasFormSubmissionObject], ['MISSING', 'MISSING', 'MISSING', false]);
      t.equal('last attempt skipped', result.sync.lastAttemptStatus, 'SKIPPED');
    });

    await harness.check({ id: 'Z8', title: 'Off switch: DISABLED', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      workspace.vars.set('CRM_ANALYTICS_DISABLED', true);

      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('state', result.state, 'DISABLED');
    });

    await harness.check({ id: 'Z9', title: 'Reconciliation line reads the latest ok daily row', requires }, async (t) => {
      const workspace = await newMetaWorkspace();

      await insertLog({ workspaceId: workspace.workspaceId, jobName: 'daily', status: 'ok', startedAt: minutesAgo(100), restoredCount: 4 });
      await insertLog({ workspaceId: workspace.workspaceId, jobName: 'daily', status: 'failed', startedAt: minutesAgo(50), restoredCount: 9 });

      const { sync } = await meta().getMeta(workspace.workspaceId);

      t.equal('restored', sync.restoredInLastReconciliation, 4);
      t.equal('time', sync.lastReconciliationAt, minutesAgo(100).toISOString());
    });

    await harness.check({ id: 'Z10', title: 'Options from the real field metadata reach the filter lists', requires }, async (t) => {
      const workspace = await newMetaWorkspace();
      const result = await meta().getMeta(workspace.workspaceId);

      t.equal('8 ranked plus 4 other stages', result.stages.length, 12);
      t.equal('5 tracks', result.tracks.length, 5);
      t.ok('39 programs plus the unmapped option', result.programs.length === 40 && result.programs.at(-1)?.trackKey === 'UNMAPPED', result.programs.length);
      t.equal('sources', result.sources.map((source) => source.key), ['LINKEDIN', 'REFERRAL', 'WEBSITE', 'UNIVERSITY']);
    });
  },
};
