'use strict';
const fs = require('node:fs');
const path = require('node:path');

const coverage = require('../tests/graph-coverage.cjs');
const { REPO_ROOT, createContext } = require('./context.cjs');
const { runFrontHalf } = require('./front-runner.cjs');
const { writeRealPayloads } = require('./real-payloads.cjs');
const { createSuite, loadGraph } = require('./suite.cjs');
const { createTestRunner, describeError } = require('./test-runner.cjs');

const RESULTS_ROOT =
  process.env.ANALYTICS_TEST_RESULTS_DIR ??
  path.resolve(REPO_ROOT, '..', 'analytics-work', 'test-results');

// Loaded at the start, so a run tests one consistent copy even if a file changes under it.
const SECTIONS = [
  require('../tests/crm-to-storage.cjs'),
  require('../tests/storage-to-cte.cjs'),
  require('../tests/cte-to-metric.cjs'),
  require('../tests/metric-to-payload.cjs'),
  require('../tests/filters.cjs'),
  require('../tests/report-path.cjs'),
  require('../tests/forward-propagation.cjs'),
  require('../tests/taint.cjs'),
  require('../tests/unit-consistency.cjs'),
  require('../tests/unknown-values.cjs'),
];

// Same report shape as run-tests.mjs writes for every other layer.
const buildReport = ({ startedAt, runner, unavailableReason }) => {
  const { failed, passed, skipped } = runner.summary();

  return {
    layer: 'dataflow',
    timestamp: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    // The graph checks pass without a database, which must not read as the layer passing.
    status: failed > 0 ? 'FAILED' : passed > 0 && unavailableReason === undefined ? 'PASSED' : 'SKIPPED',
    reason: failed > 0 ? `${failed} failed` : (unavailableReason ?? null),
    passed,
    failed,
    skipped,
    failures: runner.results
      .filter(({ status }) => status === 'FAIL')
      .map(({ name, failures }) => ({ test: name, message: failures.join('\n').slice(0, 2000) })),
    skippedTests: runner.results
      .filter(({ status }) => status === 'SKIPPED')
      .map(({ name, reason }) => ({ test: name, reason })),
  };
};

const writeReport = (report) => {
  // A partial run must not stand as the layer's latest result.
  if (process.env.DATAFLOW_ONLY && !process.env.ANALYTICS_TEST_OUTPUT_FILE) return;

  const outputFile =
    process.env.ANALYTICS_TEST_OUTPUT_FILE ?? path.join(RESULTS_ROOT, 'latest-dataflow.json');

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
};

// Every expected value is stated relative to one run date, so a run must not straddle
// midnight in the reporting zone. Waiting could outlast the layer's time limit.
const NEAR_MIDNIGHT_MS = 15 * 60 * 1000;

const readMidnightProblem = () => {
  const sinceMidnight = Date.now() % 86_400_000;

  return sinceMidnight < NEAR_MIDNIGHT_MS / 3 || 86_400_000 - sinceMidnight < NEAR_MIDNIGHT_MS
    ? 'too close to UTC midnight: expected values would straddle two dates. Rerun in 20 minutes.'
    : undefined;
};

const main = async (argv) => {
  const startedAt = Date.now();
  const isServerOnly = argv.includes('--server-only');
  const onlyPattern = process.env.DATAFLOW_ONLY ? new RegExp(process.env.DATAFLOW_ONLY) : undefined;
  const runner = createTestRunner({ onlyPattern, isQuiet: process.env.DATAFLOW_VERBOSE === undefined });
  const graph = loadGraph();

  const midnightProblem = readMidnightProblem();
  const context = midnightProblem === undefined ? await createContext() : { unavailableReason: midnightProblem };
  const suite = createSuite({ runner, context, graph });

  for (const section of SECTIONS) {
    runner.startSection(section.title);

    try {
      await section.run(suite);
    } catch (error) {
      await runner.test({ name: `section stopped: ${section.title}` }, (t) => t.fail(describeError(error)));
    }

    // Statements are only needed inside a section, and they add up.
    if (context.statements !== undefined) context.statements.length = 0;
  }

  runner.startSection('Payload fields to components');
  runFrontHalf({
    runner,
    graph,
    isServerOnly,
    realPayloadsFile: isServerOnly ? undefined : await writeRealPayloads(suite),
  });

  runner.startSection(coverage.title);
  await coverage.run(suite);

  await context.close?.();

  if (process.env.DATAFLOW_VERBOSE !== undefined) {
    const slowest = [...runner.results]
      .sort((first, second) => (second.durationMs ?? 0) - (first.durationMs ?? 0))
      .slice(0, 12);

    console.log('\nSlowest:');

    for (const { durationMs, name } of slowest) {
      console.log(`${String(durationMs).padStart(7)} ms ${name.slice(0, 90)}`);
    }
  }

  const report = buildReport({ startedAt, runner, unavailableReason: context.unavailableReason });

  writeReport(report);

  console.log(
    `\ndataflow ${report.status}: passed ${report.passed}, failed ${report.failed}, skipped ${report.skipped}, ${Math.round(report.durationMs / 1000)} s`,
  );

  process.exitCode = report.failed > 0 ? 1 : 0;
};

module.exports = { main };
