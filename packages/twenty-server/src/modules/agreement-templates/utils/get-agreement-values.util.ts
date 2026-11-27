import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type AgreementPersonRecord } from 'src/modules/agreement-templates/types/agreement-template-record.type';

const PAYMENT_PLAN_LABELS: Record<string, string> = {
  FULL_ONE_TIME: 'Full one-time payment',
  SCHOLARSHIP_MONTHLY_FEE: 'Scholarship + monthly fee',
  FULL_SCHOLARSHIP: 'Full scholarship',
  CUSTOM: 'Custom plan',
};

const toWords = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .filter(isNonEmptyString)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');

const joinPresent = (values: (string | null | undefined)[]) =>
  values
    .map((value) => value?.trim())
    .filter(isNonEmptyString)
    .join(', ') || null;

// The placeholders a template can use, documented in
// docs/flolabs/agreement-templates.md.
export const getAgreementValues = (
  person: AgreementPersonRecord,
  today: Date,
): Record<string, string | null> => {
  const firstName = person.name?.firstName?.trim() || null;
  const lastName = person.name?.lastName?.trim() || null;
  const amount = person.paymentAgreedAmount;

  return {
    fullName: [firstName, lastName].filter(isNonEmptyString).join(' ') || null,
    firstName,
    lastName,
    email: person.emails?.primaryEmail?.trim() || null,
    address:
      joinPresent([person.city, person.state, person.country]) ??
      (person.candidateLocation?.trim() || null),
    city: person.city?.trim() || null,
    country: person.country?.trim() || null,
    paymentPlan: isNonEmptyString(person.paymentPlan)
      ? (PAYMENT_PLAN_LABELS[person.paymentPlan] ?? toWords(person.paymentPlan))
      : null,
    agreedAmount:
      isDefined(amount?.amountMicros) && isNonEmptyString(amount.currencyCode)
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: amount.currencyCode,
          }).format(amount.amountMicros / 1_000_000)
        : null,
    date: new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(today),
  };
};
