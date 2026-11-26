import { isDefined } from 'twenty-shared/utils';

type PaymentEventRecord = { personId?: string | null };

type PaymentEvent = {
  properties: {
    before?: PaymentEventRecord;
    after?: PaymentEventRecord;
    updatedFields?: string[];
  };
};

const PAYMENT_FIELDS_AFFECTING_TOTALS = [
  'personId',
  'amount',
  'refundedAmount',
  'paidAt',
  'paymentStatus',
];

const getPersonIds = (events: PaymentEvent[]) =>
  [
    ...new Set(
      events.flatMap(({ properties }) => [
        properties.before?.personId,
        properties.after?.personId,
      ]),
    ),
  ].filter((personId): personId is string => isDefined(personId));

// A payment moved from one person to another changes both people's totals.
export const getPersonIdsAffectedByPaymentEvents = (events: PaymentEvent[]) =>
  getPersonIds(
    events.filter(
      ({ properties }) =>
        !isDefined(properties.updatedFields) ||
        properties.updatedFields.some((field) =>
          PAYMENT_FIELDS_AFFECTING_TOTALS.includes(field),
        ),
    ),
  );

// Deleting or restoring a payment always changes its person's totals.
export const getPersonIdsOfPayments = (events: PaymentEvent[]) =>
  getPersonIds(events);

const PERSON_FIELDS_AFFECTING_TOTALS = ['paymentPlan', 'paymentAgreedAmount'];

export const getPersonIdsWithChangedAgreement = (
  events: { recordId: string; properties: { updatedFields?: string[] } }[],
) =>
  events
    .filter(({ properties }) =>
      (properties.updatedFields ?? []).some((field) =>
        PERSON_FIELDS_AFFECTING_TOTALS.includes(field),
      ),
    )
    .map(({ recordId }) => recordId);
