// Creates the three applicant fields on Person for the local run in contract section 9.
// Not run yet: it needs the CRM server. Safe to run again: existing fields stay as they are.
//
//   TWENTY_URL=http://localhost:3000 TWENTY_TOKEN_FILE=<work>/e2e/token.txt node fields.mjs
import { readFileSync } from 'node:fs';

const baseUrl = (process.env.TWENTY_URL ?? '').replace(/\/$/, '');
const token = (
  process.env.TWENTY_TOKEN_FILE
    ? readFileSync(process.env.TWENTY_TOKEN_FILE, 'utf8')
    : (process.env.TWENTY_TOKEN ?? '')
).trim();

if (baseUrl === '' || token === '') {
  console.error(
    'Set TWENTY_URL and TWENTY_TOKEN_FILE (an admin API key for the Apple seed workspace).',
  );
  process.exit(1);
}

// graphql, findObject and ensureField are copied from
// packages/twenty-utils/flolabs/setup-forms.mjs:23-41, 43-63, 89-107.
const graphql = async (query, variables = {}) => {
  const response = await fetch(`${baseUrl}/metadata`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.errors) {
    throw new Error(
      `Request failed (${response.status}): ${JSON.stringify(json.errors ?? json)}`,
    );
  }

  return json.data;
};

const findObject = async (nameSingular) => {
  const data = await graphql(`
    query {
      objects(paging: { first: 1000 }) {
        edges {
          node {
            id
            nameSingular
            fieldsList {
              name
            }
          }
        }
      }
    }
  `);

  return data.objects.edges
    .map((edge) => edge.node)
    .find((object) => object.nameSingular === nameSingular);
};

const ensureField = async (object, input) => {
  if (object.fieldsList.some((field) => field.name === input.name)) {
    console.log(`= field ${object.nameSingular}.${input.name} already exists`);

    return;
  }

  await graphql(
    `
      mutation ($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) {
          id
        }
      }
    `,
    { input: { field: { objectMetadataId: object.id, ...input } } },
  );
  console.log(`+ field ${object.nameSingular}.${input.name}`);
};

const buildOptions = (labelsByValue) =>
  Object.entries(labelsByValue).map(([value, label], position) => ({
    value,
    label,
    position,
    color: 'gray',
  }));

// Section 1 raw values, plus LEGACY_TEST to test the Unmapped rows.
const STAGE_OPTIONS = buildOptions({
  NEW: 'New',
  CONTACTED: 'Contacted',
  BEFORE_MEETING: 'Before meeting',
  SATURDAY_MEETING: 'Saturday meeting',
  ATTENDED: 'Attended',
  SECOND_MEETING: 'Second meeting',
  AGREEMENT_SENT: 'Agreement sent',
  SIGNED_PAID: 'Signed paid',
  SIGNED_NON_PAID: 'Signed non paid',
  NO_ANSWER: 'No answer',
  NOT_INTERESTED: 'Not interested',
  REJECTED_BY_US: 'Rejected by us',
  INTERESTED: 'Interested',
  LEGACY_TEST: 'Legacy test',
});

// Two tracks and one value outside the map, so several-position and Unmapped both show.
const POSITION_OPTIONS = buildOptions({
  FINANCE_INTERN: 'Finance intern',
  MARKETING_INTERN: 'Marketing intern',
  AI_AGI_INTERN: 'AI AGI intern',
  SOFTWARE_DEVELOPMENT_INTERN: 'Software development intern',
  ROBOTICS_ENGINEERING_INTERN: 'Robotics engineering intern',
  LEGACY_POSITION: 'Legacy position',
});

const SOURCE_OPTIONS = buildOptions({
  LINKEDIN: 'LinkedIn',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  UNIVERSITY: 'University',
});

const person = await findObject('person');

if (!person) {
  throw new Error(
    'The person object was not found; is the token for the right workspace?',
  );
}

await ensureField(person, {
  name: 'stage',
  label: 'Stage',
  type: 'SELECT',
  icon: 'IconProgress',
  options: STAGE_OPTIONS,
});
await ensureField(person, {
  name: 'positionsAppliedFor',
  label: 'Positions applied for',
  type: 'MULTI_SELECT',
  icon: 'IconBriefcase',
  options: POSITION_OPTIONS,
});
await ensureField(person, {
  name: 'applicantSource',
  label: 'Applicant source',
  type: 'SELECT',
  icon: 'IconAntenna',
  options: SOURCE_OPTIONS,
});

console.log('Fields are ready.');
