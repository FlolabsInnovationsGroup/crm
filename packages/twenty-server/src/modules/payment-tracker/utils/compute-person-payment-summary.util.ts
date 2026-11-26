import { isDefined } from 'twenty-shared/utils';

import { type PaymentPlan } from 'src/modules/payment-tracker/types/payment-plan.type';
import { type PaymentStatus } from 'src/modules/payment-tracker/types/payment-status.type';

type SummaryPayment = {
  amountMicros: number;
  refundedAmountMicros: number;
  lostToDisputeMicros?: number;
  currencyCode: string;
  paidAt: Date;
};

const getKeptAmountMicros = (payment: SummaryPayment) =>
  Math.max(
    payment.amountMicros -
      payment.refundedAmountMicros -
      (payment.lostToDisputeMicros ?? 0),
    0,
  );

export type PersonPaymentSummary = {
  paidAmountMicros: number;
  currencyCode: string | null;
  installmentCount: number;
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
  status: PaymentStatus;
};

// Payments in another currency than the agreement's are left out of the
// total rather than added at a guessed exchange rate.
export const computePersonPaymentSummary = ({
  plan,
  agreedAmount,
  payments,
}: {
  plan: PaymentPlan | null;
  agreedAmount: { amountMicros: number; currencyCode: string } | null;
  payments: SummaryPayment[];
}): PersonPaymentSummary => {
  const paidPayments = payments
    .filter((payment) => getKeptAmountMicros(payment) > 0)
    .sort((first, second) => first.paidAt.getTime() - second.paidAt.getTime());

  const currencyCode =
    agreedAmount?.currencyCode ??
    paidPayments[paidPayments.length - 1]?.currencyCode ??
    null;
  const countedPayments = paidPayments.filter(
    (payment) => payment.currencyCode === currencyCode,
  );
  const paidAmountMicros = countedPayments.reduce(
    (total, payment) => total + getKeptAmountMicros(payment),
    0,
  );

  const getStatus = (): PaymentStatus => {
    if (plan === 'FULL_SCHOLARSHIP') {
      return 'SCHOLARSHIP';
    }

    if (paidAmountMicros <= 0) {
      return 'NOT_PAID';
    }

    if (isDefined(agreedAmount) && agreedAmount.amountMicros > 0) {
      return paidAmountMicros >= agreedAmount.amountMicros
        ? 'PAID_IN_FULL'
        : 'PAYING_INSTALLMENTS';
    }

    return plan === 'FULL_ONE_TIME' ? 'PAID_IN_FULL' : 'PAYING_INSTALLMENTS';
  };

  return {
    paidAmountMicros,
    currencyCode,
    installmentCount: countedPayments.length,
    firstPaidAt: countedPayments[0]?.paidAt ?? null,
    lastPaidAt: countedPayments[countedPayments.length - 1]?.paidAt ?? null,
    status: getStatus(),
  };
};
