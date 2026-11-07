'use strict';
const util = require('node:util');

const inspect = (value) =>
  util.inspect(value, { depth: 6, breakLength: 100, maxArrayLength: 100, sorted: true });

const STATUS_LABELS = { PASS: 'PASS   ', FAIL: 'FAIL   ', SKIPPED: 'SKIPPED' };

// A pg error carries the failing position and TypeORM keeps the query, which turns a
// bare message into the SQL around the fault.
const describeError = (error) => {
  const driverError = error?.driverError ?? error;
  const lines = [String(driverError?.message ?? error)];
  const sql = error?.query;
  const position = Number(driverError?.position);

  if (driverError?.code) lines[0] += ` [SQLSTATE ${driverError.code}]`;

  if (Number.isFinite(position) && typeof sql === 'string') {
    lines.push(`near: ${sql.slice(Math.max(0, position - 100), position + 100).replace(/\s+/g, ' ')}`);
  } else if (error instanceof Error && !driverError?.code) {
    lines.push(String(error.stack).split('\n').slice(1, 4).join('\n'));
  }

  return lines.join('\n');
};

const createAsserter = (failures) => ({
  equal(label, actual, expected) {
    if (!util.isDeepStrictEqual(actual, expected)) {
      failures.push(`${label}\nexpected: ${inspect(expected)}\nactual:   ${inspect(actual)}`);
    }
  },
  ok(label, condition, detail) {
    if (!condition) {
      failures.push(`${label}${detail === undefined ? '' : `\nactual:   ${inspect(detail)}`}`);
    }
  },
  fail(message) {
    failures.push(message);
  },
});

const createTestRunner = ({ onlyPattern, isQuiet = false } = {}) => {
  const results = [];
  let section = '';

  const record = (entry) => {
    results.push({ section, ...entry });

    if (isQuiet && entry.status === 'PASS') return;

    console.log(`${STATUS_LABELS[entry.status]} ${entry.name}`);

    if (entry.reason !== undefined) console.log(`        reason: ${entry.reason}`);

    for (const failure of entry.failures ?? []) {
      for (const line of failure.split('\n')) console.log(`        ${line}`);
    }
  };

  // requires: missing product files, by label. needs: fixtures that failed to build.
  const test = async ({ name, edgeId, requires = [], needs = [] }, work) => {
    if (onlyPattern !== undefined && !onlyPattern.test(name)) {
      record({ name, edgeId, status: 'SKIPPED', reason: 'left out by DATAFLOW_ONLY' });

      return;
    }

    const missing = requires.filter((requirement) => !requirement.isAvailable);

    if (missing.length > 0) {
      record({
        name,
        edgeId,
        status: 'SKIPPED',
        reason: `needs ${missing.map((requirement) => requirement.label).join(', ')}`,
      });

      return;
    }

    if (needs.some((need) => need === null || need === undefined)) {
      record({ name, edgeId, status: 'SKIPPED', reason: 'its fixture failed to build, see above' });

      return;
    }

    const failures = [];
    const startedAt = Date.now();

    try {
      await work(createAsserter(failures));
    } catch (error) {
      failures.push(describeError(error));
    }

    record({
      name,
      edgeId,
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      failures,
      durationMs: Date.now() - startedAt,
    });
  };

  const skip = ({ name, edgeId }, reason) => {
    record({ name, edgeId, status: 'SKIPPED', reason });
  };

  // Tested by another run of this layer: counts for coverage, not as a skip of this run.
  const defer = ({ name, edgeId }) => {
    results.push({ section, name, edgeId, status: 'DEFERRED' });
  };

  // A fixture that fails is itself a FAIL and blocks only the tests that name it.
  const fixture = async (name, work) => {
    try {
      return await work();
    } catch (error) {
      record({ name: `fixture: ${name}`, status: 'FAIL', failures: [describeError(error)] });

      return null;
    }
  };

  const importResults = (entries) => {
    for (const entry of entries) record(entry);
  };

  return {
    defer,
    fixture,
    importResults,
    results,
    skip,
    test,
    startSection(title) {
      section = title;
      console.log(`\n== ${title}`);
    },
    summary() {
      const count = (status) => results.filter((result) => result.status === status).length;

      return {
        total: results.length,
        passed: count('PASS'),
        failed: count('FAIL'),
        skipped: count('SKIPPED'),
      };
    },
  };
};

module.exports = { createTestRunner, describeError, inspect };
