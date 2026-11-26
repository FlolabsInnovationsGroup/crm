import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
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

export type RecordPaymentResult = { isNew: boolean; personId: string | null };

@Injectable()
export class PaymentTrackerService {
  private readonly logger = new Logger(PaymentTrackerService.name);

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
      });

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
        personId,
      };

      if (isDefined(existing)) {
        await paymentRepository.update(existing.id, values);
      } else {
        await paymentRepository.insert(values);
      }

      if (isDefined(personId)) {
        await this.recalculatePeople([personId]);
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
      .andWhere('person.deletedAt IS NULL')
      .orderBy('person.createdAt', 'ASC')
      .getMany()) as { id: string }[];

    return matchingPeople[0]?.id ?? null;
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
        select: { id: true, paymentPlan: true, paymentAgreedAmount: true },
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
            currencyCode: payment.amount?.currencyCode ?? '',
            paidAt: new Date(payment.paidAt ?? 0),
          })),
      });

      const currencyCode = summary.currencyCode;

      await personRepository.update(person.id, {
        paymentStatus: summary.status,
        paymentPaidAmount: isDefined(currencyCode)
          ? { amountMicros: summary.paidAmountMicros, currencyCode }
          : null,
        paymentRemainingAmount:
          isDefined(agreedAmount) && agreedAmount.currencyCode === currencyCode
            ? {
                amountMicros: Math.max(
                  agreedAmount.amountMicros - summary.paidAmountMicros,
                  0,
                ),
                currencyCode,
              }
            : null,
        paymentInstallmentCount: summary.installmentCount,
        paymentFirstPaidAt: summary.firstPaidAt?.toISOString() ?? null,
        paymentLastPaidAt: summary.lastPaidAt?.toISOString() ?? null,
      });
    }

    this.logger.log(`Recalculated payments for ${people.length} people`);
  }
}
