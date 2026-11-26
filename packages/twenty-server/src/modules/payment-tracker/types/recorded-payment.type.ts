export type RecordedPaymentStatus =
  | 'SUCCEEDED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

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
};
