'use strict';
// What a run may call itself. PARTIAL means some checks ran and passed while others could not
// run: not a clean pass, and --strict treats it, and SKIPPED, as a failure.
const describeFinishedLayer = ({ passed, failures, skippedTests }) => {
  if (failures.length > 0) {
    return { status: 'FAILED', reason: `${failures.length} failed` };
  }

  if (passed === 0) {
    return {
      status: 'SKIPPED',
      reason: skippedTests[0]?.reason ?? 'No test ran.',
    };
  }

  return skippedTests.length === 0
    ? { status: 'PASSED', reason: null }
    : {
        status: 'PARTIAL',
        reason: `${skippedTests.length} checks did not run. First: ${skippedTests[0].reason}`,
      };
};

const describeAllStatus = (reports) => {
  const statuses = reports.map(({ status }) => status);

  if (statuses.includes('FAILED')) {
    return 'FAILED';
  }

  if (statuses.every((status) => status === 'SKIPPED')) {
    return 'SKIPPED';
  }

  return statuses.every((status) => status === 'PASSED') ? 'PASSED' : 'PARTIAL';
};

const computeExitCode = (statuses, isStrict) => {
  if (statuses.includes('FAILED')) {
    return 1;
  }

  return isStrict && statuses.some((status) => status !== 'PASSED') ? 1 : 0;
};

module.exports = { computeExitCode, describeAllStatus, describeFinishedLayer };
