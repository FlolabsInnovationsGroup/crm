// Creates the Stripe payment object and the payment fields on people that the
// payment tracker uses. Safe to run again: existing objects and fields are left untouched.
//
//   TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<api key> node setup-payments.mjs
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

const option = (value, label, color, position) => ({
  value,
  label,
  color,
  position,
});

await ensureField(person, {
  name: 'paymentPlan',
  label: 'Payment plan',
  type: 'SELECT',
  icon: 'IconReceipt',
  options: [
    option('FULL_ONE_TIME', 'Full one-time payment', 'green', 0),
    option('SCHOLARSHIP_MONTHLY_FEE', 'Scholarship + monthly fee', 'blue', 1),
    option('FULL_SCHOLARSHIP', 'Full scholarship', 'purple', 2),
    option('CUSTOM', 'Custom plan', 'orange', 3),
  ],
});
await ensureField(person, {
  name: 'paymentStatus',
  label: 'Payment status',
  type: 'SELECT',
  icon: 'IconCircleDot',
  options: [
    option('NOT_PAID', 'Not paid', 'gray', 0),
    option('PAYING_INSTALLMENTS', 'Paying in installments', 'yellow', 1),
    option('PAID_IN_FULL', 'Paid in full', 'green', 2),
    option('SCHOLARSHIP', 'Scholarship', 'purple', 3),
  ],
});
await ensureField(person, {
  name: 'paymentAgreedAmount',
  label: 'Agreed amount',
  type: 'CURRENCY',
  icon: 'IconCoins',
});
await ensureField(person, {
  name: 'paymentPaidAmount',
  label: 'Paid so far',
  type: 'CURRENCY',
  icon: 'IconCash',
});
await ensureField(person, {
  name: 'paymentRemainingAmount',
  label: 'Remaining',
  type: 'CURRENCY',
  icon: 'IconHourglass',
});
await ensureField(person, {
  name: 'paymentInstallmentCount',
  label: 'Payments made',
  type: 'NUMBER',
  icon: 'IconHash',
});
await ensureField(person, {
  name: 'paymentFirstPaidAt',
  label: 'First payment',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(person, {
  name: 'paymentLastPaidAt',
  label: 'Last payment',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(person, {
  name: 'paymentNotes',
  label: 'Payment agreement notes',
  type: 'TEXT',
  icon: 'IconNotes',
});

let payment = await ensureObject({
  nameSingular: 'stripePayment',
  namePlural: 'stripePayments',
  labelSingular: 'Payment',
  labelPlural: 'Payments',
  icon: 'IconCreditCard',
  description: 'Payments received through Stripe',
});

await ensureField(payment, {
  name: 'amount',
  label: 'Amount',
  type: 'CURRENCY',
  icon: 'IconCoins',
});
await ensureField(payment, {
  name: 'refundedAmount',
  label: 'Refunded',
  type: 'CURRENCY',
  icon: 'IconReceiptRefund',
});
await ensureField(payment, {
  name: 'paidAt',
  label: 'Paid at',
  type: 'DATE_TIME',
  icon: 'IconCalendarEvent',
});
await ensureField(payment, {
  name: 'paymentStatus',
  label: 'Status',
  type: 'SELECT',
  icon: 'IconCircleDot',
  options: [
    option('SUCCEEDED', 'Paid', 'green', 0),
    option('PARTIALLY_REFUNDED', 'Partly refunded', 'orange', 1),
    option('REFUNDED', 'Refunded', 'red', 2),
  ],
});
await ensureField(payment, {
  name: 'disputeStatus',
  label: 'Dispute',
  type: 'SELECT',
  icon: 'IconAlertTriangle',
  options: [
    option('OPEN', 'Open', 'orange', 0),
    option('WON', 'Won or closed', 'green', 1),
    option('LOST', 'Lost', 'red', 2),
  ],
});
await ensureField(payment, {
  name: 'disputedAmount',
  label: 'Disputed amount',
  type: 'CURRENCY',
  icon: 'IconCoins',
});
await ensureField(payment, {
  name: 'payerEmail',
  label: 'Payer email',
  type: 'TEXT',
  icon: 'IconMail',
});
await ensureField(payment, {
  name: 'description',
  label: 'Description',
  type: 'TEXT',
  icon: 'IconFileText',
});
await ensureField(payment, {
  name: 'stripePaymentIntentId',
  label: 'Stripe payment ID',
  type: 'TEXT',
  icon: 'IconId',
  // Two deliveries of the same Stripe event must not create two payments.
  isUnique: true,
});
await ensureField(payment, {
  name: 'stripeCustomerId',
  label: 'Stripe customer ID',
  type: 'TEXT',
  icon: 'IconId',
});

payment = await findObject('stripePayment');

await ensureField(payment, {
  name: 'person',
  label: 'Person',
  type: 'RELATION',
  icon: 'IconUser',
  relationCreationPayload: {
    type: 'MANY_TO_ONE',
    targetObjectMetadataId: person.id,
    targetFieldLabel: 'Payments',
    targetFieldIcon: 'IconCreditCard',
  },
});

console.log(
  'Payments are ready. Next: in Settings > Roles, give only admins access to the Payments object and the payment fields on People.',
);
