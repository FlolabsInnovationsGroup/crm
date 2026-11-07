#!/usr/bin/env node
// Do the tests fail when the code is wrong? Plants each defect in mutants.cjs, in memory, and
// runs the tests that should catch it. A survivor is a hole in the tests. See README.md.
//   node packages/twenty-utils/flolabs/analytics-tests/mutation/run.mjs --target <unit-server|unit-front|dataflow>
// Options: --only <regex on mutant names>, --time-limit-minutes <n>, default 30.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { MUTANTS } = require('./mutants.cjs');

const SUITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SUITE_ROOT, '..', '..', '..', '..');
const RESULTS_ROOT =
  process.env.ANALYTICS_TEST_RESULTS_DIR ??
  path.resolve(REPO_ROOT, '..', 'analytics-work', 'test-results');
const JEST_BIN = path.join(REPO_ROOT, 'node_modules/jest/bin/jest.js');
const TRANSFORM = path.join(SUITE_ROOT, 'mutation/jest-transform.cjs').replace(/\\/g, '/');
const RUN_TIME_LIMIT_MS = 10 * 60 * 1000;

const JEST_TARGETS = {
  'unit-server': {
    packageName: 'twenty-server',
    selector: '--testRegex=\\.(spec|unit)\\.ts$',
    roots: [
      'packages/twenty-server/src/modules/analytics',
      'packages/twenty-utils/flolabs/analytics-tests/unit/server',
    ],
  },
  'unit-front': {
    packageName: 'twenty-front',
    selector: '--testMatch=**/?(*.)+(test|unit).ts?(x)',
    roots: [
      'packages/twenty-front/src/modules/crm-analytics',
      'packages/twenty-utils/flolabs/analytics-tests/unit/front',
    ],
  },
};

const readOption = (name) => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

// The package's own config, with only the transformer wrapped.
const writeJestConfig = async (folder, { packageName }) => {
  const packageRoot = path.join(REPO_ROOT, 'packages', packageName);
  const { default: base } = await import(
    pathToFileURL(path.join(packageRoot, 'jest.config.mjs')).href
  );
  const configPath = path.join(folder, `${packageName}.jest.json`);

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      ...base,
      rootDir: packageRoot,
      silent: true,
      collectCoverage: false,
      transform: Object.fromEntries(
        Object.entries(base.transform).map(([pattern, [, options]]) => [
          pattern,
          [TRANSFORM, options],
        ]),
      ),
    }),
  );

  return configPath;
};

const runJestTarget = (target, configPath, mutant) => {
  const { roots, selector } = JEST_TARGETS[target];
  const outputFile = path.join(os.tmpdir(), `analytics-mutant-${process.pid}.json`);

  fs.rmSync(outputFile, { force: true });
  const { stderr } = spawnSync(
    process.execPath,
    [
      JEST_BIN,
      `--config=${configPath}`,
      '--runInBand',
      '--ci',
      '--forceExit',
      '--json',
      `--outputFile=${outputFile}`,
      selector,
      ...roots.map((root) => `--roots=${path.join(REPO_ROOT, root)}`),
      `--testPathPattern=${mutant.tests}`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: RUN_TIME_LIMIT_MS,
      env: process.env,
    },
  );

  if (!fs.existsSync(outputFile)) {
    return { problem: `jest wrote no results: ${String(stderr).slice(-400)}` };
  }

  const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

  fs.rmSync(outputFile, { force: true });

  return {
    total: report.numTotalTests,
    failed: report.numFailedTests + report.numRuntimeErrorTestSuites,
    caughtBy: report.testResults.flatMap(({ assertionResults, status, name }) => {
      const failures = assertionResults
        .filter((result) => result.status === 'failed')
        .map((result) => result.fullName);

      return failures.length === 0 && status === 'failed'
        ? [path.basename(name)]
        : failures;
    }),
  };
};

const runDataflowTarget = () => {
  const outputFile = path.join(os.tmpdir(), `analytics-mutant-${process.pid}.json`);

  fs.rmSync(outputFile, { force: true });
  spawnSync(
    process.execPath,
    [path.join(SUITE_ROOT, 'dataflow/run.mjs'), '--server-only'],
    {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      timeout: RUN_TIME_LIMIT_MS,
      env: { ...process.env, ANALYTICS_TEST_OUTPUT_FILE: outputFile },
    },
  );

  if (!fs.existsSync(outputFile)) {
    return { problem: 'the dataflow layer wrote no results' };
  }

  const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

  fs.rmSync(outputFile, { force: true });

  return {
    total: report.passed + report.failed,
    failed: report.failed,
    caughtBy: report.failures.map(({ test }) => test),
  };
};

const runOnce = (target, configPath, mutant, markerFile) => {
  fs.rmSync(markerFile, { force: true });

  if (mutant.file === undefined) {
    delete process.env.ANALYTICS_MUTANT;
  } else {
    process.env.ANALYTICS_MUTANT = JSON.stringify(mutant);
    process.env.ANALYTICS_MUTANT_MARKER = markerFile;
  }

  const outcome =
    target === 'dataflow'
      ? runDataflowTarget()
      : runJestTarget(target, configPath, mutant);
  const marks = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8') : '';

  return { ...outcome, wasApplied: marks.includes('APPLIED'), wasFound: !marks.includes('NOT_FOUND') };
};

const describeOutcome = (outcome) => {
  if (outcome.problem !== undefined) {
    return 'ERROR';
  }

  if (!outcome.wasFound) {
    return 'CODE_CHANGED';
  }

  if (!outcome.wasApplied) {
    return 'NOT_LOADED';
  }

  return outcome.failed > 0 ? 'CAUGHT' : 'SURVIVED';
};

const main = async () => {
  const target = readOption('--target');

  if (MUTANTS[target] === undefined) {
    console.error(`Usage: mutation/run.mjs --target <${Object.keys(MUTANTS).join('|')}>`);
    process.exitCode = 2;

    return;
  }

  const only = readOption('--only');
  const timeLimitMs = Number(readOption('--time-limit-minutes') ?? 30) * 60_000;
  const startedAt = Date.now();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-mutation-'));
  const markerFile = path.join(folder, 'marker.txt');
  const configPath =
    target === 'dataflow' ? null : await writeJestConfig(folder, JEST_TARGETS[target]);
  const resultsFile = path.join(RESULTS_ROOT, `mutation-${target}.json`);
  const mutants = MUTANTS[target].filter(
    ({ name }) => only === undefined || new RegExp(only).test(name),
  );
  const results = [];
  const save = () =>
    fs.writeFileSync(
      resultsFile,
      `${JSON.stringify(
        {
          target,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          planted: results.length,
          caught: results.filter(({ status }) => status === 'CAUGHT').length,
          survived: results.filter(({ status }) => status === 'SURVIVED').map(({ name }) => name),
          notRun: mutants.slice(results.length).map(({ name }) => name),
          results,
        },
        null,
        2,
      )}\n`,
    );

  fs.mkdirSync(RESULTS_ROOT, { recursive: true });

  // A defect caught by tests that already fail proves nothing.
  if (target === 'dataflow') {
    const clean = runOnce(target, configPath, {}, markerFile);

    if (clean.problem !== undefined || clean.failed > 0) {
      console.error(
        `The clean run is not clean: ${clean.problem ?? clean.caughtBy.slice(0, 5).join(' | ')}`,
      );
      process.exitCode = 2;

      return;
    }
  }

  for (const mutant of mutants) {
    if (Date.now() - startedAt > timeLimitMs) {
      console.log(`Time limit reached, ${mutants.length - results.length} not run.`);
      break;
    }

    const mutantStartedAt = Date.now();

    if (target !== 'dataflow') {
      const clean = runOnce(target, configPath, { tests: mutant.tests }, markerFile);

      if (clean.problem !== undefined || clean.failed > 0 || clean.total === 0) {
        results.push({
          name: mutant.name,
          status: 'NOT_COMPARABLE',
          detail: `the clean run gave ${clean.problem ?? `${clean.failed} failed of ${clean.total}`}`,
        });
        save();
        console.log(`NOT_COMPARABLE ${mutant.name}`);
        continue;
      }
    }

    const outcome = runOnce(target, configPath, mutant, markerFile);
    const status = describeOutcome(outcome);

    results.push({
      name: mutant.name,
      status,
      file: mutant.file,
      total: outcome.total,
      failed: outcome.failed,
      caughtBy: (outcome.caughtBy ?? []).slice(0, 5),
      seconds: Math.round((Date.now() - mutantStartedAt) / 1000),
      ...(outcome.problem === undefined ? {} : { problem: outcome.problem }),
    });
    save();
    console.log(`${status.padEnd(12)} ${mutant.name}${status === 'CAUGHT' ? `  (${outcome.failed} failed)` : ''}`);
  }

  save();
  fs.rmSync(folder, { recursive: true, force: true });

  const survivors = results.filter(({ status }) => status === 'SURVIVED');

  console.log(
    `${target}: planted ${results.length}, caught ${results.filter(({ status }) => status === 'CAUGHT').length}, survived ${survivors.length}. Details: ${resultsFile}`,
  );
  process.exitCode = survivors.length > 0 ? 1 : 0;
};

await main();
