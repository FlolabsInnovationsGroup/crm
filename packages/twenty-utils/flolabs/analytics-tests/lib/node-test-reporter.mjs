// node:test reporter for the blackbox layer: one JSON document, read by run-tests.mjs.
const describeFailure = (error) => {
  const cause = error?.cause ?? error;

  return String(cause?.message ?? cause);
};

export default async function* reporter(source) {
  const tests = [];

  for await (const { type, data } of source) {
    if (type !== 'test:pass' && type !== 'test:fail') {
      continue;
    }

    if (data.details?.type === 'suite') {
      continue;
    }

    if (data.skip !== undefined) {
      tests.push({
        name: data.name,
        status: 'skipped',
        reason: data.skip === true ? 'skipped' : String(data.skip),
      });
    } else if (type === 'test:pass') {
      tests.push({ name: data.name, status: 'passed' });
    } else {
      tests.push({
        name: data.name,
        status: 'failed',
        message: describeFailure(data.details?.error),
      });
    }
  }

  yield JSON.stringify({ tests });
}
