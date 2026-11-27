// Creates the Agreement templates object (documents to sign, written in the
// CRM) and Agreement requests (one per Send agreement, tracked until signed).
// Safe to run again: existing objects and fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-agreement-templates.mjs
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

const option = (value, label, color, position) => ({
  value,
  label,
  color,
  position,
});

const template = await ensureObject({
  nameSingular: 'agreementTemplate',
  namePlural: 'agreementTemplates',
  labelSingular: 'Agreement template',
  labelPlural: 'Agreement templates',
  icon: 'IconFileCertificate',
  description: 'Agreements and other documents sent to interns to sign',
});

await ensureField(template, {
  name: 'body',
  label: 'Text',
  type: 'RICH_TEXT',
  icon: 'IconFileText',
  description:
    'The document text. Placeholders like {{fullName}} are filled from the person',
});
await ensureField(template, {
  name: 'documentType',
  label: 'Document type',
  type: 'SELECT',
  icon: 'IconCategory',
  options: [
    option('AGREEMENT', 'Internship agreement', 'blue', 0),
    option('ACADEMIC_INTEGRITY', 'Academic integrity', 'purple', 1),
    option('LETTER', 'Letter', 'gray', 2),
    option('OTHER', 'Other', 'orange', 3),
  ],
});
await ensureField(template, {
  name: 'paymentPlan',
  label: 'For payment plan',
  type: 'SELECT',
  icon: 'IconReceipt',
  description: 'Empty means any plan',
  options: [
    option('FULL_ONE_TIME', 'Full one-time payment', 'green', 0),
    option('SCHOLARSHIP_MONTHLY_FEE', 'Scholarship + monthly fee', 'blue', 1),
    option('FULL_SCHOLARSHIP', 'Full scholarship', 'purple', 2),
    option('CUSTOM', 'Custom plan', 'orange', 3),
  ],
});
await ensureField(template, {
  name: 'isActive',
  label: 'In use',
  type: 'BOOLEAN',
  icon: 'IconCircleCheck',
  defaultValue: true,
});
await ensureField(template, {
  name: 'notes',
  label: 'Notes',
  type: 'TEXT',
  icon: 'IconNotes',
  description: 'Who signs, in what order, and anything else to remember',
});

const person = await findObject('person');

const request = await ensureObject({
  nameSingular: 'agreementRequest',
  namePlural: 'agreementRequests',
  labelSingular: 'Agreement request',
  labelPlural: 'Agreement requests',
  icon: 'IconSignature',
  description: 'Agreements sent for e-signature, from sending until signed',
});

await ensureField(request, {
  name: 'person',
  label: 'Person',
  type: 'RELATION',
  icon: 'IconUser',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: person.id,
    targetFieldLabel: 'Agreement requests',
    targetFieldIcon: 'IconSignature',
  },
});
await ensureField(request, {
  name: 'status',
  label: 'Status',
  type: 'SELECT',
  icon: 'IconProgressCheck',
  defaultValue: "'SENT'",
  options: [
    option('SENT', 'Waiting for the intern', 'blue', 0),
    option('APPLICANT_SIGNED', 'Waiting for FloLabs', 'purple', 1),
    option('COMPLETED', 'Signed', 'green', 2),
    option('REJECTED', 'Declined', 'red', 3),
    option('CANCELLED', 'Cancelled', 'gray', 4),
  ],
});
await ensureField(request, {
  name: 'documents',
  label: 'Documents',
  type: 'TEXT',
  icon: 'IconFiles',
  description: 'The templates sent together',
});
await ensureField(request, {
  name: 'documensoEnvelopeId',
  label: 'Documenso envelope',
  type: 'TEXT',
  icon: 'IconId',
});
await ensureField(request, {
  name: 'sentAt',
  label: 'Sent',
  type: 'DATE_TIME',
  icon: 'IconSend',
});
await ensureField(request, {
  name: 'applicantSignedAt',
  label: 'Intern signed',
  type: 'DATE_TIME',
  icon: 'IconSignature',
});
await ensureField(request, {
  name: 'countersignerEmailedAt',
  label: 'Sent to FloLabs signer',
  type: 'DATE_TIME',
  icon: 'IconMailForward',
});
await ensureField(request, {
  name: 'completedAt',
  label: 'Completed',
  type: 'DATE_TIME',
  icon: 'IconCircleCheck',
});
await ensureField(request, {
  name: 'signedFilesSavedAt',
  label: 'Signed files saved',
  type: 'DATE_TIME',
  icon: 'IconPaperclip',
  description: 'When the signed PDFs were attached to the person',
});

console.log(
  'Agreement templates and requests are ready. Next: in Settings > Roles, decide who may create Agreement requests; that is who can send agreements.',
);
