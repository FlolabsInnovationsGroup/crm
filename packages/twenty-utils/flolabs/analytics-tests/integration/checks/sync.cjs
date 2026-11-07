'use strict';
// The real sync and daily jobs against timeline rows shaped and merged as the CRM does.
const { createBaseCteReader } = require('../lib/base-ctes.cjs');

const MINUTE_MS = 60_000;

const summarize = (rows) =>
  rows.map(({ from_stage: from, to_stage: to, origin }) => `${from}>${to} ${origin}`);

module.exports = {
  title: 'Sync: timeline re-read through the real jobs',
  run: async ({ harness, loader, services, query, factory, newWorkspace, daysAgo, minutesAgo, transitionsOf, logRowsOf, runSyncJob, runDailyJob }) => {
    const sync = services.get('CrmAnalyticsSyncService');
    const database = services.get('CrmAnalyticsDatabaseService');
    const readBaseCtes = createBaseCteReader({ loader, services });

    const newSyncWorkspace = async () => {
      const workspace = await newWorkspace();

      workspace.trackingStart = daysAgo(60);
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', workspace.trackingStart.toISOString());

      return workspace;
    };

    const main = await harness.fixture('Y0', 'workspace with wanted and unwanted timeline rows', async () => {
      const workspace = await newSyncWorkspace();
      const { insertPerson, insertStageChange, insertTimelineRow } = workspace.fixtures;

      workspace.personId = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });
      workspace.firstRowHappensAt = daysAgo(5);
      workspace.firstRowUpdatedAt = new Date(daysAgo(5).getTime() + 1234);
      workspace.firstRowId = await insertStageChange({
        personId: workspace.personId,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: workspace.firstRowHappensAt,
        updatedAt: workspace.firstRowUpdatedAt,
      });

      await insertStageChange({ personId: workspace.personId, before: 'X', after: 'Y', happensAt: daysAgo(5), linkedRecordId: workspace.personId });
      await insertTimelineRow({ personId: workspace.personId, properties: { diff: { jobTitle: { before: 'a', after: 'b' } } }, happensAt: daysAgo(5) });
      await insertTimelineRow({ personId: workspace.personId, properties: {}, happensAt: daysAgo(5) });
      await insertStageChange({ personId: workspace.personId, before: 'OLD', after: 'OLDER', happensAt: daysAgo(90), updatedAt: daysAgo(90) });

      return workspace;
    });

    await harness.check({ id: 'Y1', title: 'First read stores one row exactly as read and ignores everything else', needs: [main] }, async (t) => {
      await runSyncJob(main.workspaceId);

      const rows = await transitionsOf(main.workspaceId);
      const logRows = await logRowsOf(main.workspaceId, 'sync');

      t.equal('rows', rows.length, 1);
      t.equal('source_id', rows[0]?.source_id, main.firstRowId);
      t.equal('person_id', rows[0]?.person_id, main.personId);
      t.equal('from', rows[0]?.from_stage, 'NEW');
      t.equal('to', rows[0]?.to_stage, 'CONTACTED');
      t.equal('happened_at', rows[0]?.happened_at, main.firstRowHappensAt);
      t.equal('source_updated_at', rows[0]?.source_updated_at, main.firstRowUpdatedAt);
      t.equal('origin', rows[0]?.origin, 'timeline');
      t.equal('log row', [logRows.length, logRows[0]?.status, logRows[0]?.processed_count, logRows[0]?.error_message], [1, 'ok', 1, null]);
      t.ok('log row finished', logRows[0]?.finished_at instanceof Date, logRows[0]);

      main.firstStored = rows[0];
    });

    await harness.check({ id: 'Y2', title: 'Replay adds no rows, by sync and by daily full re-read', needs: [main] }, async (t) => {
      await runSyncJob(main.workspaceId);
      await runSyncJob(main.workspaceId);
      await runDailyJob(main.workspaceId);

      const rows = await transitionsOf(main.workspaceId);
      const syncRows = await logRowsOf(main.workspaceId, 'sync');

      t.equal('rows', rows.length, 1);
      t.equal('replay processed nothing', syncRows.at(-1)?.processed_count, 0);
    });

    await harness.check({ id: 'Y3', title: 'Merged row appends one row, dated by the merge, and leaves the first unchanged', needs: [main] }, async (t) => {
      const mergedAt = new Date(main.firstRowUpdatedAt.getTime() + 5 * MINUTE_MS);

      await main.fixtures.mergeStageChange({ rowId: main.firstRowId, after: 'ATTENDED', updatedAt: mergedAt });
      await main.fixtures.setPersonStage({ personId: main.personId, stage: 'ATTENDED', updatedAt: mergedAt });

      const [{ properties, happensAt }] = await query(
        `SELECT properties, "happensAt" FROM ${main.table('timelineActivity')} WHERE id = $1`,
        [main.firstRowId],
      );

      t.equal('real diff merge keeps first before, takes new after', properties.diff.stage, { before: 'NEW', after: 'ATTENDED' });
      t.equal('happensAt unchanged by the merge', happensAt, main.firstRowHappensAt);

      await runSyncJob(main.workspaceId);

      const rows = await transitionsOf(main.workspaceId);

      t.equal('two rows', summarize(rows), ['NEW>CONTACTED timeline', 'CONTACTED>ATTENDED timeline']);
      t.equal('first row unchanged', rows[0], main.firstStored);
      t.equal('second is the same source', rows[1]?.source_id, main.firstRowId);
      t.equal('second happened_at is the merge', rows[1]?.happened_at, mergedAt);
      t.equal('second source_updated_at is the merge', rows[1]?.source_updated_at, mergedAt);
    });

    await harness.check({ id: 'Y4', title: 'Replay after a merge adds nothing, daily re-read included', needs: [main] }, async (t) => {
      await runSyncJob(main.workspaceId);
      await runDailyJob(main.workspaceId);

      t.equal('still two', (await transitionsOf(main.workspaceId)).length, 2);
    });

    await harness.check({ id: 'Y5', title: 'Merged row with the same after but a newer updatedAt adds nothing', needs: [main] }, async (t) => {
      await query(`UPDATE ${main.table('timelineActivity')} SET "updatedAt" = $2 WHERE id = $1`, [
        main.firstRowId,
        new Date(main.firstRowUpdatedAt.getTime() + 8 * MINUTE_MS),
      ]);
      await runSyncJob(main.workspaceId);

      t.equal('still two', (await transitionsOf(main.workspaceId)).length, 2);
    });

    await harness.check({ id: 'Y16', title: 'Merged twice with reads between: an unbroken chain, each row kept', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });
      const rowId = await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(3) });
      const mergeAt = (minutes) => new Date(daysAgo(3).getTime() + minutes * MINUTE_MS);

      await runSyncJob(workspace.workspaceId);
      await workspace.fixtures.mergeStageChange({ rowId, after: 'BEFORE_MEETING', updatedAt: mergeAt(3) });
      await runSyncJob(workspace.workspaceId);
      await workspace.fixtures.mergeStageChange({ rowId, after: 'ATTENDED', updatedAt: mergeAt(6) });
      await runSyncJob(workspace.workspaceId);

      t.equal('rows', summarize(await transitionsOf(workspace.workspaceId)), [
        'NEW>CONTACTED timeline',
        'CONTACTED>BEFORE_MEETING timeline',
        'BEFORE_MEETING>ATTENDED timeline',
      ]);
    });

    await harness.check({ id: 'Y17', title: 'A stage merged into a row first seen without one is stored as a first read', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const { insertPerson, insertTimelineRow } = workspace.fixtures;
      const personId = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });
      const happensAt = daysAgo(3);
      const rowId = await insertTimelineRow({ personId, properties: { diff: { jobTitle: { before: 'a', after: 'b' } } }, happensAt });

      await runSyncJob(workspace.workspaceId);

      t.equal('nothing to read yet', await transitionsOf(workspace.workspaceId), []);

      const [{ properties }] = await query(`SELECT properties FROM ${workspace.table('timelineActivity')} WHERE id = $1`, [rowId]);
      const merged = factory.objectRecordDiffMerge(properties, { diff: { stage: { before: 'NEW', after: 'CONTACTED' } } });

      await query(`UPDATE ${workspace.table('timelineActivity')} SET properties = $2::jsonb, "updatedAt" = $3 WHERE id = $1`, [
        rowId,
        JSON.stringify(merged),
        new Date(happensAt.getTime() + 5 * MINUTE_MS),
      ]);
      await runSyncJob(workspace.workspaceId);

      const rows = await transitionsOf(workspace.workspaceId);

      t.equal('rows', summarize(rows), ['NEW>CONTACTED timeline']);
      t.equal('dated by happensAt, as any first read', rows[0]?.happened_at, happensAt);
    });

    await harness.check({ id: 'Y6', title: 'A to B to A with a read between: rows A to B and B to A', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });
      const rowId = await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(3) });

      await runSyncJob(workspace.workspaceId);
      await workspace.fixtures.mergeStageChange({
        rowId,
        after: 'NEW',
        updatedAt: new Date(daysAgo(3).getTime() + 5 * MINUTE_MS),
      });
      await runSyncJob(workspace.workspaceId);
      await runSyncJob(workspace.workspaceId);

      t.equal('rows', summarize(await transitionsOf(workspace.workspaceId)), [
        'NEW>CONTACTED timeline',
        'CONTACTED>NEW timeline',
      ]);
    });

    await harness.check({ id: 'Y7', title: 'A to B to A with no read between: one no-op row that every read ignores', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });
      const rowId = await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(3) });

      await workspace.fixtures.mergeStageChange({
        rowId,
        after: 'NEW',
        updatedAt: new Date(daysAgo(3).getTime() + 5 * MINUTE_MS),
      });
      await runSyncJob(workspace.workspaceId);

      t.equal('stored', summarize(await transitionsOf(workspace.workspaceId)), ['NEW>NEW timeline']);

      const visible = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT * FROM transition`,
      });

      t.equal('transition CTE ignores it', visible, []);
    });

    await harness.check({ id: 'Y8', title: 'Cursor is the latest timeline row minus 30 minutes and ignores reconcile rows', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;
      const personId = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(5) });
      await runSyncJob(workspace.workspaceId);

      const expectedCursor = new Date(daysAgo(5).getTime() - 30 * MINUTE_MS).toISOString();
      const readCursor = () =>
        database.runJob((run) =>
          sync.computeSyncUpdatedSince({
            workspaceId: workspace.workspaceId,
            trackingStart: workspace.trackingStart.toISOString(),
            run,
          }),
        );

      t.equal('cursor before reconcile', await readCursor(), expectedCursor);

      await query(
        `INSERT INTO analytics.stage_transition (workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
         VALUES ($1, $2, 'CONTACTED', 'ATTENDED', now(), now(), 'reconcile')`,
        [workspace.workspaceId, personId],
      );

      t.equal('cursor ignores the reconcile row', await readCursor(), expectedCursor);

      // Older than now() minus 30 minutes, so a cursor moved by the reconcile row misses it.
      const lateRow = await insertStageChange({ personId, before: 'CONTACTED', after: 'ATTENDED', happensAt: daysAgo(4) });

      await runSyncJob(workspace.workspaceId);

      const rows = await transitionsOf(workspace.workspaceId);

      t.ok('late timeline row was read', rows.some((row) => row.source_id === lateRow), summarize(rows));
    });

    await harness.check({ id: 'Y9', title: 'First run with no rows uses tracking start as the cursor', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const cursor = await database.runJob((run) =>
        sync.computeSyncUpdatedSince({
          workspaceId: workspace.workspaceId,
          trackingStart: workspace.trackingStart.toISOString(),
          run,
        }),
      );

      t.equal('cursor', cursor, workspace.trackingStart.toISOString());
    });

    await harness.check({ id: 'Y10', title: 'Overlap: a late row inside 30 minutes is read by sync; older is left to the daily re-read', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;
      const latestAt = minutesAgo(600);
      const first = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });
      const second = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });
      const third = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });

      await insertStageChange({ personId: first, before: 'NEW', after: 'CONTACTED', happensAt: latestAt });
      await runSyncJob(workspace.workspaceId);

      const insideOverlap = await insertStageChange({
        personId: second,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: new Date(latestAt.getTime() - 10 * MINUTE_MS),
      });
      const outsideOverlap = await insertStageChange({
        personId: third,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: new Date(latestAt.getTime() - 2 * 60 * MINUTE_MS),
      });

      await runSyncJob(workspace.workspaceId);

      const afterSync = await transitionsOf(workspace.workspaceId);

      t.ok('inside overlap read', afterSync.some((row) => row.source_id === insideOverlap), afterSync);
      t.ok('outside overlap not read by sync', !afterSync.some((row) => row.source_id === outsideOverlap), afterSync);

      await runDailyJob(workspace.workspaceId);

      const afterDaily = await transitionsOf(workspace.workspaceId);

      t.ok('daily re-read catches it', afterDaily.some((row) => row.source_id === outsideOverlap), afterDaily);
      t.equal('nothing duplicated', afterDaily.length, 3);
    });

    await harness.check({ id: 'Y11', title: 'Off switch: job returns with no log row and no rows', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(10) });

      await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(1) });
      workspace.vars.set('CRM_ANALYTICS_DISABLED', true);

      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      t.equal('sync log', await logRowsOf(workspace.workspaceId, 'sync'), []);
      t.equal('daily log', await logRowsOf(workspace.workspaceId, 'daily'), []);
      t.equal('rows', await transitionsOf(workspace.workspaceId), []);

      workspace.vars.delete('CRM_ANALYTICS_DISABLED');
      await runSyncJob(workspace.workspaceId);

      t.equal('back on recovers', (await transitionsOf(workspace.workspaceId)).length, 1);
    });

    await harness.check({ id: 'Y12', title: 'Missing stage field: log row skipped with NO_STAGE_FIELD, no throw', needs: [] }, async (t) => {
      const workspace = await newWorkspace({ personFields: 'NONE', forms: 'NONE' });

      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const syncRows = await logRowsOf(workspace.workspaceId, 'sync');
      const dailyRows = await logRowsOf(workspace.workspaceId, 'daily');

      t.equal('sync', [syncRows[0]?.status, syncRows[0]?.details], ['skipped', { reason: 'NO_STAGE_FIELD' }]);
      t.equal('daily', [dailyRows[0]?.status, dailyRows[0]?.details], ['skipped', { reason: 'NO_STAGE_FIELD' }]);
    });

    await harness.check({ id: 'Y13', title: 'Failure: bad tracking start writes a failed row and rethrows; the next run recovers', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const good = workspace.vars.get('CRM_ANALYTICS_TRACKING_START_AT');
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(10) });

      await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(1) });
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', 'not a date');

      let thrown;

      try {
        await runSyncJob(workspace.workspaceId);
      } catch (error) {
        thrown = error;
      }

      const failed = await logRowsOf(workspace.workspaceId, 'sync');

      t.ok('rethrown', thrown instanceof Error, thrown);
      t.equal('failed row', failed[0]?.status, 'failed');
      t.ok('message kept', typeof failed[0]?.error_message === 'string' && failed[0].error_message.includes('CRM_ANALYTICS_TRACKING_START_AT'), failed[0]);

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', good);
      await runSyncJob(workspace.workspaceId);

      const recovered = await logRowsOf(workspace.workspaceId, 'sync');

      t.equal('recovered', recovered.at(-1)?.status, 'ok');
      t.equal('rows', (await transitionsOf(workspace.workspaceId)).length, 1);
    });

    await harness.check({ id: 'Y14', title: 'One workspace never reads or writes another workspace', needs: [] }, async (t) => {
      const first = await newSyncWorkspace();
      const second = await newSyncWorkspace();
      const firstPerson = await first.fixtures.insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(10) });
      const secondPerson = await second.fixtures.insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(10) });

      await first.fixtures.insertStageChange({ personId: firstPerson, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(2) });
      await second.fixtures.insertStageChange({ personId: secondPerson, before: 'NEW', after: 'ATTENDED', happensAt: daysAgo(2) });
      await runSyncJob(first.workspaceId);

      t.equal('second is untouched', await transitionsOf(second.workspaceId), []);

      await runSyncJob(second.workspaceId);

      t.equal('each sees its own', [
        summarize(await transitionsOf(first.workspaceId)),
        summarize(await transitionsOf(second.workspaceId)),
      ], [['NEW>CONTACTED timeline'], ['NEW>ATTENDED timeline']]);
    });

    await harness.check({ id: 'Y15', title: 'Log trim removes only rows older than 90 days, for that workspace', needs: [] }, async (t) => {
      const workspace = await newSyncWorkspace();
      const insertLog = (startedAt) =>
        query(
          `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, status) VALUES ($1, 'sync', $2, 'ok')`,
          [workspace.workspaceId, startedAt],
        );

      await insertLog(daysAgo(91));
      await insertLog(daysAgo(89));
      await runDailyJob(workspace.workspaceId);

      const rows = await query(
        `SELECT started_at FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'sync'`,
        [workspace.workspaceId],
      );

      t.equal('kept the recent one', rows.map((row) => row.started_at), [daysAgo(89)]);
    });
  },
};
