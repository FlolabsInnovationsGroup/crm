// Creates the Manual review answers object: every applicant question answered
// from Needs review, with the answer, so the team can build templates from it.
// Safe to run again: existing objects and fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-manual-review-answers.mjs
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

let answer = await ensureObject({
  nameSingular: 'manualReviewAnswer',
  namePlural: 'manualReviewAnswers',
  labelSingular: 'Manual review answer',
  labelPlural: 'Manual review answers',
  icon: 'IconMessageCircleQuestion',
  description: 'Applicant questions answered from Needs review, with our answer',
});

await ensureField(answer, {
  name: 'question',
  label: 'Question',
  type: 'TEXT',
  icon: 'IconMessageQuestion',
});
await ensureField(answer, {
  name: 'answer',
  label: 'Answer',
  type: 'TEXT',
  icon: 'IconMessageReply',
});
await ensureField(answer, {
  name: 'category',
  label: 'Category',
  type: 'TEXT',
  icon: 'IconTag',
});
await ensureField(answer, {
  name: 'templateName',
  label: 'Template used',
  type: 'TEXT',
  icon: 'IconFileText',
});
await ensureField(answer, {
  name: 'applicantEmail',
  label: 'Applicant email',
  type: 'TEXT',
  icon: 'IconMail',
});
await ensureField(answer, {
  name: 'answeredAt',
  label: 'Answered at',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(answer, {
  name: 'source',
  label: 'Recorded from',
  type: 'SELECT',
  icon: 'IconPointer',
  options: [
    {
      value: 'REPLY_FROM_CARD',
      label: 'Reply from the card',
      color: 'green',
      position: 0,
    },
    { value: 'MARKED_DONE', label: 'Marked done', color: 'gray', position: 1 },
  ],
});
await ensureField(answer, {
  name: 'reviewThreadId',
  label: 'Review email ID',
  type: 'TEXT',
  icon: 'IconId',
  description: 'Set by the CRM; do not edit',
  // One row per Needs review card.
  isUnique: true,
});

answer = await findObject('manualReviewAnswer');

await ensureField(answer, {
  name: 'person',
  label: 'Person',
  type: 'RELATION',
  icon: 'IconUser',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: person.id,
    targetFieldLabel: 'Manual review answers',
    targetFieldIcon: 'IconMessageCircleQuestion',
  },
});

console.log('Manual review answers are ready. Deploy the server next.');
