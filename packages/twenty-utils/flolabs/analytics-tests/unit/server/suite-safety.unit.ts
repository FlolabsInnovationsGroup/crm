import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertLocalDatabaseHost,
  assertLocalUrl,
  assertProofDatabaseName,
  isLocalBrowserUrl,
} from '../../lib/local-only.cjs';

const SUITE_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SUITE_ROOT, '..', '..', '..', '..');
const RUNNER = path.join(SUITE_ROOT, 'run-tests.mjs');
const PRODUCTION_LIKE_URL = 'https://crm.example.com';
const CLOSED_PORT_URL = 'http://127.0.0.1:3989';

// Spawning node a few times takes well over the default 5 s on a busy machine.
const PROCESS_TEST_TIMEOUT_MS = 120_000;

const temporaryFolders: string[] = [];

afterAll(() => {
  for (const folder of temporaryFolders) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

const runRunner = (layer: string, env: Record<string, string>) => {
  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-suite-'));

  temporaryFolders.push(resultsDir);

  const { status, stdout } = spawnSync(
    process.execPath,
    [RUNNER, '--layer', layer],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ANALYTICS_TEST_RESULTS_DIR: resultsDir, ...env },
    },
  );
  const latestPath = path.join(resultsDir, `latest-${layer}.json`);
  const historyPath = path.join(resultsDir, 'history.jsonl');

  return {
    status,
    stdout,
    latest: fs.existsSync(latestPath)
      ? JSON.parse(fs.readFileSync(latestPath, 'utf8'))
      : null,
    historyLines: fs.existsSync(historyPath)
      ? fs.readFileSync(historyPath, 'utf8').trim().split('\n')
      : [],
  };
};

describe('assertLocalUrl', () => {
  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://LOCALHOST:3000/graphql', 'http://localhost:3000'],
    ['https://localhost', 'https://localhost'],
    ['http://127.0.0.1:3001', 'http://127.0.0.1:3001'],
  ])('accepts %s', (value, origin) => {
    expect(assertLocalUrl(value, 'TEST_URL')).toBe(origin);
  });

  it.each([
    PRODUCTION_LIKE_URL,
    'http://10.0.0.5:3000',
    'http://localhost.example.com',
    'http://127.0.0.1.nip.io',
    'http://example.com/localhost',
    'http://localhost@example.com',
    'http://localhost:3000@example.com',
    'http://example.com#@localhost',
    'http://[::1]:3000',
    'ftp://localhost',
    'localhost:3000',
    'not a url',
    '',
  ])('refuses %s', (value) => {
    expect(() => assertLocalUrl(value, 'TEST_URL')).toThrow(/^Refused/);
  });
});

describe('assertLocalDatabaseHost', () => {
  it.each(['localhost', '127.0.0.1'])('accepts %s', (host) => {
    expect(assertLocalDatabaseHost(host)).toBe(host);
  });

  it.each(['db.example.com', '10.0.0.5', '0.0.0.0', 'db', 'localhost.example.com', ''])(
    'refuses %s',
    (host) => {
      expect(() => assertLocalDatabaseHost(host)).toThrow(/^Refused/);
    },
  );
});

describe('assertProofDatabaseName', () => {
  it.each(['analytics_proof', 'analytics_proof_suite'])('accepts %s', (name) => {
    expect(assertProofDatabaseName(name)).toBe(name);
  });

  it.each([
    'default',
    'postgres',
    'analytics',
    'ANALYTICS_PROOF',
    'analytics_proof; DROP DATABASE "default"',
    '',
  ])('refuses %s', (name) => {
    expect(() => assertProofDatabaseName(name)).toThrow(/^Refused/);
  });
});

describe('isLocalBrowserUrl', () => {
  it('knows local addresses from everything else', () => {
    expect(isLocalBrowserUrl('http://localhost:3000/graphql')).toBe(true);
    expect(isLocalBrowserUrl('http://apple.localhost:3001/')).toBe(true);
    expect(isLocalBrowserUrl('http://127.0.0.1:3000/')).toBe(true);
    expect(isLocalBrowserUrl('https://fonts.example.com/font.woff2')).toBe(false);
    expect(isLocalBrowserUrl('https://localhost.example.com/')).toBe(false);
  });
});

describe('run-tests.mjs refuses to leave this machine', () => {
  jest.setTimeout(PROCESS_TEST_TIMEOUT_MS);

  it.each([
    ['blackbox', { ANALYTICS_TEST_API_URL: PRODUCTION_LIKE_URL }],
    ['blackbox', { ANALYTICS_TEST_FRONT_URL: PRODUCTION_LIKE_URL }],
    ['ui', { ANALYTICS_TEST_API_URL: PRODUCTION_LIKE_URL }],
    ['ui', { ANALYTICS_TEST_FRONT_URL: PRODUCTION_LIKE_URL }],
    ['integration', { ANALYTICS_TEST_PG_HOST: 'db.example.com' }],
    ['integration', { ANALYTICS_TEST_DATABASE: 'default' }],
  ])('%s with %j fails and says why', (layer, env) => {
    const { status, latest, historyLines } = runRunner(layer, env);

    expect(status).toBe(1);
    expect(latest.status).toBe('FAILED');
    expect(latest.failures[0].message).toMatch(/^Refused/);
    expect(historyLines).toHaveLength(1);
  });

  it('the integration harness refuses when started directly', () => {
    const { status, stderr } = spawnSync(
      process.execPath,
      [path.join(SUITE_ROOT, 'integration/run.cjs')],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, ANALYTICS_TEST_PG_HOST: 'db.example.com' },
      },
    );

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Refused/);
  });

  it('a blackbox test file refuses when started directly', () => {
    const { status, stdout } = spawnSync(
      process.execPath,
      ['--test', path.join(SUITE_ROOT, 'blackbox/auth-and-input.test.mjs')],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, ANALYTICS_TEST_API_URL: PRODUCTION_LIKE_URL },
      },
    );

    expect(status).not.toBe(0);
    expect(stdout).toMatch(/Refused/);
  });

  it('the Playwright config refuses when started directly', () => {
    const { status, stderr, stdout } = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'node_modules/@playwright/test/cli.js'),
        'test',
        `--config=${path.join(SUITE_ROOT, 'ui/playwright.config.ts')}`,
        '--list',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, ANALYTICS_TEST_FRONT_URL: PRODUCTION_LIKE_URL },
      },
    );

    expect(status).not.toBe(0);
    expect(`${stdout}${stderr}`).toMatch(/Refused/);
  });
});

describe('run-tests.mjs skips a missing prerequisite instead of failing', () => {
  jest.setTimeout(PROCESS_TEST_TIMEOUT_MS);

  it.each([
    ['blackbox', { ANALYTICS_TEST_API_URL: CLOSED_PORT_URL }, /not answering on http:\/\/127\.0\.0\.1:3989 \(ECONNREFUSED\)/],
    ['ui', { ANALYTICS_TEST_API_URL: CLOSED_PORT_URL }, /not answering on http:\/\/127\.0\.0\.1:3989 \(ECONNREFUSED\)/],
    ['integration', { ANALYTICS_TEST_PG_PORT: '3989' }, /Postgres is not reachable on localhost:3989 \(ECONNREFUSED\).*docker compose/],
  ])('%s with %j is SKIPPED with the reason', (layer, env, reason) => {
    const { status, stdout, latest, historyLines } = runRunner(layer, env);

    expect(status).toBe(0);
    expect(stdout).toMatch(reason);
    expect(latest).toMatchObject({
      layer,
      status: 'SKIPPED',
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    });
    expect(latest.reason).toMatch(reason);
    expect(latest.durationMs).toEqual(expect.any(Number));

    const historyEntry = JSON.parse(historyLines[0]);

    expect(historyLines).toHaveLength(1);
    expect(historyEntry).toMatchObject({ layer, status: 'SKIPPED' });
    expect(Number.isNaN(Date.parse(historyEntry.timestamp))).toBe(false);
  });

  it('a port held by another app is not mistaken for the CRM', () => {
    const { server, url } = startHttpServerProcess();

    try {
      const { status, latest } = runRunner('blackbox', { ANALYTICS_TEST_API_URL: url });

      expect(status).toBe(0);
      expect(latest.status).toBe('SKIPPED');
      expect(latest.reason).toMatch(/it is not the CRM/);
    } finally {
      server.kill();
    }
  });

  it('an unknown layer is a usage error', () => {
    const { status } = spawnSync(process.execPath, [RUNNER, '--layer', 'nope'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(status).toBe(2);
  });
});

// A plain page answering every path, as a different local app on the port would.
const startHttpServerProcess = () => {
  const port = 3990 + Math.floor(Math.random() * 9);
  const server = spawn(process.execPath, [
    '-e',
    `require('http').createServer((_, response) => { response.statusCode = 404; response.setHeader('content-type', 'text/html'); response.end('<html>not found</html>'); }).listen(${port})`,
  ]);

  spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']);

  return { server, url: `http://localhost:${port}` };
};
