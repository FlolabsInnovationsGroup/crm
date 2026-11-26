import { THREE_DECIMAL_CURRENCIES } from 'src/modules/payment-tracker/constants/three-decimal-currencies.constant';
import { ZERO_DECIMAL_CURRENCIES } from 'src/modules/payment-tracker/constants/zero-decimal-currencies.constant';

export const stripeAmountToMicros = (amount: number, currency: string) => {
  const currencyCode = currency.toUpperCase();

  if (ZERO_DECIMAL_CURRENCIES.has(currencyCode)) {
    return amount * 1_000_000;
  }

  return THREE_DECIMAL_CURRENCIES.has(currencyCode)
    ? amount * 1_000
    : amount * 10_000;
};
