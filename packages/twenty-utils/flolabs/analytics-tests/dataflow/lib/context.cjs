'use strict';
// Runs the REAL analytics classes on real Postgres through the integration layer's own
// harness: its loader, database helpers, CRM table builder and class wiring. The database
// is this run's alone, so it cannot disturb the integration layer or another run of this one.
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const SUITE_ROOT = path.resolve(__dirname, '..', '..');
const HARNESS_ROOT = path.join(SUITE_ROOT, 'integration', 'lib');

const DATAFLOW_DATABASE_PREFIX = 'analytics_proof_dataflow';
const HARNESS_FILES = ['db.cjs', 'loader.cjs', 'crm-tables.cjs', 'real-services.cjs'];

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const ANALYTICS_SERVER_ROOT = 'src/modules/analytics/';
const RESOLVER_REQUEST = `${ANALYTICS_SERVER_ROOT}resolvers/crm-analytics.resolver`;
const CONFIG_REQUEST = `${ANALYTICS_SERVER_ROOT}constants/crm-analytics-config.constant`;
const RELOADED_FOLDERS = ['services', 'jobs', 'resolvers', 'facade'];

// JSON is what GraphQLJSON sends, so a Date or a NaN that would not survive shows here.
const toWire = (result) => JSON.parse(JSON.stringify(result.payload));

const createContext = async () => {
  const missingFile = HARNESS_FILES.find((file) => !fs.existsSync(path.join(HARNESS_ROOT, file)));

  if (missingFile !== undefined) {
    return { unavailableReason: `the integration harness has no ${missingFile} yet` };
  }

  const databaseName = `${DATAFLOW_DATABASE_PREFIX}${process.pid}`;

  process.env.ANALYTICS_TEST_DATABASE = databaseName;

  const { checkPostgres, createPagePool, databaseUrl, recreateDatabase } = require(path.join(HARNESS_ROOT, 'db.cjs'));
  const { installLoader } = require(path.join(HARNESS_ROOT, 'loader.cjs'));
  const { createCrmFactory, createFixtures } = require(path.join(HARNESS_ROOT, 'crm-tables.cjs'));
  const { createRealServices } = require(path.join(HARNESS_ROOT, 'real-services.cjs'));

  const loader = installLoader(REPO_ROOT);
  const pg = loader.repoRequire('pg');
  const postgresProblem = await checkPostgres(pg);

  if (postgresProblem !== null) {
    return { unavailableReason: postgresProblem };
  }

  const adminUrl = new URL(databaseUrl());

  adminUrl.pathname = '/postgres';

  const runAsAdmin = async (work) => {
    const admin = new pg.Client({ connectionString: adminUrl.toString() });

    await admin.connect();

    try {
      return await work(admin);
    } finally {
      await admin.end();
    }
  };

  // Left by a run that crashed. An hour old, so never one that is still going.
  await runAsAdmin(async (admin) => {
    const { rows } = await admin.query(
      `SELECT d.datname FROM pg_database d
       WHERE d.datname LIKE $1
         AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)
         AND (pg_stat_file('base/' || d.oid || '/PG_VERSION')).modification < now() - interval '1 hour'`,
      [`${DATAFLOW_DATABASE_PREFIX}%`],
    );

    for (const { datname } of rows) {
      await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
  });

  await recreateDatabase(pg);

  const pagePool = createPagePool(pg);

  // An idle connection that dies must fail the next query, not the whole process.
  pagePool.on('error', () => {});

  const query = async (sql, parameters = []) => (await pagePool.query(sql, parameters)).rows;

  // The real column generator defaults ids to public.uuid_generate_v4(), as in the CRM.
  await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  const { FieldMetadataType, RelationType } = loader.repoRequire('twenty-shared/types');
  const { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } =
    loader.repoRequire('twenty-shared/application');

  const workspaces = new Map();
  const factory = createCrmFactory({
    loader,
    standardApplicationId: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    FieldMetadataType,
    RelationType,
  });

  // One set of real classes with their shared statement spy and the page helpers on top.
  const createServiceSet = ({ pool = pagePool } = {}) => {
    const services = createRealServices({
      loader,
      pagePool: pool,
      databaseUrl: databaseUrl(),
      workspaces,
    });

    if (services.has('CrmAnalyticsDatabaseService')) {
      services.get('CrmAnalyticsDatabaseService');
    }

    let resolver;

    // Built on first use, so a class still being written only skips the tests that need it.
    const getResolver = () => {
      if (resolver === undefined) {
        const { CrmAnalyticsResolver } = loader.real(RESOLVER_REQUEST);

        resolver = new CrmAnalyticsResolver(
          services.get('CrmAnalyticsMetaService'),
          services.get('CrmAnalyticsMetricsService'),
          services.get('CrmAnalyticsReportService'),
        );
      }

      return resolver;
    };

    return {
      services,
      statements: services.statements,
      page: {
        meta: async ({ workspaceId }) =>
          toWire(await getResolver().getCrmAnalyticsMeta({ id: workspaceId })),
        overview: async ({ workspaceId }, filter = {}) =>
          toWire(await getResolver().getCrmAnalyticsOverview({ id: workspaceId }, filter)),
        funnel: async ({ workspaceId }, filter = {}) =>
          toWire(await getResolver().getCrmAnalyticsFunnel({ id: workspaceId }, filter)),
        categories: async ({ workspaceId }, groupBy, filter = {}) =>
          toWire(await getResolver().getCrmAnalyticsCategories({ id: workspaceId }, filter, groupBy)),
        trends: async ({ workspaceId }, metric, { filter = {}, stageKey = null } = {}) =>
          toWire(await getResolver().getCrmAnalyticsTrends({ id: workspaceId }, filter, metric, stageKey)),
        reports: async ({ workspaceId }) =>
          toWire(await getResolver().getCrmAnalyticsReports({ id: workspaceId })),
        report: async ({ workspaceId }, periodType, periodStart) =>
          toWire(await getResolver().getCrmAnalyticsReport({ id: workspaceId }, periodType, periodStart)),
      },
      runDaily: ({ workspaceId }) =>
        services.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId }),
      runSync: ({ workspaceId }) =>
        services.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId }),
    };
  };

  const clearAnalyticsModules = () => {
    for (const modulePath of Object.keys(require.cache)) {
      const normalized = modulePath.replace(/\\/g, '/');

      if (RELOADED_FOLDERS.some((folder) => normalized.includes(`/modules/analytics/${folder}/`))) {
        delete require.cache[modulePath];
      }
    }
  };

  // Metrics derives constants from the config at load, so altered values need fresh
  // modules. Alter works on deep copies: the original objects stay untouched for the
  // service set everything else keeps using.
  const withAlteredConfig = async (alter, work) => {
    const { CRM_ANALYTICS_CONFIG: config } = loader.real(CONFIG_REQUEST);
    const original = { ...config };

    Object.assign(config, structuredClone(original));
    alter(config);
    clearAnalyticsModules();

    try {
      return await work(createServiceSet());
    } finally {
      Object.assign(config, original);
      clearAnalyticsModules();
    }
  };

  const defaultSet = createServiceSet();
  const [{ now: databaseNow }] = await query('SELECT now()');
  let workspaceCounter = 0;

  const createWorkspace = async (options = {}) => {
    workspaceCounter += 1;

    const workspaceId = `20202020-d000-4000-8000-${String(workspaceCounter).padStart(12, '0')}`;
    const workspace = await factory.createWorkspace({ query, workspaceId, ...options });

    workspaces.set(workspaceId, workspace);
    workspace.fixtures = createFixtures({
      query,
      workspace,
      objectRecordDiffMerge: factory.objectRecordDiffMerge,
    });
    workspace.people = {};
    workspace.keyOf = new Map();
    workspace.setTrackingStart = (date) => {
      workspace.trackingStart = date;
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', date.toISOString());
    };

    return workspace;
  };

  return {
    ...defaultSet,
    close: async () => {
      await pagePool.end();
      await runAsAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`));
    },
    createPagePool: () => createPagePool(pg),
    createServiceSet,
    createWorkspace,
    databaseName,
    daysAgo: (days) => new Date(databaseNow.getTime() - days * DAY_MS),
    factory,
    loader,
    minutesAgo: (minutes) => new Date(databaseNow.getTime() - minutes * MINUTE_MS),
    now: databaseNow,
    query,
    requirement: (typeName) => ({
      isAvailable: defaultSet.services.has(typeName),
      label: `${defaultSet.services.requestOf(typeName)}.ts`,
    }),
    resolverRequirement: {
      isAvailable: loader.fileExists(RESOLVER_REQUEST),
      label: `${RESOLVER_REQUEST}.ts`,
    },
    withAlteredConfig,
    workspaces,
  };
};

module.exports = { REPO_ROOT, SUITE_ROOT, createContext };
