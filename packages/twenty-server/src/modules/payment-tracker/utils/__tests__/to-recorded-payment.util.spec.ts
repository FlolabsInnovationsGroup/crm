import type Stripe from 'stripe';

import { stripeAmountToMicros } from 'src/modules/payment-tracker/utils/stripe-amount-to-micros.util';
import { toRecordedPayment } from 'src/modules/payment-tracker/utils/to-recorded-payment.util';

const paymentIntent = (
  overrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent =>
  ({
    id: 'pi_123',
    status: 'succeeded',
    amount_received: 25_000,
    currency: 'usd',
    created: 1_764_000_000,
    receipt_email: null,
    description: 'Mastery Accelerator, month 1',
    customer: {
      id: 'cus_1',
      deleted: undefined,
      email: 'Jane@Example.com',
    },
    latest_charge: {
      amount_refunded: 0,
      billing_details: { email: null },
      receipt_email: null,
    },
    ...overrides,
  }) as unknown as Stripe.PaymentIntent;

describe('toRecordedPayment', () => {
  it('reads amount, currency, date and the payer email', () => {
    expect(toRecordedPayment(paymentIntent())).toEqual({
      stripePaymentIntentId: 'pi_123',
      amountMicros: 250_000_000,
      refundedAmountMicros: 0,
      currencyCode: 'USD',
      paidAt: new Date(1_764_000_000_000),
      status: 'SUCCEEDED',
      payerEmail: 'jane@example.com',
      stripeCustomerId: 'cus_1',
      description: 'Mastery Accelerator, month 1',
      dispute: null,
    });
  });

  describe('disputes', () => {
    const dispute = (status: Stripe.Dispute.Status, amount = 25_000) =>
      ({ status, amount, currency: 'usd' }) as Stripe.Dispute;

    it('marks a dispute still under review as open', () => {
      expect(
        toRecordedPayment(paymentIntent(), [dispute('needs_response')])
          ?.dispute,
      ).toEqual({ status: 'OPEN', amountMicros: 250_000_000 });
    });

    it('treats won, prevented and closed inquiries as won', () => {
      for (const status of ['won', 'prevented', 'warning_closed'] as const) {
        expect(
          toRecordedPayment(paymentIntent(), [dispute(status)])?.dispute
            ?.status,
        ).toBe('WON');
      }
    });

    it('reports a lost dispute with the amount taken back', () => {
      expect(
        toRecordedPayment(paymentIntent(), [
          dispute('won'),
          dispute('lost', 10_000),
        ])?.dispute,
      ).toEqual({ status: 'LOST', amountMicros: 100_000_000 });
    });
  });

  it('prefers the receipt email and marks partial refunds', () => {
    const payment = toRecordedPayment(
      paymentIntent({
        receipt_email: 'payer@example.com',
        latest_charge: {
          amount_refunded: 5_000,
          billing_details: { email: null },
          receipt_email: null,
        } as unknown as Stripe.Charge,
      }),
    );

    expect(payment?.payerEmail).toBe('payer@example.com');
    expect(payment?.status).toBe('PARTIALLY_REFUNDED');
    expect(payment?.refundedAmountMicros).toBe(50_000_000);
  });

  it('skips payments that did not succeed', () => {
    expect(
      toRecordedPayment(paymentIntent({ status: 'requires_payment_method' })),
    ).toBeNull();
  });
});

describe('stripeAmountToMicros', () => {
  it('handles two, zero and three decimal currencies', () => {
    expect(stripeAmountToMicros(1_050, 'usd')).toBe(10_500_000);
    expect(stripeAmountToMicros(1_050, 'jpy')).toBe(1_050_000_000);
    expect(stripeAmountToMicros(1_050, 'tnd')).toBe(1_050_000);
  });
});
