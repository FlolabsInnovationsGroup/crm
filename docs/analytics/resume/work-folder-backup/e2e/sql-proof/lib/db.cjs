'use strict';
// Owns the analytics_proof database and nothing else. The CRM's "default" database is
// never opened: the admin connection goes to "postgres" and only ever names DATABASE.
const DATABASE = 'analytics_proof';

const connectionConfig = () => ({
  host: process.env.ANALYTICS_PROOF_PG_HOST ?? 'localhost',
  port: Number(process.env.ANALYTICS_PROOF_PG_PORT ?? 5432),
  user: process.env.ANALYTICS_PROOF_PG_USER ?? 'postgres',
  password: process.env.ANALYTICS_PROOF_PG_PASSWORD ?? 'postgres',
});

const databaseUrl = () => {
  const { host, port, user, password } = connectionConfig();

  return `postgres://${user}:${password}@${host}:${port}/${DATABASE}`;
};

const waitForServer = async (pg, attempts = 30) => {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const client = new pg.Client({ ...connectionConfig(), database: 'postgres' });

    try {
      await client.connect();

      return client;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error(
    `Postgres is not reachable: ${lastError?.message}. Start it from the worktree with: ` +
      'docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db',
  );
};

const recreateDatabase = async (pg) => {
  const admin = await waitForServer(pg);

  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await admin.end();
  }
};

// The page pool in workspace-data-source.service.ts keeps DATE as a raw string. Jobs
// go through TypeORM's own pool, which does not.
const createPagePool = (pg) =>
  new pg.Pool({
    ...connectionConfig(),
    database: DATABASE,
    max: 3,
    types: {
      getTypeParser: (oid, format) =>
        oid === pg.types.builtins.DATE
          ? (value) => value
          : pg.types.getTypeParser(oid, format),
    },
  });

module.exports = { DATABASE, databaseUrl, recreateDatabase, createPagePool };
