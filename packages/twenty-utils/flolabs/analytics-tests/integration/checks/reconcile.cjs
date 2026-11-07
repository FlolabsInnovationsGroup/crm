'use strict';
// Reconcile runs inside the real daily job, after its full re-read.
const summarize = (rows) =>
  rows.map(({ from_stage: from, to_stage: to, origin }) => `${from}>${to} ${origin}`);

module.exports = {
  title: 'Reconcile: CRM changes that left no timeline row',
  run: async ({ harness, newWorkspace, daysAgo, minutesAgo, transitionsOf, logRowsOf, runSyncJob, runDailyJob }) => {
    // A person with one synced move NEW to CONTACTED, then whatever the check does.
    const buildMovedPerson = async ({ stage = 'CONTACTED', lastAfter = 'CONTACTED' } = {}) => {
      const workspace = await newWorkspace();

      workspace.trackingStart = daysAgo(60);
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', workspace.trackingStart.toISOString());
      workspace.personId = await workspace.fixtures.insertPerson({
        stage,
        createdAt: daysAgo(20),
        updatedAt: daysAgo(5),
      });
      await workspace.fixtures.insertStageChange({
        personId: workspace.personId,
        before: 'NEW',
        after: lastAfter,
        happensAt: daysAgo(5),
      });
      await runSyncJob(workspace.workspaceId);

      return workspace;
    };

    const shared = await harness.fixture('R0', 'person changed in the CRM with no timeline row', async () => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({
        personId: workspace.personId,
        stage: 'ATTENDED',
        updatedAt: minutesAgo(120),
      });

      return workspace;
    });

    await harness.check({ id: 'R1', title: 'A person changed with no timeline row gets one flagged row', needs: [shared] }, async (t) => {
      await runDailyJob(shared.workspaceId);

      const rows = await transitionsOf(shared.workspaceId);
      const reconcileRows = rows.filter((row) => row.origin === 'reconcile');
      const [logRow] = await logRowsOf(shared.workspaceId, 'daily');

      t.equal('all rows', summarize(rows), ['NEW>CONTACTED timeline', 'CONTACTED>ATTENDED reconcile']);
      t.equal('reconcile row has no source', reconcileRows[0]?.source_id, null);
      t.equal('restored_count', logRow?.restored_count, 1);
      t.equal('status', logRow?.status, 'ok');
    });

    await harness.check({ id: 'R2', title: 'A rerun adds none and logs restored 0', needs: [shared] }, async (t) => {
      await runDailyJob(shared.workspaceId);
      await runDailyJob(shared.workspaceId);

      const logRows = await logRowsOf(shared.workspaceId, 'daily');

      t.equal('rows', (await transitionsOf(shared.workspaceId)).length, 2);
      t.equal('restored_count', logRows.at(-1)?.restored_count, 0);
    });

    await harness.check({ id: 'R3', title: 'A person updated in the last 30 minutes is skipped until they age', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: 'ATTENDED', updatedAt: minutesAgo(5) });
      await runDailyJob(workspace.workspaceId);

      t.equal('skipped', summarize(await transitionsOf(workspace.workspaceId)), ['NEW>CONTACTED timeline']);

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: 'ATTENDED', updatedAt: minutesAgo(31) });
      await runDailyJob(workspace.workspaceId);

      t.equal('reconciled', summarize(await transitionsOf(workspace.workspaceId)), [
        'NEW>CONTACTED timeline',
        'CONTACTED>ATTENDED reconcile',
      ]);
    });

    await harness.check({ id: 'R4', title: 'Two raw values on one stage key are no move: no false reconcile', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson({ stage: 'SIGNED_NON_PAID', lastAfter: 'SIGNED_PAID' });

      await runDailyJob(workspace.workspaceId);

      t.equal('no reconcile row', summarize(await transitionsOf(workspace.workspaceId)), ['NEW>SIGNED_PAID timeline']);
    });

    await harness.check({ id: 'R5', title: 'A person with no transition has nothing to compare (documented limit)', needs: [] }, async (t) => {
      const workspace = await newWorkspace();

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await workspace.fixtures.insertPerson({ stage: 'ATTENDED', createdAt: daysAgo(20), updatedAt: daysAgo(2) });
      await runDailyJob(workspace.workspaceId);

      t.equal('no rows', await transitionsOf(workspace.workspaceId), []);
    });

    await harness.check({ id: 'R6', title: 'A stage cleared in the CRM reconciles to null once', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: null, updatedAt: minutesAgo(120) });
      await runDailyJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      t.equal('rows', summarize(await transitionsOf(workspace.workspaceId)), [
        'NEW>CONTACTED timeline',
        'CONTACTED>null reconcile',
      ]);
    });

    await harness.check({ id: 'R7', title: 'An unmapped value reconciles by raw value once', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: 'LEGACY_TEST', updatedAt: minutesAgo(120) });
      await runDailyJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      t.equal('rows', summarize(await transitionsOf(workspace.workspaceId)), [
        'NEW>CONTACTED timeline',
        'CONTACTED>LEGACY_TEST reconcile',
      ]);
    });

    await harness.check({ id: 'R8', title: 'A timeline row arriving after reconcile causes no further reconcile rows', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: 'ATTENDED', updatedAt: minutesAgo(120) });
      await runDailyJob(workspace.workspaceId);
      await workspace.fixtures.insertStageChange({
        personId: workspace.personId,
        before: 'CONTACTED',
        after: 'ATTENDED',
        happensAt: minutesAgo(115),
        updatedAt: minutesAgo(115),
      });
      await runDailyJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const rows = await transitionsOf(workspace.workspaceId);

      t.equal('one reconcile row in total', rows.filter((row) => row.origin === 'reconcile').length, 1);
      t.equal('late row stored', rows.filter((row) => row.origin === 'timeline').length, 2);
    });

    await harness.check({ id: 'R10', title: 'Two members editing at once: rows interleave, and the chain still ends on the CRM stage', needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange, mergeStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      // The merge key includes the member, so each member keeps their own row, and one
      // row can be merged after the other was written.
      const personId = await insertPerson({ stage: 'SECOND_MEETING', createdAt: daysAgo(20), updatedAt: minutesAgo(116) });
      const firstMemberRow = await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: minutesAgo(120), updatedAt: minutesAgo(120) });

      await insertStageChange({ personId, before: 'CONTACTED', after: 'ATTENDED', happensAt: minutesAgo(118), updatedAt: minutesAgo(118) });
      await mergeStageChange({ rowId: firstMemberRow, after: 'SECOND_MEETING', updatedAt: minutesAgo(116) });
      await runDailyJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const rows = await transitionsOf(workspace.workspaceId);

      t.equal('rows', summarize(rows), [
        'NEW>SECOND_MEETING timeline',
        'CONTACTED>ATTENDED timeline',
        'ATTENDED>SECOND_MEETING reconcile',
      ]);
      t.equal('last stored stage is the CRM stage', rows.at(-1)?.to_stage, 'SECOND_MEETING');
    });

    await harness.check({ id: 'R9', title: 'A soft-deleted person gets no reconcile row', needs: [] }, async (t) => {
      const workspace = await buildMovedPerson();

      await workspace.fixtures.setPersonStage({ personId: workspace.personId, stage: 'ATTENDED', updatedAt: minutesAgo(120) });
      await workspace.fixtures.softDeletePerson({ personId: workspace.personId, deletedAt: minutesAgo(60) });
      await runDailyJob(workspace.workspaceId);

      t.equal('no reconcile row', summarize(await transitionsOf(workspace.workspaceId)), ['NEW>CONTACTED timeline']);
    });
  },
};
