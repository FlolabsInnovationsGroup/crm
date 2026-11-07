'use strict';
// Runs dataflow/front through the front's own jest setup, the same way the unit-front
// layer does, and brings its tests in as this layer's results.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { REPO_ROOT, SUITE_ROOT } = require('./context.cjs');

const FRONT_ROOT = path.join(SUITE_ROOT, 'dataflow', 'front');
const FRONT_TEST_FILE = path.join(FRONT_ROOT, 'dataflow-ui.unit.tsx');
const JEST_BIN = path.join(REPO_ROOT, 'node_modules/jest/bin/jest.js');
const REQUIRED_BUILDS = [
  path.join(REPO_ROOT, 'packages/twenty-shared/dist'),
  path.join(REPO_ROOT, 'packages/twenty-ui/dist'),
];
const FRONT_TIME_LIMIT_MS = 4 * 60 * 1000;

const readEdgeId = (name) => /^(DF-\d+)\b/.exec(name)?.[1];

const forEachFrontEdge = (graph, work) => {
  const frontEdges = graph.edges.filter(({ from, to }) => from.startsWith('ui.') || to.startsWith('ui.'));

  for (const edge of frontEdges) {
    work({ name: `${edge.id} ${edge.from} -> ${edge.to} [${edge.field}]`, edgeId: edge.id });
  }
};

const importSkipped = ({ runner, graph, reason }) =>
  forEachFrontEdge(graph, (entry) => runner.skip(entry, reason));

const runFrontHalf = ({ runner, graph, isServerOnly, realPayloadsFile }) => {
  if (isServerOnly) {
    forEachFrontEdge(graph, (entry) => runner.defer(entry));

    return;
  }

  const missing = [JEST_BIN, FRONT_TEST_FILE, ...REQUIRED_BUILDS].find((required) => !fs.existsSync(required));

  if (missing !== undefined) {
    importSkipped({ runner, graph, reason: `${path.relative(REPO_ROOT, missing)} is missing` });

    return;
  }

  const outputFile = path.join(os.tmpdir(), `dataflow-front-${process.pid}.json`);
  const outcome = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=2048',
      JEST_BIN,
      '--config=packages/twenty-front/jest.config.mjs',
      `--roots=${FRONT_ROOT}`,
      '--testMatch=**/?(*.)+(unit).ts?(x)',
      '--runInBand',
      '--ci',
      '--forceExit',
      '--json',
      `--outputFile=${outputFile}`,
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATAFLOW_REAL_PAYLOADS: realPayloadsFile ?? '' },
      stdio: 'pipe',
      timeout: FRONT_TIME_LIMIT_MS,
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (realPayloadsFile !== undefined) fs.rmSync(realPayloadsFile, { force: true });

  let report = null;

  try {
    report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  } catch {
    report = null;
  } finally {
    fs.rmSync(outputFile, { force: true });
  }

  if (report === null) {
    runner.importResults([
      {
        name: 'front half of the graph',
        status: 'FAIL',
        failures: [
          `jest wrote no results (exit ${outcome.status}, signal ${outcome.signal}). ${String(outcome.stderr ?? '').slice(-1500)}`,
        ],
      },
    ]);
    importSkipped({ runner, graph, reason: 'jest did not finish' });

    return;
  }

  const entries = report.testResults.flatMap((suite) => {
    if (suite.assertionResults.length === 0 && suite.status === 'failed') {
      return [{ name: path.relative(REPO_ROOT, suite.name), status: 'FAIL', failures: [String(suite.message).slice(0, 2000)] }];
    }

    return suite.assertionResults.map((assertion) => ({
      name: assertion.title,
      edgeId: readEdgeId(assertion.title),
      status: assertion.status === 'passed' ? 'PASS' : assertion.status === 'failed' ? 'FAIL' : 'SKIPPED',
      failures: assertion.failureMessages.map((message) =>
        String(message).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').slice(0, 1500),
      ),
      reason:
        assertion.status === 'passed' || assertion.status === 'failed'
          ? undefined
          : 'no real payloads: the database part of this layer did not run',
    }));
  });

  runner.importResults(entries);
};

module.exports = { runFrontHalf };
