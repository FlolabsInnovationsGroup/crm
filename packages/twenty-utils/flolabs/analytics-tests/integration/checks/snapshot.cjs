'use strict';
// Five live people by hand, one soft-deleted. Expected rows are counted by hand from this.
const EXPECTED_ROWS = [
  'all||NEW=2',
  'all||CONTACTED=1',
  'all||=1',
  'all||LEGACY_TEST=1',
  'source|LINKEDIN|NEW=1',
  'source|REFERRAL|NEW=1',
  'source|NONE|CONTACTED=1',
  'source|LINKEDIN|=1',
  'source|WEBSITE|LEGACY_TEST=1',
  'position|FINANCE_INTERN|NEW=2',
  'position|MARKETING_INTERN|NEW=1',
  'position|AI_AGI_INTERN|NEW=1',
  'position|NONE|CONTACTED=1',
  'position|NONE|=1',
  'position|LEGACY_POSITION|LEGACY_TEST=1',
  'track|BUSINESS|NEW=2',
  'track|AI_SOFTWARE|NEW=1',
  'track|NONE|CONTACTED=1',
  'track|NONE|=1',
  'track|UNMAPPED|LEGACY_TEST=1',
].sort();

module.exports = {
  title: 'Snapshot and consistency check',
  run: async ({ harness, services, query, newWorkspace, daysAgo, logRowsOf, runDailyJob }) => {
    const readSnapshot = async (workspaceId) => {
      const rows = await query(
        `SELECT snapshot_date::text AS snapshot_date, dimension, dimension_key, stage, person_count
         FROM analytics.daily_snapshot WHERE workspace_id = $1`,
        [workspaceId],
      );

      return rows
        .map((row) => `${row.dimension}|${row.dimension_key}|${row.stage}=${row.person_count}`)
        .sort();
    };

    const workspace = await harness.fixture('N0', 'five people with every kind of key', async () => {
      const created = await newWorkspace();
      const { insertPerson } = created.fixtures;

      created.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await insertPerson({ stage: 'NEW', positions: ['FINANCE_INTERN', 'MARKETING_INTERN'], source: 'LINKEDIN', createdAt: daysAgo(5) });
      await insertPerson({ stage: 'NEW', positions: ['AI_AGI_INTERN', 'FINANCE_INTERN'], source: 'REFERRAL', createdAt: daysAgo(5) });
      await insertPerson({ stage: 'CONTACTED', positions: [], createdAt: daysAgo(5) });
      await insertPerson({ stage: null, positions: null, source: 'LINKEDIN', createdAt: daysAgo(5) });
      await insertPerson({ stage: 'LEGACY_TEST', positions: ['LEGACY_POSITION'], source: 'WEBSITE', createdAt: daysAgo(5) });
      await insertPerson({ stage: 'NEW', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', createdAt: daysAgo(5), deletedAt: daysAgo(1) });

      return created;
    });

    await harness.check({ id: 'N1', title: 'First run: exact rows, consistency OK, status ok', needs: [workspace] }, async (t) => {
      services.statements.length = 0;
      await runDailyJob(workspace.workspaceId);

      t.equal('rows', await readSnapshot(workspace.workspaceId), EXPECTED_ROWS);

      const [logRow] = await logRowsOf(workspace.workspaceId, 'daily');

      t.equal('status', logRow?.status, 'ok');
      t.equal('consistency', logRow?.details?.consistency, 'OK');
      t.equal('totals', [logRow?.details?.liveTotal, logRow?.details?.allTotal, logRow?.details?.sourceTotal], [5, 5, 5]);
    });

    await harness.check({ id: 'N2', title: 'Snapshot and check are one statement', needs: [workspace] }, async (t) => {
      const touching = services.statements.filter(({ sql }) => /INSERT INTO analytics\.daily_snapshot/.test(sql));

      t.equal('statements writing the snapshot', touching.length, 1);
      t.ok('the same statement returns the totals', /live_total/.test(touching[0]?.sql ?? '') && /all_total/.test(touching[0]?.sql ?? '') && /source_total/.test(touching[0]?.sql ?? ''));
      t.equal(
        'no other statement reads the totals',
        services.statements.filter(({ sql }) => /live_total/.test(sql)).length,
        1,
      );
    });

    await harness.check({ id: 'N3', title: 'Snapshot date is the local date in the reporting zone', needs: [workspace] }, async (t) => {
      const [{ snapshot_date: snapshotDate, expected }] = await query(
        `SELECT min(snapshot_date)::text AS snapshot_date, (now() AT TIME ZONE 'UTC')::date::text AS expected
         FROM analytics.daily_snapshot WHERE workspace_id = $1`,
        [workspace.workspaceId],
      );

      t.equal('date', snapshotDate, expected);
    });

    await harness.check({ id: 'N4', title: 'Rerun: NOT_RUN, status ok, rows unchanged', needs: [workspace] }, async (t) => {
      await runDailyJob(workspace.workspaceId);

      const logRows = await logRowsOf(workspace.workspaceId, 'daily');

      t.equal('status', logRows.at(-1)?.status, 'ok');
      t.equal('consistency', logRows.at(-1)?.details?.consistency, 'NOT_RUN');
      t.equal('rows', await readSnapshot(workspace.workspaceId), EXPECTED_ROWS);
    });

    await harness.check({ id: 'N5', title: 'A person created between runs causes no false mismatch and no new rows', needs: [workspace] }, async (t) => {
      await workspace.fixtures.insertPerson({ stage: 'ATTENDED', positions: ['SPACE_SCIENCE_INTERN'], source: 'UNIVERSITY', createdAt: daysAgo(0) });
      await runDailyJob(workspace.workspaceId);

      const logRows = await logRowsOf(workspace.workspaceId, 'daily');
      const logRow = logRows.at(-1);

      t.equal('status', logRow?.status, 'ok');
      t.equal('consistency', logRow?.details?.consistency, 'NOT_RUN');
      t.equal('live total moved', logRow?.details?.liveTotal, 6);
      t.equal('first run of the date stands', await readSnapshot(workspace.workspaceId), EXPECTED_ROWS);
    });

    await harness.check({ id: 'N6', title: 'No people at all: NOT_RUN and status ok', needs: [] }, async (t) => {
      const empty = await newWorkspace();

      empty.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await runDailyJob(empty.workspaceId);

      const [logRow] = await logRowsOf(empty.workspaceId, 'daily');

      t.equal('status', logRow?.status, 'ok');
      t.equal('consistency', logRow?.details?.consistency, 'NOT_RUN');
      t.equal('rows', await readSnapshot(empty.workspaceId), []);
    });

    await harness.check({ id: 'N7', title: 'Missing positions and source fields still give a consistent snapshot under NONE', needs: [] }, async (t) => {
      const textFields = await newWorkspace({ personFields: 'TEXT', forms: 'NONE' });

      textFields.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await query(
        `INSERT INTO ${textFields.table('person')} (stage, "applicantSource") VALUES ('NEW', 'LINKEDIN'), ('NEW', ''), ('', NULL)`,
      );
      await runDailyJob(textFields.workspaceId);

      const [logRow] = await logRowsOf(textFields.workspaceId, 'daily');

      t.equal('status', logRow?.status, 'ok');
      t.equal('consistency', logRow?.details?.consistency, 'OK');
      t.equal('rows', await readSnapshot(textFields.workspaceId), [
        'all||=1',
        'all||NEW=2',
        'position|NONE|=1',
        'position|NONE|NEW=2',
        'source|LINKEDIN|NEW=1',
        'source|NONE|=1',
        'source|NONE|NEW=1',
        'track|NONE|=1',
        'track|NONE|NEW=2',
      ]);
    });

    await harness.check({ id: 'N8', title: 'A mismatch marks the job failed with the three totals, and is rethrown', needs: [] }, async (t) => {
      const workspace = await newWorkspace();

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const snapshot = services.get('CrmAnalyticsSnapshotService');
      const realTakeSnapshot = snapshot.takeSnapshot;
      let thrown;

      // The real statement cannot disagree with itself, so only the job's handling is forced.
      snapshot.takeSnapshot = async () => ({ consistency: 'MISMATCH', insertedRows: 3, liveTotal: 5, allTotal: 4, sourceTotal: 5 });

      try {
        await runDailyJob(workspace.workspaceId);
      } catch (error) {
        thrown = error;
      } finally {
        snapshot.takeSnapshot = realTakeSnapshot;
      }

      const [logRow] = await logRowsOf(workspace.workspaceId, 'daily');

      t.ok('rethrown', thrown instanceof Error, thrown);
      t.equal('status', logRow?.status, 'failed');
      t.equal('consistency', logRow?.details?.consistency, 'MISMATCH');
      t.equal('totals', [logRow?.details?.liveTotal, logRow?.details?.allTotal, logRow?.details?.sourceTotal], [5, 4, 5]);
    });
  },
};
