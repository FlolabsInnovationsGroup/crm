import { isNonEmptyString, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import type Stripe from 'stripe';

import {
  type RecordedPayment,
  type RecordedPaymentStatus,
} from 'src/modules/payment-tracker/types/recorded-payment.type';
import { stripeAmountToMicros } from 'src/modules/payment-tracker/utils/stripe-amount-to-micros.util';

const getPayerEmail = (paymentIntent: Stripe.PaymentIntent) => {
  const charge =
    isDefined(paymentIntent.latest_charge) &&
    !isString(paymentIntent.latest_charge)
      ? paymentIntent.latest_charge
      : null;
  const customer =
    isDefined(paymentIntent.customer) &&
    !isString(paymentIntent.customer) &&
    !paymentIntent.customer.deleted
      ? paymentIntent.customer
      : null;

  const email = [
    paymentIntent.receipt_email,
    charge?.billing_details?.email,
    charge?.receipt_email,
    customer?.email,
  ].find(isNonEmptyString);

  return email?.trim().toLowerCase() ?? null;
};

// Expects the payment intent retrieved with latest_charge and customer expanded.
export const toRecordedPayment = (
  paymentIntent: Stripe.PaymentIntent,
): RecordedPayment | null => {
  if (paymentIntent.status !== 'succeeded') {
    return null;
  }

  const charge =
    isDefined(paymentIntent.latest_charge) &&
    !isString(paymentIntent.latest_charge)
      ? paymentIntent.latest_charge
      : null;
  const refundedAmount = charge?.amount_refunded ?? 0;
  const status: RecordedPaymentStatus =
    refundedAmount <= 0
      ? 'SUCCEEDED'
      : refundedAmount >= paymentIntent.amount_received
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED';

  return {
    stripePaymentIntentId: paymentIntent.id,
    amountMicros: stripeAmountToMicros(
      paymentIntent.amount_received,
      paymentIntent.currency,
    ),
    refundedAmountMicros: stripeAmountToMicros(
      refundedAmount,
      paymentIntent.currency,
    ),
    currencyCode: paymentIntent.currency.toUpperCase(),
    paidAt: new Date(paymentIntent.created * 1000),
    status,
    payerEmail: getPayerEmail(paymentIntent),
    stripeCustomerId: isString(paymentIntent.customer)
      ? paymentIntent.customer
      : (paymentIntent.customer?.id ?? null),
    description: paymentIntent.description ?? null,
  };
};
