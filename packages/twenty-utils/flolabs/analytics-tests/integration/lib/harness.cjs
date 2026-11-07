'use strict';
const util = require('node:util');

const inspect = (value) =>
  util.inspect(value, { depth: 6, breakLength: 100, maxArrayLength: 200, sorted: true });

// A pg error carries the failing SQL's position; TypeORM wraps the same error and keeps
// the query. This turns either into the exact message plus the SQL around the fault.
const describeError = (error, lastStatement) => {
  const driverError = error?.driverError ?? error;
  const sql = error?.query ?? lastStatement?.sql;
  const position = Number(driverError?.position);
  const lines = [String(driverError?.message ?? error)];

  if (driverError?.code) lines[0] += ` [SQLSTATE ${driverError.code}]`;

  if (driverError?.detail) lines.push(`detail: ${driverError.detail}`);
  if (driverError?.hint) lines.push(`hint: ${driverError.hint}`);

  if (Number.isFinite(position) && typeof sql === 'string') {
    lines.push(`near: ...${sql.slice(Math.max(0, position - 100), position + 100).replace(/\s+/g, ' ')}...`);
  } else if (typeof sql === 'string') {
    lines.push(`sql: ${sql.slice(0, 300).replace(/\s+/g, ' ')}...`);
  }

  return lines.join('\n');
};

const createHarness = ({ getLastStatement, onlyPattern } = {}) => {
  const results = [];
  let section = '';

  const record = (entry) => {
    results.push({ section, ...entry });

    const label = { PASS: 'PASS   ', FAIL: 'FAIL   ', NOT_RUN: 'NOT RUN' }[entry.status];

    console.log(`${label} ${entry.id.padEnd(6)} ${entry.title}`);

    if (entry.status === 'NOT_RUN') console.log(`        reason: ${entry.reason}`);

    for (const failure of entry.failures ?? []) {
      for (const line of failure.split('\n')) console.log(`        ${line}`);
    }
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

  const check = async ({ id, title, requires = [], needs = [] }, work) => {
    if (onlyPattern && id !== 'ABORT' && !onlyPattern.test(id)) return;

    const missing = requires.filter((requirement) => !requirement.isAvailable);

    if (missing.length > 0) {
      record({
        id,
        title,
        status: 'NOT_RUN',
        reason: `needs ${missing.map((requirement) => requirement.label).join(', ')}`,
      });

      return;
    }

    if (needs.some((need) => need === null || need === undefined)) {
      record({ id, title, status: 'NOT_RUN', reason: 'its fixture failed to build, see above' });

      return;
    }

    const failures = [];

    try {
      await work(createAsserter(failures));
    } catch (error) {
      failures.push(describeError(error, getLastStatement?.()));
    }

    record({ id, title, status: failures.length === 0 ? 'PASS' : 'FAIL', failures });
  };

  // A fixture that fails is itself a FAIL and blocks only the checks that name it.
  const fixture = async (id, title, work) => {
    try {
      return await work();
    } catch (error) {
      record({
        id,
        title: `fixture: ${title}`,
        status: 'FAIL',
        failures: [describeError(error, getLastStatement?.())],
      });

      return null;
    }
  };

  return {
    check,
    fixture,
    results,
    startSection(title) {
      section = title;
      console.log(`\n== ${title}`);
    },
    summary() {
      const count = (status) => results.filter((result) => result.status === status).length;

      return { passed: count('PASS'), failed: count('FAIL'), notRun: count('NOT_RUN') };
    },
  };
};

module.exports = { createHarness, describeError, inspect };
