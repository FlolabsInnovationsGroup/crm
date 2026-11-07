'use strict';
// The real-Postgres layer. Started by run-tests.mjs. To run some checks only:
//   ANALYTICS_TEST_ONLY=<regex on check ids> node packages/twenty-utils/flolabs/analytics-tests/integration/run.cjs
const fs = require('node:fs');
const path = require('node:path');

const { installLoader } = require('./lib/loader.cjs');
const {
  databaseUrl,
  getDatabaseName,
  recreateDatabase,
  createPagePool,
} = require('./lib/db.cjs');
const { createCrmFactory, createFixtures } = require('./lib/crm-tables.cjs');
const { createRealServices } = require('./lib/real-services.cjs');
const { createHarness, describeError } = require('./lib/harness.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// Each check id starts with its section's letter.
const SECTIONS = [
  ['A', './checks/fresh.cjs'],
  ['S', './checks/storage.cjs'],
  ['F', './checks/facade.cjs'],
  ['K', './checks/cte.cjs'],
  ['M', './checks/sample.cjs'],
  ['Y', './checks/sync.cjs'],
  ['R', './checks/reconcile.cjs'],
  ['N', './checks/snapshot.cjs'],
  ['T', './checks/metrics.cjs'],
  ['Q', './checks/reports.cjs'],
  ['Z', './checks/meta.cjs'],
  ['C', './checks/altered-config.cjs'],
  ['X', './checks/contract-extras.cjs'],
];

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const main = async () => {
  const startedAt = Date.now();
  const loader = installLoader(REPO_ROOT);
  const pg = loader.repoRequire('pg');
  const { FieldMetadataType, RelationType } = loader.repoRequire('twenty-shared/types');
  const { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } =
    loader.repoRequire('twenty-shared/application');

  await recreateDatabase(pg);

  const pagePool = createPagePool(pg);
  const query = async (sql, parameters = []) => (await pagePool.query(sql, parameters)).rows;

  // The real column generator defaults ids to public.uuid_generate_v4(), as in the CRM.
  await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  const workspaces = new Map();
  const services = createRealServices({
    loader,
    pagePool,
    databaseUrl: databaseUrl(),
    workspaces,
  });
  const harness = createHarness({
    getLastStatement: () => services.statements.at(-1),
    onlyPattern: process.env.ANALYTICS_TEST_ONLY
      ? new RegExp(process.env.ANALYTICS_TEST_ONLY)
      : undefined,
  });
  const factory = createCrmFactory({
    loader,
    standardApplicationId: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    FieldMetadataType,
    RelationType,
  });

  const [{ now: databaseNow }] = await query('SELECT now()');
  let workspaceCounter = 0;

  const context = {
    loader,
    harness,
    query,
    services,
    factory,
    now: databaseNow,
    daysAgo: (days) => new Date(databaseNow.getTime() - days * DAY_MS),
    minutesAgo: (minutes) => new Date(databaseNow.getTime() - minutes * MINUTE_MS),
    ageInDays: (date) => Math.round((databaseNow.getTime() - new Date(date).getTime()) / DAY_MS),
    // One workspace per scenario, so no fixture can leak into another's numbers.
    newWorkspace: async (options = {}) => {
      workspaceCounter += 1;

      const workspaceId = `20202020-a000-4000-8000-${String(workspaceCounter).padStart(12, '0')}`;
      const workspace = await factory.createWorkspace({ query, workspaceId, ...options });

      workspaces.set(workspaceId, workspace);
      workspace.fixtures = createFixtures({
        query,
        workspace,
        objectRecordDiffMerge: factory.objectRecordDiffMerge,
      });

      return workspace;
    },
    transitionsOf: (workspaceId) =>
      query(
        `SELECT id, source_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin
         FROM analytics.stage_transition WHERE workspace_id = $1
         ORDER BY happened_at, source_updated_at, id`,
        [workspaceId],
      ),
    logRowsOf: (workspaceId, jobName) =>
      query(
        `SELECT job_name, status, processed_count, restored_count, details, error_message, finished_at
         FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = $2 ORDER BY started_at`,
        [workspaceId, jobName],
      ),
    runSyncJob: (workspaceId) =>
      services.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId }),
    runDailyJob: (workspaceId) =>
      services.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId }),
    withAlteredConfig: async (alter, work) => {
      const { CRM_ANALYTICS_CONFIG: config } = loader.real(
        'src/modules/analytics/constants/crm-analytics-config.constant',
      );
      const saved = { ...config };

      // alter works on copies: modules already loaded keep the original stage objects.
      Object.assign(config, JSON.parse(JSON.stringify(config)));
      alter(config);
      loader.purgeAnalyticsModules();

      try {
        await work(createRealServices({ loader, pagePool, databaseUrl: databaseUrl(), workspaces }));
      } finally {
        Object.assign(config, saved);
        loader.purgeAnalyticsModules();
      }
    },
    // A dependency a check cannot run without, reported by file when absent.
    requirement: (typeName) => ({
      isAvailable: services.has(typeName),
      label: `${services.requestOf(typeName)}.ts`,
    }),
  };

  const onlySource = process.env.ANALYTICS_TEST_ONLY ?? '';

  for (const [letter, sectionPath] of SECTIONS) {
    if (onlySource !== '' && !onlySource.includes(letter)) continue;

    const section = require(sectionPath);

    harness.startSection(section.title);

    try {
      // Every section but A starts with storage in place, whichever ran before it.
      if (letter !== 'A') {
        const database = services.get('CrmAnalyticsDatabaseService');

        await database.runJob((run) => database.ensureStorage(run));
      }

      await section.run(context);
    } catch (error) {
      await harness.check({ id: 'ABORT', title: `section stopped: ${section.title}` }, (t) =>
        t.fail(describeError(error, services.statements.at(-1))),
      );
    }
  }

  await pagePool.end();

  const summary = harness.summary();
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  const missingAnalyticsModules = [...loader.missingAnalyticsModules];

  if (process.env.ANALYTICS_TEST_OUTPUT_FILE) {
    fs.writeFileSync(
      process.env.ANALYTICS_TEST_OUTPUT_FILE,
      JSON.stringify({
        summary,
        results: harness.results,
        database: getDatabaseName(),
        durationSeconds,
        missingAnalyticsModules,
        notes: [...new Set(services.notes)],
        unknownDependencies: [...services.unknownDependencies],
      }),
    );
  }

  console.log(
    `\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run, ${durationSeconds}s`,
  );

  if (missingAnalyticsModules.length > 0) {
    console.log(`Imported but missing: ${missingAnalyticsModules.join(', ')}`);
  }

  process.exitCode = summary.failed > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
