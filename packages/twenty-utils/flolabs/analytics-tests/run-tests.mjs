#!/usr/bin/env node
// One entry point for the CRM Analytics suite. See README.md.
//   node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <name>
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { findChromium } = require('./lib/find-chromium.cjs');
const { RefusedTargetError } = require('./lib/local-only.cjs');
const {
  checkAnalyticsApi,
  checkFront,
} = require('./blackbox/lib/api-client.cjs');
const { checkPostgres } = require('./integration/lib/db.cjs');
const {
  computeExitCode,
  describeAllStatus,
  describeFinishedLayer,
} = require('./lib/layer-status.cjs');
const { checkBootPrerequisites } = require('./boot/lib/boot-prerequisites.cjs');
const {
  assertLiveTargetsAreLocal,
  checkLiveStack,
} = require('./live/lib/local-crm.cjs');

const SUITE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SUITE_ROOT, '..', '..', '..', '..');
const RESULTS_ROOT =
  process.env.ANALYTICS_TEST_RESULTS_DIR ??
  path.resolve(REPO_ROOT, '..', 'analytics-work', 'test-results');
const repoRequire = createRequire(path.join(REPO_ROOT, 'package.json'));

const ANALYTICS_SERVER_ROOT = path.join(
  REPO_ROOT,
  'packages/twenty-server/src/modules/analytics',
);
const ANALYTICS_FRONT_ROOT = path.join(
  REPO_ROOT,
  'packages/twenty-front/src/modules/crm-analytics',
);
const JEST_BIN = path.join(REPO_ROOT, 'node_modules/jest/bin/jest.js');
const PLAYWRIGHT_CLI = path.join(
  REPO_ROOT,
  'node_modules/@playwright/test/cli.js',
);

// The integration harness cannot start without these. Every other product file only
// skips the checks that need it.
const HARNESS_PRODUCT_FILES = [
  'constants/crm-analytics-config.constant.ts',
  'constants/crm-analytics-ddl.constant.ts',
  'facade/crm-analytics-facade.service.ts',
  'services/crm-analytics-database.service.ts',
  'services/crm-analytics-settings.service.ts',
  'services/crm-analytics-sync.service.ts',
  'services/crm-analytics-snapshot.service.ts',
  'jobs/crm-analytics-workspace-sync.job.ts',
  'jobs/crm-analytics-workspace-daily.job.ts',
  'utils/build-crm-analytics-cte.util.ts',
];

// Runs only the matching tests of a layer, for a quick rerun.
const ONLY_PATTERN = process.env.ANALYTICS_TEST_ONLY;

// A layer may never run past 9 minutes, so the watchdog stops it with time to report.
const LAYER_TIME_LIMIT_MS = 8.5 * 60 * 1000;
const FAILURE_MESSAGE_LIMIT = 2000;
const PRINTED_FAILURES_LIMIT = 10;

const stripAnsi = (text) =>
  String(text ?? '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

const clip = (text) => {
  const clean = stripAnsi(text).trim();

  return clean.length > FAILURE_MESSAGE_LIMIT
    ? `${clean.slice(0, FAILURE_MESSAGE_LIMIT)}...`
    : clean;
};

const skippedLayer = (reason) => ({
  status: 'SKIPPED',
  reason,
  passed: 0,
  failed: 0,
  skipped: 0,
  failures: [],
  skippedTests: [],
});

const failedLayer = (test, message) => ({
  status: 'FAILED',
  reason: message,
  passed: 0,
  failed: 1,
  skipped: 0,
  failures: [{ test, message: clip(message) }],
  skippedTests: [],
});

const missingPath = (candidates) =>
  candidates.find((candidate) => !fs.existsSync(candidate));

const listFiles = (root, pattern) => {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
};

const killProcessTree = (child) => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });

    return;
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
};

// Child output goes to a log file, so a run prints only its own summary.
const runChild = ({ layer, args, env, deadline }) =>
  new Promise((resolve) => {
    const logPath = path.join(RESULTS_ROOT, `latest-${layer}.log`);
    const logFile = fs.openSync(logPath, 'w');
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', logFile, logFile],
      detached: process.platform !== 'win32',
    });
    let timedOut = false;

    const watchdog = setTimeout(
      () => {
        timedOut = true;
        killProcessTree(child);
      },
      Math.max(deadline - Date.now(), 1000),
    );

    let hasFinished = false;

    // A failed spawn can report both events.
    const finish = (exitCode, spawnError) => {
      if (hasFinished) {
        return;
      }

      hasFinished = true;
      clearTimeout(watchdog);
      fs.closeSync(logFile);
      resolve({ exitCode, timedOut, spawnError, logPath });
    };

    child.once('error', (error) => finish(null, error));
    child.once('exit', (exitCode) => finish(exitCode, undefined));
  });

const processProblem = ({ timedOut, spawnError, logPath }, layer) => {
  if (timedOut) {
    return failedLayer(
      `${layer} layer`,
      `Stopped after ${LAYER_TIME_LIMIT_MS / 60000} minutes, the layer time limit. Log: ${logPath}`,
    );
  }

  if (spawnError !== undefined) {
    return failedLayer(`${layer} layer`, spawnError.message);
  }

  return null;
};

const readLogTail = (logPath) => {
  try {
    return fs.readFileSync(logPath, 'utf8').slice(-FAILURE_MESSAGE_LIMIT);
  } catch {
    return '';
  }
};

const readJsonOrNull = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const finishedLayer = ({ passed, failures, skippedTests }) => {
  return {
    ...describeFinishedLayer({ passed, failures, skippedTests }),
    passed,
    failed: failures.length,
    skipped: skippedTests.length,
    failures,
    skippedTests,
  };
};

const normalizeJest = (report) => {
  const failures = [];
  const skippedTests = [];
  let passed = 0;

  for (const suite of report.testResults) {
    const suiteName = path.relative(REPO_ROOT, suite.name);

    if (suite.assertionResults.length === 0 && suite.status === 'failed') {
      failures.push({ test: suiteName, message: clip(suite.message) });
    }

    for (const assertion of suite.assertionResults) {
      if (assertion.status === 'passed') {
        passed += 1;
      } else if (assertion.status === 'failed') {
        failures.push({
          test: `${suiteName} > ${assertion.fullName}`,
          message: clip(assertion.failureMessages.join('\n')),
        });
      } else {
        skippedTests.push({
          test: `${suiteName} > ${assertion.fullName}`,
          reason: assertion.status,
        });
      }
    }
  }

  return finishedLayer({ passed, failures, skippedTests });
};

const runJestLayer = async ({ layer, config, roots, selector, deadline }) => {
  const outputFile = path.join(RESULTS_ROOT, `.jest-${layer}.json`);

  fs.rmSync(outputFile, { force: true });

  const outcome = await runChild({
    layer,
    deadline,
    args: [
      JEST_BIN,
      `--config=${config}`,
      '--runInBand',
      '--ci',
      '--forceExit',
      '--json',
      `--outputFile=${outputFile}`,
      selector,
      ...roots.map((root) => `--roots=${root}`),
      ...(ONLY_PATTERN ? [`--testNamePattern=${ONLY_PATTERN}`] : []),
    ],
  });
  const problem = processProblem(outcome, layer);

  if (problem !== null) {
    return problem;
  }

  const report = readJsonOrNull(outputFile);

  fs.rmSync(outputFile, { force: true });

  if (report === null) {
    return failedLayer(
      `${layer} layer`,
      `Jest wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
    );
  }

  return normalizeJest(report);
};

const runUnitLayer = async ({
  layer,
  config,
  productRoot,
  suiteRoot,
  pattern,
  selector,
  requiredBuilds,
  deadline,
}) => {
  const missing = missingPath([JEST_BIN, ...requiredBuilds]);

  if (missing !== undefined) {
    return skippedLayer(
      `${path.relative(REPO_ROOT, missing)} is missing. Install dependencies and build it first.`,
    );
  }

  if (listFiles(productRoot, pattern).length === 0) {
    return skippedLayer(
      `No test files found yet under ${path.relative(REPO_ROOT, productRoot)}.`,
    );
  }

  return runJestLayer({
    layer,
    config,
    roots: [productRoot, suiteRoot].filter((root) => fs.existsSync(root)),
    selector,
    deadline,
  });
};

const runNodeTests = async ({ layer, folder, deadline }) => {
  const outputFile = path.join(RESULTS_ROOT, `.${layer}.json`);
  const reporterPath = path.join(SUITE_ROOT, 'lib/node-test-reporter.mjs');

  fs.rmSync(outputFile, { force: true });

  const outcome = await runChild({
    layer,
    deadline,
    args: [
      '--test',
      '--test-concurrency=1',
      `--test-reporter=${pathToImportable(reporterPath)}`,
      `--test-reporter-destination=${outputFile}`,
      ...(ONLY_PATTERN ? [`--test-name-pattern=${ONLY_PATTERN}`] : []),
      ...listFiles(path.join(SUITE_ROOT, folder), /\.test\.mjs$/),
    ],
    env: { ANALYTICS_TEST_RESULTS_DIR: RESULTS_ROOT },
  });
  const problem = processProblem(outcome, layer);

  if (problem !== null) {
    return problem;
  }

  const report = readJsonOrNull(outputFile);

  fs.rmSync(outputFile, { force: true });

  if (report === null) {
    return failedLayer(
      `${layer} layer`,
      `The test runner wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
    );
  }

  return finishedLayer({
    passed: report.tests.filter((test) => test.status === 'passed').length,
    failures: report.tests
      .filter((test) => test.status === 'failed')
      .map((test) => ({ test: test.name, message: clip(test.message) })),
    skippedTests: report.tests
      .filter((test) => test.status === 'skipped')
      .map((test) => ({ test: test.name, reason: test.reason })),
  });
};

const runSeedLayer = async (deadline) => {
  const missing = missingPath([
    path.join(REPO_ROOT, 'node_modules/pg'),
    path.join(REPO_ROOT, 'node_modules/esbuild'),
    path.join(REPO_ROOT, 'node_modules/typeorm'),
    path.join(REPO_ROOT, 'packages/twenty-shared/dist'),
  ]);

  if (missing !== undefined) {
    return skippedLayer(
      `${path.relative(REPO_ROOT, missing)} is missing. Install dependencies and build it first.`,
    );
  }

  const outputFile = path.join(RESULTS_ROOT, '.seed.json');

  fs.rmSync(outputFile, { force: true });

  const outcome = await runChild({
    layer: 'seed',
    deadline,
    args: [path.join(SUITE_ROOT, 'seed/seeded-metrics.test.mjs')],
    env: { ANALYTICS_TEST_OUTPUT_FILE: outputFile },
  });
  const problem = processProblem(outcome, 'seed');

  if (problem !== null) {
    return problem;
  }

  const report = readJsonOrNull(outputFile);

  fs.rmSync(outputFile, { force: true });

  if (report === null) {
    return failedLayer(
      'seed layer',
      `The test wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
    );
  }

  return finishedLayer({
    passed: report.results.filter((result) => result.status === 'PASS').length,
    failures: report.results
      .filter((result) => result.status === 'FAIL')
      .map((result) => ({
        test: `seed ${result.id} ${result.title}`,
        message: clip(result.failures.join('\n')),
      })),
    skippedTests: report.results
      .filter((result) => result.status === 'NOT_RUN')
      .map((result) => ({
        test: `seed ${result.id} ${result.title}`,
        reason: result.reason,
      })),
  });
};

const LAYERS = {
  'unit-server': (deadline) =>
    runUnitLayer({
      layer: 'unit-server',
      config: 'packages/twenty-server/jest.config.mjs',
      productRoot: ANALYTICS_SERVER_ROOT,
      suiteRoot: path.join(SUITE_ROOT, 'unit/server'),
      pattern: /\.spec\.ts$/,
      // Suite files are not named .spec, so packages/twenty-utils's own jest skips them.
      selector: '--testRegex=\\.(spec|unit)\\.ts$',
      requiredBuilds: [path.join(REPO_ROOT, 'packages/twenty-shared/dist')],
      deadline,
    }),

  'unit-front': (deadline) =>
    runUnitLayer({
      layer: 'unit-front',
      config: 'packages/twenty-front/jest.config.mjs',
      productRoot: ANALYTICS_FRONT_ROOT,
      suiteRoot: path.join(SUITE_ROOT, 'unit/front'),
      pattern: /\.test\.tsx?$/,
      selector: '--testMatch=**/?(*.)+(test|unit).ts?(x)',
      requiredBuilds: [
        path.join(REPO_ROOT, 'packages/twenty-shared/dist'),
        path.join(REPO_ROOT, 'packages/twenty-ui/dist'),
      ],
      deadline,
    }),

  integration: async (deadline) => {
    const missing = missingPath([
      path.join(REPO_ROOT, 'node_modules/pg'),
      path.join(REPO_ROOT, 'node_modules/esbuild'),
      path.join(REPO_ROOT, 'node_modules/typeorm'),
      path.join(REPO_ROOT, 'packages/twenty-shared/dist'),
      ...HARNESS_PRODUCT_FILES.map((file) =>
        path.join(ANALYTICS_SERVER_ROOT, file),
      ),
    ]);

    if (missing !== undefined) {
      return skippedLayer(
        `${path.relative(REPO_ROOT, missing)} is missing. Install dependencies, build it, or wait for it to be written.`,
      );
    }

    const postgresProblem = await checkPostgres(repoRequire('pg'));

    if (postgresProblem !== null) {
      return skippedLayer(postgresProblem);
    }

    const outputFile = path.join(RESULTS_ROOT, '.integration.json');

    fs.rmSync(outputFile, { force: true });

    const outcome = await runChild({
      layer: 'integration',
      deadline,
      args: [path.join(SUITE_ROOT, 'integration/run.cjs')],
      env: { ANALYTICS_TEST_OUTPUT_FILE: outputFile },
    });
    const problem = processProblem(outcome, 'integration');

    if (problem !== null) {
      return problem;
    }

    const report = readJsonOrNull(outputFile);

    fs.rmSync(outputFile, { force: true });

    if (report === null) {
      return failedLayer(
        'integration layer',
        `The harness wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
      );
    }

    const failures = report.results
      .filter((result) => result.status === 'FAIL')
      .map((result) => ({
        test: `${result.id} ${result.title}`,
        message: clip(result.failures.join('\n')),
      }));
    const skippedTests = report.results
      .filter((result) => result.status === 'NOT_RUN')
      .map((result) => ({
        test: `${result.id} ${result.title}`,
        reason: result.reason,
      }));

    const seedStartedAt = Date.now();
    const seedResult = await runSeedLayer(deadline);

    writeLatest('seed', {
      layer: 'seed',
      timestamp: new Date(seedStartedAt).toISOString(),
      durationMs: Date.now() - seedStartedAt,
      ...seedResult,
    });

    return finishedLayer({
      passed:
        report.results.filter((result) => result.status === 'PASS').length +
        seedResult.passed,
      failures: [...failures, ...seedResult.failures],
      skippedTests: [...skippedTests, ...seedResult.skippedTests],
    });
  },

  seed: (deadline) => runSeedLayer(deadline),

  blackbox: async (deadline) => {
    const apiProblem = await checkAnalyticsApi();

    return apiProblem === null
      ? runNodeTests({ layer: 'blackbox', folder: 'blackbox', deadline })
      : skippedLayer(apiProblem);
  },

  live: async (deadline) => {
    assertLiveTargetsAreLocal();

    const problem = (await checkAnalyticsApi()) ?? (await checkLiveStack());

    return problem === null
      ? runNodeTests({ layer: 'live', folder: 'live', deadline })
      : skippedLayer(problem);
  },

  boot: async (deadline) => {
    assertLiveTargetsAreLocal();

    const problem = await checkBootPrerequisites();

    return problem === null
      ? runNodeTests({ layer: 'boot', folder: 'boot', deadline })
      : skippedLayer(problem);
  },

  ui: async (deadline) => {
    const missing = missingPath([
      PLAYWRIGHT_CLI,
      path.join(REPO_ROOT, 'packages/twenty-front/src/pages/analytics/AnalyticsPage.tsx'),
    ]);

    if (missing !== undefined) {
      return skippedLayer(
        `${path.relative(REPO_ROOT, missing)} is missing. Install dependencies, or wait for it to be written.`,
      );
    }

    const { chromium } = repoRequire('@playwright/test');

    if (findChromium(chromium) === null) {
      return skippedLayer(
        `No Chromium that starts was found near ${chromium.executablePath()}. Run: npx playwright install chromium`,
      );
    }

    const apiProblem = await checkAnalyticsApi();

    if (apiProblem !== null) {
      return skippedLayer(apiProblem);
    }

    const frontProblem = await checkFront();

    if (frontProblem !== null) {
      return skippedLayer(frontProblem);
    }

    const outputFile = path.join(RESULTS_ROOT, '.ui.json');

    fs.rmSync(outputFile, { force: true });

    const outcome = await runChild({
      layer: 'ui',
      deadline,
      args: [
        PLAYWRIGHT_CLI,
        'test',
        `--config=${path.join(SUITE_ROOT, 'ui/playwright.config.ts')}`,
        ...(ONLY_PATTERN ? [`--grep=${ONLY_PATTERN}`] : []),
      ],
      env: {
        PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile,
        ANALYTICS_TEST_RESULTS_DIR: RESULTS_ROOT,
      },
    });
    const problem = processProblem(outcome, 'ui');

    if (problem !== null) {
      return problem;
    }

    const report = readJsonOrNull(outputFile);

    fs.rmSync(outputFile, { force: true });

    if (report === null) {
      return failedLayer(
        'ui layer',
        `Playwright wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
      );
    }

    return normalizePlaywright(report);
  },

  'merge-guard': async (deadline) => {
    const outputFile = path.join(RESULTS_ROOT, 'latest-merge-guard.json');

    fs.rmSync(outputFile, { force: true });

    const outcome = await runChild({
      layer: 'merge-guard',
      deadline,
      args: [path.join(SUITE_ROOT, 'merge-guard/merge-guard.test.mjs')],
      env: { ANALYTICS_TEST_RESULTS_DIR: RESULTS_ROOT },
    });
    const problem = processProblem(outcome, 'merge-guard');

    if (problem !== null) {
      return problem;
    }

    const report = readJsonOrNull(outputFile);

    if (report === null) {
      return failedLayer(
        'merge-guard layer',
        `The test wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
      );
    }

    return { ...finishedLayer(report), findings: report.findings };
  },
};

let isRunningEveryLayer = false;

const runDataflow = async ({ deadline, isServerOnly }) => {
  const outputFile = path.join(RESULTS_ROOT, '.dataflow.json');

  fs.rmSync(outputFile, { force: true });

  const outcome = await runChild({
    layer: 'dataflow',
    deadline,
    args: [
      path.join(SUITE_ROOT, 'dataflow/run.mjs'),
      ...(isServerOnly ? ['--server-only'] : []),
    ],
    env: { ANALYTICS_TEST_OUTPUT_FILE: outputFile },
  });
  const problem = processProblem(outcome, 'dataflow');

  if (problem !== null) {
    return problem;
  }

  const report = readJsonOrNull(outputFile);

  fs.rmSync(outputFile, { force: true });

  return report === null
    ? failedLayer(
        'dataflow layer',
        `It wrote no results (exit ${outcome.exitCode}). ${readLogTail(outcome.logPath)}`,
      )
    : finishedLayer(report);
};

const runIntegrationChecks = LAYERS.integration;

// Dataflow needs the same Postgres on its own database, so it runs beside the checks and
// shares their time limit. Run on its own it also covers the components.
LAYERS.integration = async (deadline) => {
  if (isRunningEveryLayer) {
    return runIntegrationChecks(deadline);
  }

  const [integration, dataflow] = await Promise.all([
    runIntegrationChecks(deadline),
    runDataflow({ deadline, isServerOnly: true }),
  ]);

  return integration.status === 'SKIPPED'
    ? integration
    : finishedLayer({
        passed: integration.passed + dataflow.passed,
        failures: [...integration.failures, ...dataflow.failures],
        skippedTests: [...integration.skippedTests, ...dataflow.skippedTests],
      });
};

LAYERS.dataflow = async (deadline) => {
  const postgresProblem = await checkPostgres(repoRequire('pg'));

  return postgresProblem === null
    ? runDataflow({ deadline, isServerOnly: false })
    : skippedLayer(postgresProblem);
};

const pathToImportable = (filePath) =>
  process.platform === 'win32'
    ? `file:///${filePath.replace(/\\/g, '/')}`
    : filePath;

const normalizePlaywright = (report) => {
  const failures = [];
  const skippedTests = [];
  let passed = 0;

  const walk = (suite, titles) => {
    const suiteTitles = suite.title ? [...titles, suite.title] : titles;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const name = [...suiteTitles, spec.title].join(' > ');
        const results = test.results ?? [];
        const lastResult = results[results.length - 1];

        if (test.status === 'expected' || test.status === 'flaky') {
          passed += 1;
        } else if (test.status === 'skipped') {
          skippedTests.push({
            test: name,
            reason:
              test.annotations?.find(({ type }) => type === 'skip')
                ?.description ?? 'A test it depends on did not pass.',
          });
        } else {
          failures.push({
            test: name,
            message: clip(
              (lastResult?.errors ?? [])
                .map((error) => error.message)
                .join('\n') || lastResult?.status,
            ),
          });
        }
      }
    }

    for (const child of suite.suites ?? []) {
      walk(child, suiteTitles);
    }
  };

  for (const suite of report.suites ?? []) {
    walk(suite, []);
  }

  for (const error of report.errors ?? []) {
    failures.push({ test: 'ui layer', message: clip(error.message) });
  }

  return finishedLayer({ passed, failures, skippedTests });
};

const runLayer = async (layer) => {
  const startedAt = Date.now();
  const deadline = startedAt + LAYER_TIME_LIMIT_MS;
  let result;

  try {
    result = await LAYERS[layer](deadline);
  } catch (error) {
    result =
      error instanceof RefusedTargetError
        ? failedLayer(`${layer} layer`, error.message)
        : failedLayer(`${layer} layer`, error?.stack ?? String(error));
  }

  const report = {
    layer,
    timestamp: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    ...result,
  };

  writeLatest(layer, report);

  return report;
};

const writeLatest = (layer, report) => {
  fs.writeFileSync(
    path.join(RESULTS_ROOT, `latest-${layer}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
};

const appendHistory = (entry) => {
  fs.appendFileSync(
    path.join(RESULTS_ROOT, 'history.jsonl'),
    `${JSON.stringify(entry)}\n`,
  );
};

const printReport = ({ layer, status, passed, failed, skipped, durationMs, reason, failures, skippedTests }) => {
  console.log(
    `${layer.padEnd(12)} ${status.padEnd(8)} passed ${passed}, failed ${failed}, skipped ${skipped}, ${Math.round(durationMs / 1000)} s`,
  );

  if ((status === 'SKIPPED' || status === 'PARTIAL') && reason) {
    console.log(`  reason: ${reason}`);
  }

  const distinctReasons = [
    ...new Set((skippedTests ?? []).map((test) => test.reason)),
  ];

  for (const skipReason of distinctReasons.slice(0, PRINTED_FAILURES_LIMIT)) {
    console.log(`  not run: ${skipReason}`);
  }

  for (const { test, message } of failures.slice(0, PRINTED_FAILURES_LIMIT)) {
    console.log(`  FAIL ${test}\n    ${message.split('\n')[0]}`);
  }

  if (failures.length > PRINTED_FAILURES_LIMIT) {
    console.log(
      `  ...and ${failures.length - PRINTED_FAILURES_LIMIT} more, see latest-${layer}.json`,
    );
  }
};

const IS_STRICT =
  process.argv.includes('--strict') || process.env.ANALYTICS_TEST_STRICT === '1';

const parseLayerArgument = (argv) => {
  const inlineIndex = argv.findIndex((argument) =>
    argument.startsWith('--layer='),
  );

  if (inlineIndex !== -1) {
    return argv[inlineIndex].slice('--layer='.length);
  }

  const flagIndex = argv.indexOf('--layer');

  return flagIndex === -1 ? undefined : argv[flagIndex + 1];
};

const summarize = ({ status, passed, failed, skipped, durationMs, reason }) => ({
  status,
  passed,
  failed,
  skipped,
  durationMs,
  reason,
});

const main = async () => {
  const layerName = parseLayerArgument(process.argv.slice(2));
  const layerNames = Object.keys(LAYERS);

  if (layerName !== 'all' && !layerNames.includes(layerName)) {
    console.error(
      `Usage: node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <${[...layerNames, 'all'].join('|')}>`,
    );
    process.exitCode = 2;

    return;
  }

  fs.mkdirSync(RESULTS_ROOT, { recursive: true });

  isRunningEveryLayer = layerName === 'all';

  if (layerName !== 'all') {
    const report = await runLayer(layerName);

    appendHistory({ layer: layerName, timestamp: report.timestamp, ...summarize(report) });
    printReport(report);
    process.exitCode = computeExitCode([report.status], IS_STRICT);

    return;
  }

  const startedAt = Date.now();
  const reports = [];

  // The integration layer already runs seed, so one all run does not load it twice.
  for (const name of layerNames.filter((candidate) => candidate !== 'seed')) {
    const report = await runLayer(name);

    reports.push(report);
    printReport(report);
  }

  const total = (key) => reports.reduce((sum, report) => sum + report[key], 0);
  const failed = total('failed');
  const allReport = {
    layer: 'all',
    timestamp: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    status: describeAllStatus(reports),
    passed: total('passed'),
    failed,
    skipped: total('skipped'),
    failures: reports.flatMap((report) =>
      report.failures.map((failure) => ({ layer: report.layer, ...failure })),
    ),
    layers: Object.fromEntries(
      reports.map((report) => [report.layer, summarize(report)]),
    ),
  };

  writeLatest('all', allReport);
  appendHistory({
    layer: 'all',
    timestamp: allReport.timestamp,
    ...summarize(allReport),
    layers: allReport.layers,
  });
  process.exitCode = computeExitCode(
    reports.map((report) => report.status),
    IS_STRICT,
  );
};

await main();
