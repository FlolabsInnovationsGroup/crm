// Creates the Form and Form submission objects the FloLabs form builder uses.
// Safe to run again: existing objects and fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-forms.mjs
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

let form = await ensureObject({
  nameSingular: 'crmForm',
  namePlural: 'crmForms',
  labelSingular: 'Form',
  labelPlural: 'Forms',
  icon: 'IconForms',
  description: 'Public forms built with the form builder',
});

await ensureField(form, {
  name: 'status',
  label: 'Status',
  type: 'SELECT',
  icon: 'IconCircleDot',
  defaultValue: "'DRAFT'",
  options: [
    { value: 'DRAFT', label: 'Draft', color: 'gray', position: 0 },
    { value: 'PUBLISHED', label: 'Published', color: 'green', position: 1 },
  ],
});
await ensureField(form, {
  name: 'definition',
  label: 'Definition',
  type: 'RAW_JSON',
  icon: 'IconCode',
});

let submission = await ensureObject({
  nameSingular: 'formSubmission',
  namePlural: 'formSubmissions',
  labelSingular: 'Form submission',
  labelPlural: 'Form submissions',
  icon: 'IconInbox',
  description: 'Answers received through public forms',
});

await ensureField(submission, {
  name: 'answers',
  label: 'Answers',
  type: 'RAW_JSON',
  icon: 'IconListDetails',
});
await ensureField(submission, {
  name: 'submittedAt',
  label: 'Submitted at',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(submission, {
  name: 'sourceUrl',
  label: 'Source page',
  type: 'TEXT',
  icon: 'IconLink',
});

form = await findObject('crmForm');
submission = await findObject('formSubmission');

await ensureField(submission, {
  name: 'form',
  label: 'Form',
  type: 'RELATION',
  icon: 'IconForms',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: form.id,
    targetFieldLabel: 'Submissions',
    targetFieldIcon: 'IconInbox',
  },
});
await ensureField(submission, {
  name: 'person',
  label: 'Person',
  type: 'RELATION',
  icon: 'IconUser',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: person.id,
    targetFieldLabel: 'Form submissions',
    targetFieldIcon: 'IconForms',
  },
});

console.log('Forms are ready.');
