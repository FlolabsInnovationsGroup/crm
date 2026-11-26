import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type ActorMetadata, FieldActorSource } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import {
  type PersonPaymentRecord,
  type StripePaymentRecord,
} from 'src/modules/payment-tracker/types/payment-record.type';
import { type PaymentPlan } from 'src/modules/payment-tracker/types/payment-plan.type';
import { type RecordPaymentResult } from 'src/modules/payment-tracker/types/record-payment-result.type';
import { type RecordedPayment } from 'src/modules/payment-tracker/types/recorded-payment.type';
import { computePersonPaymentSummary } from 'src/modules/payment-tracker/utils/compute-person-payment-summary.util';
import { formatPaymentName } from 'src/modules/payment-tracker/utils/format-payment-name.util';

const PAYMENT_PLANS: PaymentPlan[] = [
  'FULL_ONE_TIME',
  'SCHOLARSHIP_MONTHLY_FEE',
  'FULL_SCHOLARSHIP',
  'CUSTOM',
];

const toPaymentPlan = (value: string | null): PaymentPlan | null =>
  PAYMENT_PLANS.find((plan) => plan === value) ?? null;

// Writing null to a currency field leaves the old value, so it is cleared
// with an empty amount instead.
const EMPTY_CURRENCY_VALUE = { amountMicros: null, currencyCode: '' };

const STRIPE_ACTOR: ActorMetadata = {
  source: FieldActorSource.SYSTEM,
  workspaceMemberId: null,
  name: 'Stripe',
  context: {},
};

const toCurrencyValue = (amountMicros: number, currencyCode: string | null) =>
  isDefined(currencyCode)
    ? { amountMicros, currencyCode }
    : EMPTY_CURRENCY_VALUE;

@Injectable()
export class PaymentTrackerService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async recordPayment(
    workspaceId: string,
    payment: RecordedPayment,
  ): Promise<RecordPaymentResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const paymentRepository =
        this.workspaceOrmManager.getRepository<StripePaymentRecord>(
          'stripePayment',
          { shouldBypassPermissionChecks: true },
        );

      const existing = await paymentRepository.findOne({
        where: { stripePaymentIntentId: payment.stripePaymentIntentId },
        withDeleted: true,
      });

      // Someone deleted this payment on purpose; a later event must not bring it back.
      if (isDefined(existing?.deletedAt)) {
        return { isNew: false, personId: existing.personId };
      }

      // A payment someone linked by hand keeps that person.
      const personId =
        existing?.personId ??
        (await this.findPersonIdByEmail(payment.payerEmail));

      const values = {
        name: formatPaymentName(payment),
        stripePaymentIntentId: payment.stripePaymentIntentId,
        amount: {
          amountMicros: payment.amountMicros,
          currencyCode: payment.currencyCode,
        },
        refundedAmount: {
          amountMicros: payment.refundedAmountMicros,
          currencyCode: payment.currencyCode,
        },
        paidAt: payment.paidAt.toISOString(),
        paymentStatus: payment.status,
        payerEmail: payment.payerEmail,
        stripeCustomerId: payment.stripeCustomerId,
        description: payment.description,
        disputeStatus: payment.dispute?.status ?? null,
        disputedAmount: isDefined(payment.dispute)
          ? {
              amountMicros: payment.dispute.amountMicros,
              currencyCode: payment.currencyCode,
            }
          : EMPTY_CURRENCY_VALUE,
        personId,
      };

      if (isDefined(existing)) {
        await paymentRepository.update(existing.id, values);
      } else {
        // Actor name columns are NOT NULL with no DB default; the API layer
        // normally fills them, direct repository writes do not.
        await paymentRepository.insert({
          ...values,
          createdBy: STRIPE_ACTOR,
          updatedBy: STRIPE_ACTOR,
        });
      }

      return { isNew: !isDefined(existing), personId };
    }, buildSystemAuthContext(workspaceId));
  }

  async recalculatePeopleInWorkspace(
    workspaceId: string,
    personIds: string[],
  ): Promise<void> {
    await this.workspaceOrmManager.executeInWorkspaceContext(
      () => this.recalculatePeople(personIds),
      buildSystemAuthContext(workspaceId),
    );
  }

  private async findPersonIdByEmail(
    email: string | null,
  ): Promise<string | null> {
    if (!isNonEmptyString(email)) {
      return null;
    }

    const personRepository = this.workspaceOrmManager.getRepository('person', {
      shouldBypassPermissionChecks: true,
    });

    const matchingPeople = (await addPersonEmailFiltersToQueryBuilder({
      queryBuilder: personRepository.createQueryBuilder('person'),
      emails: [email.trim().toLowerCase()],
    })
      .orderBy('person.createdAt', 'ASC')
      .getMany()) as { id: string; deletedAt: string | null }[];

    // The email helper's OR clauses cannot take an extra AND, so deleted
    // people are dropped here; with several matches the oldest wins.
    return (
      matchingPeople.find((person) => !isDefined(person.deletedAt))?.id ?? null
    );
  }

  // Must run inside a workspace context.
  private async recalculatePeople(personIds: string[]): Promise<void> {
    const uniquePersonIds = [...new Set(personIds)];

    if (!isNonEmptyArray(uniquePersonIds)) {
      return;
    }

    const personRepository =
      this.workspaceOrmManager.getRepository<PersonPaymentRecord>('person', {
        shouldBypassPermissionChecks: true,
      });
    const paymentRepository =
      this.workspaceOrmManager.getRepository<StripePaymentRecord>(
        'stripePayment',
        { shouldBypassPermissionChecks: true },
      );

    const [people, payments] = await Promise.all([
      personRepository.find({
        where: { id: In(uniquePersonIds) },
      }),
      paymentRepository.find({
        where: { personId: In(uniquePersonIds) },
      }),
    ]);

    for (const person of people) {
      const agreedAmount =
        isDefined(person.paymentAgreedAmount?.amountMicros) &&
        isNonEmptyString(person.paymentAgreedAmount?.currencyCode)
          ? {
              amountMicros: Number(person.paymentAgreedAmount.amountMicros),
              currencyCode: person.paymentAgreedAmount.currencyCode,
            }
          : null;

      const summary = computePersonPaymentSummary({
        plan: toPaymentPlan(person.paymentPlan),
        agreedAmount,
        payments: payments
          .filter(
            (payment) =>
              payment.personId === person.id &&
              isDefined(payment.paidAt) &&
              isNonEmptyString(payment.amount?.currencyCode),
          )
          .map((payment) => ({
            amountMicros: Number(payment.amount?.amountMicros ?? 0),
            refundedAmountMicros: Number(
              payment.refundedAmount?.amountMicros ?? 0,
            ),
            lostToDisputeMicros:
              payment.disputeStatus === 'LOST'
                ? Number(payment.disputedAmount?.amountMicros ?? 0)
                : 0,
            currencyCode: payment.amount?.currencyCode ?? '',
            paidAt: new Date(payment.paidAt ?? 0),
          })),
      });

      const currencyCode = summary.currencyCode;
      const isScholarship = summary.status === 'SCHOLARSHIP';

      await personRepository.update(person.id, {
        paymentStatus: summary.status,
        paymentPaidAmount: toCurrencyValue(
          summary.paidAmountMicros,
          currencyCode,
        ),
        paymentRemainingAmount:
          isDefined(agreedAmount) &&
          agreedAmount.currencyCode === currencyCode &&
          !isScholarship
            ? toCurrencyValue(
                Math.max(
                  agreedAmount.amountMicros - summary.paidAmountMicros,
                  0,
                ),
                currencyCode,
              )
            : EMPTY_CURRENCY_VALUE,
        paymentInstallmentCount: summary.installmentCount,
        paymentFirstPaidAt: summary.firstPaidAt?.toISOString() ?? null,
        paymentLastPaidAt: summary.lastPaidAt?.toISOString() ?? null,
      });
    }
  }
}
