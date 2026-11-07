'use strict';
// Constructs the REAL analytics classes directly, as the module's specs do. Only their
// outside dependencies are fake: metadata cache, user vars, message queue, workspace
// ORM. Job statements still go through the real runJob and a real TypeORM DataSource.
const fs = require('node:fs');

const SERVICES = 'src/modules/analytics/services/';
const MAX_KEPT_STATEMENTS = 500;

const ANALYTICS_CLASSES = {
  CrmAnalyticsFacadeService: 'src/modules/analytics/facade/crm-analytics-facade.service',
  CrmAnalyticsDatabaseService: `${SERVICES}crm-analytics-database.service`,
  CrmAnalyticsSettingsService: `${SERVICES}crm-analytics-settings.service`,
  CrmAnalyticsSyncService: `${SERVICES}crm-analytics-sync.service`,
  CrmAnalyticsSnapshotService: `${SERVICES}crm-analytics-snapshot.service`,
  CrmAnalyticsMetricsService: `${SERVICES}crm-analytics-metrics.service`,
  CrmAnalyticsReportService: `${SERVICES}crm-analytics-report.service`,
  CrmAnalyticsMetaService: `${SERVICES}crm-analytics-meta.service`,
  CrmAnalyticsWorkspaceSyncJob: 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job',
  CrmAnalyticsWorkspaceDailyJob: 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job',
};

// Reads constructor parameter types from the source, because esbuild emits no decorator
// metadata. A later constructor change is picked up on the next run.
const parseConstructorParameterTypes = (source) => {
  const match = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(source);

  if (match === null) return [];

  return match[1]
    .replace(/@\w+\([^)]*\)/g, '')
    .replace(/<[^>]*>/g, '')
    .split(',')
    .map((parameter) => parameter.trim())
    .filter((parameter) => parameter.length > 0)
    .map((parameter) => /:\s*([A-Za-z0-9_]+)/.exec(parameter)?.[1]);
};

const createRealServices = ({ loader, pagePool, databaseUrl, workspaces }) => {
  const statements = [];
  const queueCalls = [];
  const notes = [];
  const unknownDependencies = new Set();
  const timing = { count: 0, totalMs: 0, slowest: [] };

  const recordStatement = (origin, sql, parameters, durationMs) => {
    statements.push({ origin, sql, parameters, durationMs });

    if (statements.length > MAX_KEPT_STATEMENTS) statements.shift();

    timing.count += 1;
    timing.totalMs += durationMs;
    // The tail names the query: every metric statement starts with the same mapping CTEs.
    timing.slowest.push({ durationMs, origin, sql: sql.slice(-400).replace(/\s+/g, ' ') });
    timing.slowest.sort((first, second) => second.durationMs - first.durationMs);
    timing.slowest.length = Math.min(timing.slowest.length, 5);
  };

  const spyRunner = (origin, run) => async (sql, parameters) => {
    const startedAt = Date.now();

    try {
      return await run(sql, parameters);
    } finally {
      recordStatement(origin, sql, parameters, Date.now() - startedAt);
    }
  };

  const fakes = {
    Repository: {
      find: async () =>
        [...workspaces.values()]
          .filter((workspace) => workspace.isActive !== false)
          .map((workspace) => ({ id: workspace.workspaceId })),
    },
    WorkspaceManyOrAllFlatEntityMapsCacheService: {
      getOrRecomputeManyOrAllFlatEntityMaps: async ({ workspaceId }) => {
        const workspace = workspaces.get(workspaceId);

        if (workspace === undefined) {
          throw new Error(`Harness has no metadata for workspace ${workspaceId}`);
        }

        return workspace.flatMaps;
      },
    },
    UserVarsService: {
      get: async ({ workspaceId, key }) => workspaces.get(workspaceId)?.vars.get(key),
    },
    KeyValuePairService: {},
    MessageQueueService: {
      add: async (jobName, data) => {
        queueCalls.push({ jobName, data });
      },
    },
    WorkspaceOrmManager: {
      executeInWorkspaceContext: (work) => work(),
      // Same statement path as ClientQueryExecutor: one client, one transaction.
      runInWorkspaceTransaction: async (work) => {
        const client = await pagePool.connect();

        try {
          await client.query('BEGIN');

          const result = await work({
            executeRawQuery: async (sql, parameters = []) =>
              (await client.query({ text: sql, values: parameters })).rows,
          });

          await client.query('COMMIT');

          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
    },
    // Same extra options as core.datasource.ts, so runJob's override of the 10 s client
    // limit is what gets tested.
    DataSource: {
      options: {
        type: 'postgres',
        url: databaseUrl,
        logging: false,
        extra: { query_timeout: 10000, idleTimeoutMillis: 600000, allowExitOnIdle: false },
      },
    },
  };

  const instances = new Map();

  const resolve = (typeName) => {
    if (instances.has(typeName)) return instances.get(typeName);

    const instance = construct(typeName);

    instances.set(typeName, instance);

    return instance;
  };

  const construct = (typeName) => {
    if (typeName in fakes) return fakes[typeName];

    const request = ANALYTICS_CLASSES[typeName];

    if (request === undefined) {
      unknownDependencies.add(typeName);

      return new Proxy({}, {
        get: (_, method) => () => {
          throw new Error(`Harness has no fake for ${typeName}.${String(method)}`);
        },
      });
    }

    if (!loader.fileExists(request)) {
      // The daily job still runs on its other steps, and the checks that need this
      // class report NOT RUN.
      notes.push(`${request}.ts is missing; jobs ran with an empty stand-in for it`);

      return typeName === 'CrmAnalyticsReportService'
        ? { buildMissingReports: async () => 0 }
        : {};
    }

    const source = fs.readFileSync(loader.serverPath(request), 'utf8');
    const parameters = parseConstructorParameterTypes(source).map(resolve);
    const moduleExports = loader.real(request);
    const instance = new moduleExports[typeName](...parameters);

    // The real methods still do the work; this only records what they send.
    if (typeName === 'CrmAnalyticsDatabaseService') {
      const runJob = instance.runJob.bind(instance);
      const runPageTransaction = instance.runPageTransaction.bind(instance);

      instance.runJob = (work) => runJob((run) => work(spyRunner('job', run)));
      instance.runPageTransaction = (workspaceId, work) =>
        runPageTransaction(workspaceId, (run) => work(spyRunner('page', run)));
    }

    return instance;
  };

  return {
    get: resolve,
    timing,
    has: (typeName) => loader.fileExists(ANALYTICS_CLASSES[typeName]),
    requestOf: (typeName) => ANALYTICS_CLASSES[typeName],
    statements,
    queueCalls,
    notes,
    unknownDependencies,
  };
};

module.exports = { createRealServices, ANALYTICS_CLASSES };
