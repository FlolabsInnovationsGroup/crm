export type RecordedPaymentStatus =
  | 'SUCCEEDED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type RecordedDisputeStatus = 'OPEN' | 'WON' | 'LOST';

export type RecordedDispute = {
  status: RecordedDisputeStatus;
  amountMicros: number;
  currencyCode: string;
};

// One Stripe payment as the CRM stores it; amounts are in currency micros.
export type RecordedPayment = {
  stripePaymentIntentId: string;
  amountMicros: number;
  refundedAmountMicros: number;
  currencyCode: string;
  paidAt: Date;
  status: RecordedPaymentStatus;
  payerEmail: string | null;
  stripeCustomerId: string | null;
  description: string | null;
  dispute: RecordedDispute | null;
};
