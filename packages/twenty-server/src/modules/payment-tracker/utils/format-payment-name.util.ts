import { type RecordedPayment } from 'src/modules/payment-tracker/types/recorded-payment.type';

export const formatPaymentName = (payment: RecordedPayment) =>
  `${(payment.amountMicros / 1_000_000).toFixed(2)} ${payment.currencyCode} · ${payment.paidAt.toISOString().slice(0, 10)}`;
