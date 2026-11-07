'use strict';
// The packages' own @swc/jest, with the mutant applied first. Jest caches by this key, so a
// mutated file gets its own cache entry and a clean run never reads a mutated one.
const { createRequire } = require('node:module');
const path = require('node:path');

const { applyMutant } = require('./apply-mutant.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const swcJest = createRequire(path.join(REPO_ROOT, 'package.json'))('@swc/jest');

const createTransformer = (options) => {
  const inner = swcJest.createTransformer(options);

  return {
    ...inner,
    getCacheKey: (source, filename, config) =>
      inner.getCacheKey(applyMutant(source, filename), filename, config),
    process: (source, filename, config) =>
      inner.process(applyMutant(source, filename), filename, config),
    processAsync: (source, filename, config) =>
      inner.processAsync(applyMutant(source, filename), filename, config),
  };
};

module.exports = { createTransformer };
