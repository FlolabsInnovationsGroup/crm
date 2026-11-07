'use strict';
// Changes one source file in memory as it loads, so product code on disk is never touched.
// ANALYTICS_MUTANT holds { file, find, replace }. ANALYTICS_MUTANT_MARKER collects a line
// each time the change was made, so a mutant that never ran cannot read as a survivor.
const fs = require('node:fs');

const readMutant = () =>
  process.env.ANALYTICS_MUTANT === undefined
    ? null
    : JSON.parse(process.env.ANALYTICS_MUTANT);

const applyMutant = (source, filename) => {
  const mutant = readMutant();

  if (mutant === null || !filename.replace(/\\/g, '/').endsWith(mutant.file)) {
    return source;
  }

  const normalized = source.replace(/\r\n/g, '\n');

  if (!normalized.includes(mutant.find)) {
    fs.appendFileSync(process.env.ANALYTICS_MUTANT_MARKER, 'NOT_FOUND\n');

    return source;
  }

  fs.appendFileSync(process.env.ANALYTICS_MUTANT_MARKER, 'APPLIED\n');

  return normalized.replace(mutant.find, mutant.replace);
};

module.exports = { applyMutant };
