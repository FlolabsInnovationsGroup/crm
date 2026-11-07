#!/usr/bin/env node
// Data flow layer of the CRM Analytics suite. See DATAFLOW.md.
//   node packages/twenty-utils/flolabs/analytics-tests/dataflow/run.mjs [--server-only]
// DATAFLOW_ONLY=<regex on test names> runs part of it; DATAFLOW_VERBOSE=1 prints passes too.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('./lib/main.cjs');

main(process.argv.slice(2))
  .catch((error) => {
    console.error(error);
    process.exitCode = 2;
  })
  // TypeORM and jest leave handles open; the report is already written.
  .finally(() => process.exit());
