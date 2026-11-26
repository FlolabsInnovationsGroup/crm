import { THREE_DECIMAL_CURRENCIES } from 'src/modules/payment-tracker/constants/three-decimal-currencies.constant';
import { ZERO_DECIMAL_CURRENCIES } from 'src/modules/payment-tracker/constants/zero-decimal-currencies.constant';
import { type RecordedPayment } from 'src/modules/payment-tracker/types/recorded-payment.type';

const getDecimals = (currencyCode: string) =>
  ZERO_DECIMAL_CURRENCIES.has(currencyCode)
    ? 0
    : THREE_DECIMAL_CURRENCIES.has(currencyCode)
      ? 3
      : 2;

export const formatPaymentName = (payment: RecordedPayment) =>
  `${(payment.amountMicros / 1_000_000).toFixed(getDecimals(payment.currencyCode))} ${payment.currencyCode} · ${payment.paidAt.toISOString().slice(0, 10)}`;
