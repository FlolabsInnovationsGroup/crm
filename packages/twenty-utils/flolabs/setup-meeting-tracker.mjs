// Creates the meeting fields on people and the Calendly booking object that
// the meeting tracker uses. Safe to run again: existing objects and fields are
// left untouched.
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

const ensureObject = async (input) => {
  const existing = await findObject(input.nameSingular);

  if (existing) {
    console.log(`= object ${input.nameSingular} already exists`);

    return existing;
  }

  await graphql(
    `
      mutation ($input: CreateOneObjectInput!) {
        createOneObject(input: $input) {
          id
        }
      }
    `,
    { input: { object: input } },
  );
  console.log(`+ object ${input.nameSingular}`);

  return findObject(input.nameSingular);
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
  // Lets the CRM find whose meeting disappeared when a cancelled calendar
  // event is deleted by calendar sync.
  description: 'Set by the CRM; do not edit',
});
await ensureField(person, {
  name: 'daysToMeeting',
  label: 'Days to meeting',
  type: 'NUMBER',
  icon: 'IconHourglass',
});
await ensureField(person, {
  name: 'daysToBooking',
  label: 'Days to booking',
  type: 'NUMBER',
  icon: 'IconHourglass',
});

let booking = await ensureObject({
  nameSingular: 'calendlyBooking',
  namePlural: 'calendlyBookings',
  labelSingular: 'Calendly booking',
  labelPlural: 'Calendly bookings',
  icon: 'IconCalendarEvent',
  description: 'Meetings booked through Calendly',
});

await ensureField(booking, {
  name: 'meetingStartsAt',
  label: 'Meeting starts at',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(booking, {
  name: 'bookedAt',
  label: 'Booked at',
  type: 'DATE_TIME',
  icon: 'IconCalendarPlus',
});
await ensureField(booking, {
  name: 'bookingStatus',
  label: 'Status',
  type: 'SELECT',
  icon: 'IconCircleDot',
  options: [
    { value: 'ACTIVE', label: 'Booked', color: 'green', position: 0 },
    { value: 'CANCELED', label: 'Cancelled', color: 'red', position: 1 },
  ],
});
await ensureField(booking, {
  name: 'inviteeEmail',
  label: 'Invitee email',
  type: 'TEXT',
  icon: 'IconMail',
});
await ensureField(booking, {
  name: 'eventName',
  label: 'Event type',
  type: 'TEXT',
  icon: 'IconCalendar',
});
await ensureField(booking, {
  name: 'hostEmail',
  label: 'Calendly account',
  type: 'TEXT',
  icon: 'IconUser',
});
await ensureField(booking, {
  name: 'calendlyInviteeUri',
  label: 'Calendly invitee ID',
  type: 'TEXT',
  icon: 'IconId',
  // Two deliveries of the same Calendly event must not create two bookings.
  isUnique: true,
});

booking = await findObject('calendlyBooking');

await ensureField(booking, {
  name: 'person',
  label: 'Person',
  type: 'RELATION',
  icon: 'IconUser',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: person.id,
    targetFieldLabel: 'Calendly bookings',
    targetFieldIcon: 'IconCalendarEvent',
  },
});

console.log(
  'Meeting fields and Calendly bookings are ready. Deploy the server, add the Calendly settings, then run syncCalendlyBookings once.',
);
