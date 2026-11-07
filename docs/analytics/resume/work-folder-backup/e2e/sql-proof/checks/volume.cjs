'use strict';
// Time on production-sized data: 43,000 people (FLOLABS.md), nine in ten imported. Off by
// default so a rerun stays quick. PROOF_VOLUME=1 turns it on; PROOF_VOLUME_MOVES sets how
// many people have a stage row (default all of them, the long-run worst case) and
// PROOF_VOLUME_COHORT_EVERY how many are imported per person who applied since tracking start.
//   PROOF_VOLUME=1 PROOF_ONLY='^V' node ../analytics-work/e2e/sql-proof/run.cjs
// Limits: 8 s per page statement, 120 s per job statement (contract section 4).
const fs = require('node:fs');
const path = require('node:path');

const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

const PEOPLE = Number(process.env.PROOF_VOLUME_PEOPLE ?? 43000);
const MOVES = Number(process.env.PROOF_VOLUME_MOVES ?? PEOPLE);
// One person in this many applied after tracking start; the rest are imported.
const COHORT_EVERY = Number(process.env.PROOF_VOLUME_COHORT_EVERY ?? 10);
const PAGE_LIMIT_MS = 8000;
const SYNC_LIMIT_MS = 30000;
const PLANS_PATH = path.join(__dirname, '..', 'volume-plans.txt');

module.exports = {
  title: `Volume: ${PEOPLE} people, ${MOVES} moves, against the time limits (PROOF_VOLUME=1)`,
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, runSyncJob, runDailyJob, requirement }) => {
    const isRequested = process.env.PROOF_VOLUME === '1';
    const requires = [
      requirement('CrmAnalyticsMetricsService'),
      { isAvailable: isRequested, label: 'PROOF_VOLUME=1 on this run' },
    ];
    const reader = createMetricsReader({ loader, services });

    const workspace = isRequested
      ? await harness.fixture('V0', `${PEOPLE} people and their timeline rows`, async () => {
          const created = await newWorkspace();
          const personTable = created.table('person');
          const timelineTable = created.table('timelineActivity');
          const { CRM_ANALYTICS_CONFIG: config } = loader.real('src/modules/analytics/constants/crm-analytics-config.constant');
          const positions = config.tracks.flatMap((track) => track.positions);

          created.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(120).toISOString());

          await query(
            `WITH stage_list AS (SELECT ARRAY['NEW','CONTACTED','BEFORE_MEETING','SATURDAY_MEETING','ATTENDED','SECOND_MEETING','AGREEMENT_SENT','SIGNED_PAID','NO_ANSWER','NOT_INTERESTED','REJECTED_BY_US','INTERESTED','LEGACY_TEST'] AS stages)
             INSERT INTO ${personTable} ("nameFirstName", "nameLastName", stage, "positionsAppliedFor", "applicantSource", "createdAt", "updatedAt")
             SELECT 'First' || n, 'Last' || n,
               (SELECT stages[1 + (n % 13)] FROM stage_list)::"${created.schemaName}"."person_stage_enum",
               ARRAY[($2::text[])[1 + (n % 39)], ($2::text[])[1 + ((n * 7) % 39)]]::text[]::"${created.schemaName}"."person_positionsAppliedFor_enum"[],
               (ARRAY['LINKEDIN','REFERRAL','WEBSITE','UNIVERSITY'])[1 + (n % 4)]::"${created.schemaName}"."person_applicantSource_enum",
               CASE WHEN n % ${COHORT_EVERY} = 0 THEN now() - (n % 110) * interval '1 day' ELSE now() - interval '400 days' END,
               now() - interval '200 days'
             FROM generate_series(1, $1::int) AS n`,
            [PEOPLE, positions],
          );

          // Stage rows for MOVES people, plus four noise rows each that the relation must skip.
          await query(
            `INSERT INTO ${timelineTable} ("targetPersonId", properties, "happensAt", "createdAt", "updatedAt")
             SELECT p.id, jsonb_build_object('diff', jsonb_build_object('stage', jsonb_build_object('before', 'NEW', 'after', p.stage::text))),
               now() - (random() * 100) * interval '1 day', now() - interval '100 days', now() - (random() * 100) * interval '1 day'
             FROM (SELECT * FROM ${personTable} ORDER BY "createdAt" DESC LIMIT $1) p`,
            [MOVES],
          );
          await query(
            `INSERT INTO ${timelineTable} ("targetPersonId", properties, "happensAt", "createdAt", "updatedAt")
             SELECT p.id, jsonb_build_object('diff', jsonb_build_object('jobTitle', jsonb_build_object('before', 'a', 'after', 'b'))),
               now() - (random() * 100) * interval '1 day', now() - interval '100 days', now() - (random() * 100) * interval '1 day'
             FROM ${personTable} p, generate_series(1, 4)`,
          );
          await query(`ANALYZE ${personTable}`);
          await query(`ANALYZE ${timelineTable}`);

          return created;
        })
      : null;

    const describeStatement = ({ durationMs, sql }) =>
      `${durationMs} ms ...${sql.slice(-260).replace(/\s+/g, ' ')}`;

    const planLines = [`Plans from PROOF_VOLUME=1 with ${PEOPLE} people and ${MOVES} moves, try fixes ${process.env.PROOF_TRY_FIXES === '1'}.`, ''];

    const explainSlowest = async (label, statements) => {
      const slowest = [...statements].sort((first, second) => second.durationMs - first.durationMs)[0];

      if (slowest === undefined || slowest.durationMs < 1000 || process.env.PROOF_VOLUME_NO_PLANS === '1') return;

      try {
        const rows = await query(`EXPLAIN (ANALYZE, BUFFERS) ${slowest.sql}`, slowest.parameters);

        planLines.push(`=== ${label}: ${slowest.durationMs} ms ===`, slowest.sql, '', ...rows.map((row) => row['QUERY PLAN']), '');
      } catch (error) {
        planLines.push(`=== ${label}: plan failed: ${error.message} ===`, '');
      }
    };

    await harness.check({ id: 'V1', title: 'First sync reads every stage row inside the job limit, replay inside 30 s', requires, needs: [workspace] }, async (t) => {
      const startedAt = Date.now();

      await runSyncJob(workspace.workspaceId);

      const firstMs = Date.now() - startedAt;
      const replayStartedAt = Date.now();

      await runSyncJob(workspace.workspaceId);

      const replayMs = Date.now() - replayStartedAt;

      console.log(`        first sync ${firstMs} ms, replay ${replayMs} ms`);
      t.ok(`first sync took ${firstMs} ms`, firstMs <= 120000);
      t.ok(`replay took ${replayMs} ms`, replayMs <= SYNC_LIMIT_MS);

      const [{ rows }] = await query(`SELECT count(*)::int AS rows FROM analytics.stage_transition WHERE workspace_id = $1`, [workspace.workspaceId]);

      t.equal('one row per moved person', rows, MOVES);

      // Autovacuum does this within a minute of a bulk insert; waiting for it would make
      // the timings below depend on when this line ran.
      await query('ANALYZE analytics.stage_transition');
    });

    // Every tab read once. A statement over 8 s fails the whole tab for the viewer.
    const TAB_READS = [
      ['overview', () => reader.getOverview(workspace.workspaceId)],
      ['funnel', () => reader.getFunnel(workspace.workspaceId)],
      ['categories by track and program', () => reader.getCategories(workspace.workspaceId, 'TRACK_PROGRAM')],
      ['categories by source', () => reader.getCategories(workspace.workspaceId, 'SOURCE')],
      ['trend total contacts, week', () => reader.getTrends(workspace.workspaceId, 'TOTAL_CONTACTS', null, { period: 'WEEK' })],
      ['trend overall conversion, month', () => reader.getTrends(workspace.workspaceId, 'OVERALL_CONVERSION', null, { period: 'MONTH' })],
      ['trend median days, week', () => reader.getTrends(workspace.workspaceId, 'MEDIAN_DAYS', null, { period: 'WEEK' })],
    ];

    for (const [index, [label, read]] of TAB_READS.entries()) {
      await harness.check({ id: `V${3 + index}`, title: `Page read within the 8 s limit: ${label}`, requires, needs: [workspace] }, async (t) => {
        services.statements.length = 0;

        const startedAt = Date.now();
        let failure;

        try {
          await read();
        } catch (error) {
          failure = error;
        }

        const elapsed = Date.now() - startedAt;
        const statements = [...services.statements];
        const slowest = [...statements].sort((first, second) => second.durationMs - first.durationMs).slice(0, 3);

        console.log(`        ${label}: ${elapsed} ms over ${statements.length} statements${failure ? `, FAILED: ${failure.message}` : ''}`);

        for (const statement of slowest) {
          console.log(`          ${describeStatement(statement)}`);
        }

        await explainSlowest(label, statements);

        t.ok(`${failure?.message ?? 'no error'}; slowest statement ${slowest[0]?.durationMs} ms, limit ${PAGE_LIMIT_MS} ms`, failure === undefined && (slowest[0]?.durationMs ?? 0) < PAGE_LIMIT_MS);
      });
    }

    await harness.check({
      id: 'V2',
      title: 'Daily job, with reconcile, snapshot and 8 reports, inside the job limit',
      requires: [...requires, { isAvailable: process.env.PROOF_VOLUME_SKIP_DAILY !== '1', label: 'no PROOF_VOLUME_SKIP_DAILY=1' }],
      needs: [workspace],
    }, async (t) => {
      services.statements.length = 0;

      const startedAt = Date.now();

      await runDailyJob(workspace.workspaceId);

      const elapsed = Date.now() - startedAt;
      const statements = [...services.statements];
      const slowest = [...statements].sort((first, second) => second.durationMs - first.durationMs).slice(0, 5);

      console.log(`        daily job: ${elapsed} ms over ${statements.length} statements`);

      for (const statement of slowest) {
        console.log(`          ${describeStatement(statement)}`);
      }

      const logRows = await query(
        `SELECT status, details FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'daily'`,
        [workspace.workspaceId],
      );

      t.equal('status', logRows[0]?.status, 'ok');
      t.equal('consistency', logRows[0]?.details?.consistency, 'OK');
      t.ok(`no job statement over 120 s, slowest ${slowest[0]?.durationMs} ms`, (slowest[0]?.durationMs ?? 0) < 120000);
    });

    if (workspace !== null) fs.writeFileSync(PLANS_PATH, planLines.join('\n'));
  },
};
