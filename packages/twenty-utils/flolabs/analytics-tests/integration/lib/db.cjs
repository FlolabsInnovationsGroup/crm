'use strict';
// Owns the proof database and nothing else. The CRM's "default" database is never
// opened: the admin connection goes to "postgres" and only ever names the proof database.
const {
  assertLocalDatabaseHost,
  assertProofDatabaseName,
} = require('../../lib/local-only.cjs');

const CONNECT_TIMEOUT_MS = 5_000;

const connectionConfig = () => ({
  host: assertLocalDatabaseHost(process.env.ANALYTICS_TEST_PG_HOST ?? 'localhost'),
  port: Number(process.env.ANALYTICS_TEST_PG_PORT ?? 5432),
  user: process.env.ANALYTICS_TEST_PG_USER ?? 'postgres',
  password: process.env.ANALYTICS_TEST_PG_PASSWORD ?? 'postgres',
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
});

const getDatabaseName = () =>
  assertProofDatabaseName(process.env.ANALYTICS_TEST_DATABASE ?? 'analytics_proof');

const databaseUrl = () => {
  const { host, port, user, password } = connectionConfig();

  return `postgres://${user}:${password}@${host}:${port}/${getDatabaseName()}`;
};

// Returns null when Postgres answers, else the exact reason the layer cannot run.
const checkPostgres = async (pg) => {
  const config = connectionConfig();

  getDatabaseName();

  const client = new pg.Client({ ...config, database: 'postgres' });

  try {
    await client.connect();
    await client.query('SELECT 1');

    return null;
  } catch (error) {
    const cause = error?.code ?? error?.errors?.[0]?.code ?? error?.message;

    return (
      `Postgres is not reachable on ${config.host}:${config.port} (${cause}). Start it from the worktree with: ` +
      'docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db'
    );
  } finally {
    await client.end().catch(() => {});
  }
};

const recreateDatabase = async (pg) => {
  const name = getDatabaseName();
  const admin = new pg.Client({ ...connectionConfig(), database: 'postgres' });

  await admin.connect();

  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
};

// The page pool in workspace-data-source.service.ts keeps DATE as a raw string. Jobs
// go through TypeORM's own pool, which does not.
const createPagePool = (pg) =>
  new pg.Pool({
    ...connectionConfig(),
    database: getDatabaseName(),
    max: 3,
    types: {
      getTypeParser: (oid, format) =>
        oid === pg.types.builtins.DATE
          ? (value) => value
          : pg.types.getTypeParser(oid, format),
    },
  });

module.exports = {
  checkPostgres,
  databaseUrl,
  getDatabaseName,
  recreateDatabase,
  createPagePool,
};
