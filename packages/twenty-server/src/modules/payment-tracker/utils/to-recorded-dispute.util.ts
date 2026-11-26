import { isNonEmptyArray } from 'twenty-shared/utils';
import type Stripe from 'stripe';

import {
  type RecordedDispute,
  type RecordedDisputeStatus,
} from 'src/modules/payment-tracker/types/recorded-payment.type';
import { stripeAmountToMicros } from 'src/modules/payment-tracker/utils/stripe-amount-to-micros.util';

// Inquiries (warning_*) and prevented disputes never take money, so only
// "lost" counts against the payment.
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

  const recordedDisputes = disputes.map((dispute) => ({
    status: toDisputeStatus(dispute.status),
    amountMicros: stripeAmountToMicros(dispute.amount, dispute.currency),
  }));

  const lostDisputes = recordedDisputes.filter(
    (dispute) => dispute.status === 'LOST',
  );

  if (isNonEmptyArray(lostDisputes)) {
    return {
      status: 'LOST',
      amountMicros: lostDisputes.reduce(
        (total, dispute) => total + dispute.amountMicros,
        0,
      ),
    };
  }

  const openDispute = recordedDisputes.find(
    (dispute) => dispute.status === 'OPEN',
  );

  return openDispute ?? recordedDisputes[0];
};
