// Creates the meeting fields on people that the meeting tracker fills from
// synced calendars. Safe to run again: existing fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-meeting-tracker.mjs
// or put the key in a file and pass TWENTY_TOKEN_FILE=<path> instead.
import { readFileSync } from 'node:fs';

const baseUrl = (process.env.TWENTY_URL ?? '').replace(/\/$/, '');
const token = (
  process.env.TWENTY_TOKEN_FILE
    ? readFileSync(process.env.TWENTY_TOKEN_FILE, 'utf8')
    : (process.env.TWENTY_TOKEN ?? '')
).trim();

if (baseUrl === '' || token === '') {
  console.error(
    'Set TWENTY_URL and TWENTY_TOKEN (an API key with admin rights).',
  );
  process.exit(1);
}

// The metadata GraphQL API is what the app itself uses, so its shape is stable.
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

const person = await findObject('person');

if (!person) {
  throw new Error(
    'The person object was not found; is the token for the right workspace?',
  );
}

await ensureField(person, {
  name: 'firstMeetingAt',
  label: 'First meeting',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(person, {
  name: 'meetingBookedAt',
  label: 'Meeting booked at',
  type: 'DATE_TIME',
  icon: 'IconCalendarPlus',
});
await ensureField(person, {
  name: 'firstMeetingEventId',
  label: 'First meeting event ID',
  type: 'TEXT',
  icon: 'IconId',
  // Lets the CRM find whose meeting disappeared when a cancelled event is
  // deleted by calendar sync.
  description: 'Set by the CRM; do not edit',
});
await ensureField(person, {
  name: 'daysToMeeting',
  label: 'Days to meeting',
  type: 'NUMBER',
  icon: 'IconHourglass',
});

console.log(
  'Meeting fields are ready. Deploy the server, then run the recalculateMeetingTimes mutation once.',
);
