// Creates the Form and Form submission objects the FloLabs form builder uses.
// Safe to run again: existing objects and fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-forms.mjs
const baseUrl = (process.env.TWENTY_URL ?? '').replace(/\/$/, '');
const token = process.env.TWENTY_TOKEN ?? '';

if (baseUrl === '' || token === '') {
  console.error(
    'Set TWENTY_URL and TWENTY_TOKEN (an API key with admin rights).',
  );
  process.exit(1);
}

const request = async (method, path, body) => {
  const response = await fetch(`${baseUrl}/rest/metadata/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${JSON.stringify(json)}`,
    );
  }

  return json.data;
};

const findObject = async (nameSingular) => {
  const { objects } = await request('GET', 'objects');

  return objects.find((object) => object.nameSingular === nameSingular);
};

const ensureObject = async (input) => {
  const existing = await findObject(input.nameSingular);

  if (existing) {
    console.log(`= object ${input.nameSingular} already exists`);

    return existing;
  }

  await request('POST', 'objects', input);
  console.log(`+ object ${input.nameSingular}`);

  return findObject(input.nameSingular);
};

const ensureField = async (object, input) => {
  const hasField = object.fields.some((field) => field.name === input.name);

  if (hasField) {
    console.log(`= field ${object.nameSingular}.${input.name} already exists`);

    return;
  }

  await request('POST', 'fields', { objectMetadataId: object.id, ...input });
  console.log(`+ field ${object.nameSingular}.${input.name}`);
};

const person = await findObject('person');

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
