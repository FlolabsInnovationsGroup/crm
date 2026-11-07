#!/usr/bin/env node
// The field options the demo people need. setup-seed-objects.mjs imports buildDemoFieldValues;
// run directly, this prints the same values as JSON. The values do not depend on the day.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDemo } from './generate.mjs';

const unique = (values) => [...new Set(values.filter((value) => value !== null))];

export const buildDemoFieldValues = () => {
  const { people } = buildDemo();

  return {
    stage: unique(people.flatMap((person) => [person.initialStage, ...person.changes.map((change) => change.after)])),
    positionsAppliedFor: unique(people.flatMap((person) => person.positions)),
    applicantSource: unique(people.map((person) => person.source)),
  };
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildDemoFieldValues(), null, 2));
}
