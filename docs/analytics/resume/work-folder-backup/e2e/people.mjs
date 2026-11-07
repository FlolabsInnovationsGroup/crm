// Builds the hand-calculated sample of contract section 9 through the real REST API, so
// the CRM itself writes the timeline rows. Not run yet: it needs the CRM server and worker.
//
//   TWENTY_URL=http://localhost:3000 TWENTY_TOKEN_FILE=<work>/e2e/token.txt \
//   TWENTY_WORKSPACE_ID=<apple seed workspace id> node people.mjs
//
// It then writes backdate.sql beside it. Run that in psql BEFORE the first sync (or
// DROP SCHEMA analytics CASCADE first), because a stored row is never rewritten:
//   docker compose -f packages/twenty-docker/docker-compose.dev.yml exec -T db \
//     psql -U postgres -d default < <work>/e2e/backdate.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.TWENTY_URL ?? '').replace(/\/$/, '');
const token = (
  process.env.TWENTY_TOKEN_FILE
    ? readFileSync(process.env.TWENTY_TOKEN_FILE, 'utf8')
    : (process.env.TWENTY_TOKEN ?? '')
).trim();
const workspaceId = (process.env.TWENTY_WORKSPACE_ID ?? '').trim();

if (baseUrl === '' || token === '' || workspaceId === '') {
  console.error('Set TWENTY_URL, TWENTY_TOKEN_FILE and TWENTY_WORKSPACE_ID.');
  process.exit(1);
}

// Well under the 100 requests a minute the contract allows.
const REQUEST_GAP_MS = 800;

const WORK_DIR = dirname(fileURLToPath(import.meta.url));

// The test's tracking start (contract section 9, step 4) is 2026-08-01, so H must be
// older than that to count as imported, whatever day this runs.
const IMPORTED_CREATED_AT = '2026-06-01T00:00:00.000Z';

// Ages in days before now, from the table in contract section 9. Stages go in the order
// the CRM will see them; G skips straight to ATTENDED.
const SAMPLE_PEOPLE = [
  { key: 'A', createdAge: 40, moves: [['CONTACTED', 35]] },
  { key: 'B', createdAge: 40, moves: [['CONTACTED', 20]] },
  { key: 'C', createdAge: 40, moves: [['NOT_INTERESTED', 30]] },
  { key: 'D', createdAge: 40, moves: [] },
  { key: 'E', createdAge: 5, moves: [['CONTACTED', 1]] },
  { key: 'F', createdAge: 5, moves: [] },
  { key: 'G', createdAge: 40, moves: [['ATTENDED', 35]] },
  { key: 'H', imported: true, moves: [['CONTACTED', 10]] },
];

// Other people the pipeline checks read: Unmapped, No stage, several positions.
const EXTRA_PEOPLE = [
  { key: 'UNMAPPED', stage: 'LEGACY_TEST', positionsAppliedFor: [], applicantSource: 'WEBSITE' },
  { key: 'NO_STAGE', stage: null, positionsAppliedFor: [], applicantSource: null },
  {
    key: 'SEVERAL',
    stage: 'NEW',
    positionsAppliedFor: ['FINANCE_INTERN', 'MARKETING_INTERN', 'AI_AGI_INTERN'],
    applicantSource: 'REFERRAL',
  },
  { key: 'LEGACY_POSITION', stage: 'NEW', positionsAppliedFor: ['LEGACY_POSITION'], applicantSource: 'UNIVERSITY' },
];

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const rest = async (method, path, body) => {
  await sleep(REQUEST_GAP_MS);

  const response = await fetch(`${baseUrl}/rest/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json;
};

const createPerson = async ({ key, stage, positionsAppliedFor, applicantSource }) => {
  const json = await rest('POST', 'people', {
    name: { firstName: `Sample${key}`, lastName: 'Analytics' },
    stage,
    positionsAppliedFor,
    applicantSource,
  });
  const id = json?.data?.createPerson?.id;

  if (!id) throw new Error(`No id in the reply for ${key}: ${JSON.stringify(json)}`);

  console.log(`+ person ${key} ${id}`);

  return id;
};

const moveStage = async (personId, stage) => {
  await rest('PATCH', `people/${personId}`, { stage });
};

// Same as twenty-shared uuidToBase36, which getWorkspaceSchemaName uses.
const schemaName = `workspace_${BigInt(`0x${workspaceId.replace(/-/g, '')}`).toString(36)}`;

const sqlLines = [
  '-- Written by people.mjs. Local database only. Run before the first analytics sync.',
  'BEGIN;',
];

const backdatePerson = (personId, createdAtSql) => {
  sqlLines.push(
    `UPDATE "${schemaName}"."person" SET "createdAt" = ${createdAtSql} WHERE id = '${personId}';`,
  );
};

const backdateTimeline = (personId, happensAtSql) => {
  sqlLines.push(
    `UPDATE "${schemaName}"."timelineActivity" SET "happensAt" = ${happensAtSql} WHERE "targetPersonId" = '${personId}' AND properties->'diff' ? 'stage';`,
  );
};

const ageSql = (days) => `now() - interval '${days} days'`;

const ids = {};

for (const { key, createdAge, imported, moves } of SAMPLE_PEOPLE) {
  const personId = await createPerson({
    key,
    stage: 'NEW',
    positionsAppliedFor: ['SOFTWARE_DEVELOPMENT_INTERN'],
    applicantSource: 'LINKEDIN',
  });

  ids[key] = personId;
  backdatePerson(
    personId,
    imported ? `'${IMPORTED_CREATED_AT}'` : ageSql(createdAge),
  );

  for (const [stage, age] of moves) {
    await moveStage(personId, stage);
    backdateTimeline(personId, ageSql(age));
  }
}

for (const person of EXTRA_PEOPLE) {
  ids[person.key] = await createPerson(person);
}

sqlLines.push('COMMIT;', '');

writeFileSync(join(WORK_DIR, 'backdate.sql'), sqlLines.join('\n'));
writeFileSync(join(WORK_DIR, 'people-ids.json'), JSON.stringify(ids, null, 2));

console.log(
  `Done. Wait for the worker to write the timeline rows (one per move, ${SAMPLE_PEOPLE.reduce(
    (total, { moves }) => total + moves.length,
    0,
  )} expected), then run backdate.sql in psql before the first sync.`,
);
