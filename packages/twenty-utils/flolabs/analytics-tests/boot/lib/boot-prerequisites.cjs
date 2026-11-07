'use strict';
// What the boot layer needs before it may start anything. A server's .env decides where it
// connects, so a host there that is not this machine refuses the run, it does not skip it.
const fs = require('node:fs');
const path = require('node:path');

const { assertLocalConnectionUrl } = require('../../lib/local-only.cjs');
const { checkDatabaseAndRedis } = require('../../live/lib/local-crm.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const SERVER_ROOT = path.join(REPO_ROOT, 'packages/twenty-server');

const BUILD_FILES = {
  server: 'dist/main.js',
  worker: 'dist/queue-worker/queue-worker.js',
  command: 'dist/command/command.js',
};

const readServerEnv = () => {
  const envPath = path.join(SERVER_ROOT, '.env');

  if (!fs.existsSync(envPath)) {
    return null;
  }

  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
      .filter((match) => match !== null)
      .map(([, name, value]) => [name, value.replace(/^["']|["']$/g, '')]),
  );
};

const checkBootPrerequisites = async () => {
  const missingBuild = Object.values(BUILD_FILES).find(
    (file) => !fs.existsSync(path.join(SERVER_ROOT, file)),
  );

  if (missingBuild !== undefined) {
    return `packages/twenty-server/${missingBuild} is missing. Build the server first.`;
  }

  const serverEnv = readServerEnv();

  if (serverEnv === null) {
    return 'packages/twenty-server/.env is missing. Copy it from .env.example.';
  }

  for (const name of ['PG_DATABASE_URL', 'REDIS_URL']) {
    if (serverEnv[name] === undefined) {
      return `packages/twenty-server/.env has no ${name}.`;
    }

    assertLocalConnectionUrl(serverEnv[name], name);
  }

  return checkDatabaseAndRedis();
};

module.exports = { BUILD_FILES, REPO_ROOT, SERVER_ROOT, checkBootPrerequisites };
