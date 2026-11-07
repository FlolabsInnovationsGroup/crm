// Contract P12, the part no unit test can answer: ModulesModule loads in the server, the worker
// and the commands, so a bad provider or a duplicate GraphQL type stops the whole CRM. This
// starts each from the real build, one at a time, on a spare port, then stops them.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  BUILD_FILES,
  SERVER_ROOT,
} = require('./lib/boot-prerequisites.cjs');
const { assertLocalUrl } = require('../lib/local-only.cjs');
const { countWorkers, openDatabase, openQueue } = require('../live/lib/local-crm.cjs');

const BOOT_PORT = Number(process.env.ANALYTICS_TEST_BOOT_PORT ?? 3100);
const BOOT_URL = assertLocalUrl(`http://localhost:${BOOT_PORT}`, 'boot port');

// api-client reads this on each call, so these requests go to the server started here.
process.env.ANALYTICS_TEST_API_URL = BOOT_URL;

const {
  ADMIN_EMAIL,
  callAnalytics,
  login,
  postGraphql,
} = require('../blackbox/lib/api-client.cjs');

const RESULTS_ROOT = process.env.ANALYTICS_TEST_RESULTS_DIR ?? SERVER_ROOT;
const SERVER_BOOT_LIMIT_MS = 180_000;
const WORKER_BOOT_LIMIT_MS = 150_000;
const COMMAND_LIMIT_MS = 90_000;
const STAYS_UP_MS = 5_000;
const POLL_INTERVAL_MS = 1_000;

const WORKER_QUEUE = 'workspace-queue';
const CRON_QUEUE = 'cron-queue';
const CRON_PATTERNS = {
  CrmAnalyticsSyncCronJob: '7,22,37,52 * * * *',
  CrmAnalyticsDailyCronJob: '30 2 * * *',
};

// Each stops a boot, whatever the app, and none can appear in a healthy log.
const BOOT_STOPPING_ERRORS = [
  /Nest can't resolve dependencies/,
  /UnknownDependenciesException/,
  /UndefinedDependencyException/,
  /Schema must contain uniquely named types/,
  /Cannot determine a GraphQL (output|input) type/,
  /Nest cannot create the .* instance/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const running = new Set();

const stop = (child) => {
  running.delete(child);

  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
};

after(() => {
  for (const child of running) {
    stop(child);
  }
});

const logPathOf = (name) => path.join(RESULTS_ROOT, `latest-boot-${name}.log`);

const start = (name, file, env = {}, args = []) => {
  const logFile = fs.openSync(logPathOf(name), 'w');
  const child = spawn(process.execPath, [file, ...args], {
    cwd: SERVER_ROOT,
    env: { ...process.env, NODE_ENV: 'development', ...env },
    stdio: ['ignore', logFile, logFile],
  });

  child.once('exit', () => fs.closeSync(logFile));
  running.add(child);

  return child;
};

const readLog = (name) => {
  try {
    return fs.readFileSync(logPathOf(name), 'utf8').replace(/\u001b\[[0-9;]*m/g, '');
  } catch {
    return '';
  }
};

const assertCleanLog = (name) => {
  const log = readLog(name);

  for (const pattern of BOOT_STOPPING_ERRORS) {
    assert.doesNotMatch(log, pattern, `in ${logPathOf(name)}`);
  }

  // Errors the CRM logs for its own reasons are not this tool's. Its own are.
  const analyticsErrors = log
    .split('\n')
    .filter((line) => /\bERROR\b/.test(line) && /analytics/i.test(line));

  assert.deepEqual(analyticsErrors, [], `analytics errors in ${logPathOf(name)}`);
};

const waitUntil = async (isDone, child, name, limitMs) => {
  const deadline = Date.now() + limitMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      assert.fail(`${name} exited with ${child.exitCode}. Log: ${readLog(name).slice(-1500)}`);
    }

    if (await isDone()) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  assert.fail(`${name} was not up after ${limitMs} ms. Log: ${readLog(name).slice(-1500)}`);
};

const runCommand = (name, args) =>
  new Promise((resolve) => {
    const child = start(name, BUILD_FILES.command, {}, args);
    const timer = setTimeout(() => stop(child), COMMAND_LIMIT_MS);

    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      running.delete(child);
      resolve(exitCode);
    });
  });

const newestModifiedAt = (folder) =>
  Math.max(
    ...fs
      .readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && !/\.(spec|test)\.ts$/.test(entry.name))
      .map((entry) => fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs),
  );

test('the build is of the current analytics code, or this says what it proves nothing about', (t) => {
  const moduleFile = path.join(SERVER_ROOT, 'dist/modules/analytics/crm-analytics.module.js');

  assert.ok(fs.existsSync(moduleFile), 'the build has no analytics module at all');
  assert.match(
    fs.readFileSync(path.join(SERVER_ROOT, 'dist/modules/modules.module.js'), 'utf8'),
    /CrmAnalyticsModule/,
    'the build does not register the analytics module',
  );

  const sourceAt = newestModifiedAt(path.join(SERVER_ROOT, 'src/modules/analytics'));
  const builtAt = fs.statSync(moduleFile).mtimeMs;

  if (sourceAt > builtAt) {
    t.skip(
      `The build is ${Math.round((sourceAt - builtAt) / 60000)} minutes older than the analytics source, so the boot below does not prove the latest code. Rebuild the server.`,
    );
  }
});

test('the server boots, serves the CRM and the analytics API, with no boot error', { timeout: SERVER_BOOT_LIMIT_MS + 60_000 }, async () => {
  const server = start('server', BUILD_FILES.server, { NODE_PORT: String(BOOT_PORT) });

  try {
    await waitUntil(
      async () => {
        try {
          const response = await fetch(`${BOOT_URL}/healthz`, {
            redirect: 'error',
            signal: AbortSignal.timeout(POLL_INTERVAL_MS * 3),
          });

          return response.status === 200;
        } catch {
          return false;
        }
      },
      server,
      'server',
      SERVER_BOOT_LIMIT_MS,
    );

    assertCleanLog('server');

    const token = await login(ADMIN_EMAIL);

    // Existing CRM reads still answer on both schemas.
    const people = await postGraphql({
      path: '/graphql',
      token,
      query: 'query { people(first: 1) { edges { node { id } } } }',
    });

    assert.deepEqual(people.body?.errors ?? [], [], 'people on the core schema');
    assert.ok(Array.isArray(people.body?.data?.people?.edges));

    const currentUser = await postGraphql({
      path: '/metadata',
      token,
      query: 'query { currentUser { id } }',
    });

    assert.deepEqual(currentUser.body?.errors ?? [], [], 'current user on the metadata schema');

    // The whole schema really built: both analytics types beside the older Analytics names.
    const schema = await postGraphql({
      path: '/graphql',
      token,
      query: 'query { getCrmAnalyticsMeta { payload } __schema { types { name } } }',
    });

    assert.deepEqual(schema.body?.errors ?? [], [], 'analytics meta on the core schema');

    const typeNames = schema.body.data.__schema.types.map(({ name }) => name);

    assert.ok(typeNames.includes('CrmAnalyticsPayload'));
    assert.ok(typeNames.includes('CrmAnalyticsFilterInput'));
    assert.equal(new Set(typeNames).size, typeNames.length, 'a type name appears twice');

    const meta = await callAnalytics('meta', {}, token);

    assert.notEqual(meta.payload, null);

    await sleep(STAYS_UP_MS);

    assert.equal(server.exitCode, null, 'the server stopped by itself');
    assertCleanLog('server');
  } finally {
    stop(server);
  }
});

test('the worker boots and registers on the queue the analytics jobs use', { timeout: WORKER_BOOT_LIMIT_MS + 60_000 }, async () => {
  const workersBefore = await countWorkers(WORKER_QUEUE);
  const worker = start('worker', BUILD_FILES.worker);

  try {
    await waitUntil(
      async () => (await countWorkers(WORKER_QUEUE)) > workersBefore,
      worker,
      'worker',
      WORKER_BOOT_LIMIT_MS,
    );

    await sleep(STAYS_UP_MS);

    assert.equal(worker.exitCode, null, 'the worker stopped by itself');
    assertCleanLog('worker');
  } finally {
    stop(worker);
  }
});

test('the register command runs and both analytics crons are registered with their patterns', { timeout: COMMAND_LIMIT_MS + 30_000 }, async () => {
  const exitCode = await runCommand('cron-register', ['cron:register:all']);

  assert.equal(exitCode, 0, readLog('cron-register').slice(-1500));
  assertCleanLog('cron-register');

  const queue = openQueue(CRON_QUEUE);

  try {
    const schedulers = await queue.getJobSchedulers();

    for (const [jobName, pattern] of Object.entries(CRON_PATTERNS)) {
      const scheduler = schedulers.find(({ name }) => name === jobName);

      assert.ok(scheduler, `${jobName} is not registered`);
      assert.equal(scheduler.pattern, pattern, jobName);
    }
  } finally {
    await queue.close();
  }
});

test('the run command enqueues a job, and refuses one that does not exist', { timeout: COMMAND_LIMIT_MS * 2 + 30_000 }, async () => {
  const { pool, workspaceId } = await openDatabase();

  await pool.end();

  const goodExit = await runCommand('run-command', [
    'crm-analytics:run',
    '--workspace-id',
    workspaceId,
    '--job',
    'sync',
  ]);

  assert.equal(goodExit, 0, readLog('run-command').slice(-1500));
  assert.match(readLog('run-command'), /Enqueued CrmAnalyticsWorkspaceSyncJob/);
  assertCleanLog('run-command');

  const badExit = await runCommand('run-command-refused', [
    'crm-analytics:run',
    '--workspace-id',
    workspaceId,
    '--job',
    'weekly',
  ]);

  assert.notEqual(badExit, 0, 'an unknown job name must not exit clean');
});
