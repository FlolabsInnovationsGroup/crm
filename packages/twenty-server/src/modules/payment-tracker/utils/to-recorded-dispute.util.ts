import { isNonEmptyArray } from 'twenty-shared/utils';
import type Stripe from 'stripe';

import {
  type RecordedDispute,
  type RecordedDisputeStatus,
} from 'src/modules/payment-tracker/types/recorded-payment.type';
import { stripeAmountToMicros } from 'src/modules/payment-tracker/utils/stripe-amount-to-micros.util';

// Only "lost" takes money through the dispute itself; a prevented dispute
// resolved by refund already shows in the charge's refunded amount.
const toDisputeStatus = (
  status: Stripe.Dispute.Status,
): RecordedDisputeStatus => {
  switch (status) {
    case 'lost':
      return 'LOST';
    case 'won':
    case 'warning_closed':
    case 'prevented':
      return 'WON';
    default:
      return 'OPEN';
  }
};

export const toRecordedDispute = (
  disputes: Stripe.Dispute[],
): RecordedDispute | null => {
  if (!isNonEmptyArray(disputes)) {
    return null;
  }

  const recordedDisputes: RecordedDispute[] = disputes.map((dispute) => ({
    status: toDisputeStatus(dispute.status),
    amountMicros: stripeAmountToMicros(dispute.amount, dispute.currency),
    currencyCode: dispute.currency.toUpperCase(),
  }));

  const lostDisputes = recordedDisputes.filter(
    (dispute) => dispute.status === 'LOST',
  );

  if (isNonEmptyArray(lostDisputes)) {
    const currencyCode = lostDisputes[0].currencyCode;

    return {
      status: 'LOST',
      amountMicros: lostDisputes
        .filter((dispute) => dispute.currencyCode === currencyCode)
        .reduce((total, dispute) => total + dispute.amountMicros, 0),
      currencyCode,
    };
  }

  const openDispute = recordedDisputes.find(
    (dispute) => dispute.status === 'OPEN',
  );

  return openDispute ?? recordedDisputes[0];
};
