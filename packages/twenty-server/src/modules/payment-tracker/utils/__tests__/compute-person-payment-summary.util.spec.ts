import { computePersonPaymentSummary } from 'src/modules/payment-tracker/utils/compute-person-payment-summary.util';

const payment = (
  dollars: number,
  paidAt: string,
  overrides: Partial<{ refundedDollars: number; currencyCode: string }> = {},
) => ({
  amountMicros: dollars * 1_000_000,
  refundedAmountMicros: (overrides.refundedDollars ?? 0) * 1_000_000,
  currencyCode: overrides.currencyCode ?? 'USD',
  paidAt: new Date(paidAt),
});

const usd = (dollars: number) => ({
  amountMicros: dollars * 1_000_000,
  currencyCode: 'USD',
});

describe('computePersonPaymentSummary', () => {
  it('marks a full one-time payment as paid in full', () => {
    expect(
      computePersonPaymentSummary({
        plan: 'FULL_ONE_TIME',
        agreedAmount: null,
        payments: [payment(500, '2026-11-02')],
      }),
    ).toEqual({
      paidAmountMicros: 500_000_000,
      currencyCode: 'USD',
      installmentCount: 1,
      firstPaidAt: new Date('2026-11-02'),
      lastPaidAt: new Date('2026-11-02'),
      status: 'PAID_IN_FULL',
    });
  });

  it('tracks a custom plan paid in installments until the agreed amount is reached', () => {
    const firstTwo = [payment(100, '2026-10-01'), payment(100, '2026-11-01')];

    const partway = computePersonPaymentSummary({
      plan: 'CUSTOM',
      agreedAmount: usd(300),
      payments: firstTwo,
    });

    expect(partway.status).toBe('PAYING_INSTALLMENTS');
    expect(partway.paidAmountMicros).toBe(200_000_000);
    expect(partway.installmentCount).toBe(2);
    expect(partway.firstPaidAt).toEqual(new Date('2026-10-01'));

    expect(
      computePersonPaymentSummary({
        plan: 'CUSTOM',
        agreedAmount: usd(300),
        payments: [...firstTwo, payment(100, '2026-12-01')],
      }).status,
    ).toBe('PAID_IN_FULL');
  });

  it('subtracts refunds and ignores fully refunded payments', () => {
    const summary = computePersonPaymentSummary({
      plan: 'SCHOLARSHIP_MONTHLY_FEE',
      agreedAmount: null,
      payments: [
        payment(50, '2026-10-01', { refundedDollars: 50 }),
        payment(50, '2026-11-01', { refundedDollars: 20 }),
      ],
    });

    expect(summary.paidAmountMicros).toBe(30_000_000);
    expect(summary.installmentCount).toBe(1);
    expect(summary.status).toBe('PAYING_INSTALLMENTS');
  });

  it('leaves out payments in another currency than the agreement', () => {
    const summary = computePersonPaymentSummary({
      plan: 'CUSTOM',
      agreedAmount: usd(200),
      payments: [
        payment(100, '2026-10-01'),
        payment(100, '2026-11-01', { currencyCode: 'EUR' }),
      ],
    });

    expect(summary.paidAmountMicros).toBe(100_000_000);
    expect(summary.status).toBe('PAYING_INSTALLMENTS');
  });

  it('takes a lost dispute off the total and drops a payment lost in full', () => {
    const summary = computePersonPaymentSummary({
      plan: 'CUSTOM',
      agreedAmount: usd(300),
      payments: [
        { ...payment(100, '2026-09-01'), lostToDisputeMicros: 100_000_000 },
        { ...payment(100, '2026-10-01'), lostToDisputeMicros: 40_000_000 },
        payment(100, '2026-11-01'),
      ],
    });

    expect(summary.paidAmountMicros).toBe(160_000_000);
    expect(summary.installmentCount).toBe(2);
    expect(summary.firstPaidAt).toEqual(new Date('2026-10-01'));
    expect(summary.status).toBe('PAYING_INSTALLMENTS');
  });

  it('shows a full scholarship as scholarship and nobody else as paid without payments', () => {
    expect(
      computePersonPaymentSummary({
        plan: 'FULL_SCHOLARSHIP',
        agreedAmount: null,
        payments: [],
      }).status,
    ).toBe('SCHOLARSHIP');
    expect(
      computePersonPaymentSummary({
        plan: null,
        agreedAmount: null,
        payments: [],
      }).status,
    ).toBe('NOT_PAID');
  });
});
