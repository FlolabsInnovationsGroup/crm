import {
  type RecordedDisputeStatus,
  type RecordedPaymentStatus,
} from 'src/modules/payment-tracker/types/recorded-payment.type';

type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

// Shape of the custom "stripePayment" object created by setup-payments.mjs.
export type StripePaymentRecord = {
  id: string;
  personId: string | null;
  stripePaymentIntentId: string | null;
  amount: CurrencyValue | null;
  refundedAmount: CurrencyValue | null;
  paidAt: string | Date | null;
  paymentStatus: RecordedPaymentStatus | null;
  disputeStatus?: RecordedDisputeStatus | null;
  disputedAmount?: CurrencyValue | null;
  deletedAt?: string | null;
};

// The payment fields setup-payments.mjs adds to person.
export type PersonPaymentRecord = {
  id: string;
  paymentPlan: string | null;
  paymentStatus: string | null;
  paymentAgreedAmount: CurrencyValue | null;
  paymentPaidAmount: CurrencyValue | null;
  paymentRemainingAmount: CurrencyValue | null;
  paymentInstallmentCount: number | null;
  paymentFirstPaidAt: string | null;
  paymentLastPaidAt: string | null;
};
