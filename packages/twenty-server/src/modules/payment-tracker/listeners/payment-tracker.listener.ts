import { Injectable } from '@nestjs/common';

import {
  type ObjectRecordCreateEvent,
  type ObjectRecordDeleteEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { PaymentTrackerService } from 'src/modules/payment-tracker/services/payment-tracker.service';
import { type StripePaymentRecord } from 'src/modules/payment-tracker/types/payment-record.type';
import {
  getPersonIdsAffectedByPaymentEvents,
  getPersonIdsWithChangedAgreement,
} from 'src/modules/payment-tracker/utils/get-person-ids-to-recalculate.util';
import { getPaymentTrackerConfig } from 'src/modules/payment-tracker/utils/get-payment-tracker-config.util';

// Keeps paid, remaining and status right when someone links a payment by
// hand or changes a person's plan or agreed amount.
@Injectable()
export class PaymentTrackerListener {
  constructor(private readonly paymentTrackerService: PaymentTrackerService) {}

  private async recalculate(workspaceId: string, personIds: string[]) {
    if (
      getPaymentTrackerConfig()?.workspaceId !== workspaceId ||
      !isNonEmptyArray(personIds)
    ) {
      return;
    }

    await this.paymentTrackerService.recalculatePeopleInWorkspace(
      workspaceId,
      personIds,
    );
  }

  @OnDatabaseBatchEvent('stripePayment', DatabaseEventAction.CREATED)
  async handlePaymentCreated(
    payload: WorkspaceEventBatch<ObjectRecordCreateEvent<StripePaymentRecord>>,
  ) {
    await this.recalculate(
      payload.workspaceId,
      getPersonIdsAffectedByPaymentEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('stripePayment', DatabaseEventAction.UPDATED)
  async handlePaymentUpdated(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent<StripePaymentRecord>>,
  ) {
    await this.recalculate(
      payload.workspaceId,
      getPersonIdsAffectedByPaymentEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('stripePayment', DatabaseEventAction.DELETED)
  async handlePaymentDeleted(
    payload: WorkspaceEventBatch<ObjectRecordDeleteEvent<StripePaymentRecord>>,
  ) {
    await this.recalculate(
      payload.workspaceId,
      getPersonIdsAffectedByPaymentEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('person', DatabaseEventAction.UPDATED)
  async handlePersonUpdated(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent<object>>,
  ) {
    await this.recalculate(
      payload.workspaceId,
      getPersonIdsWithChangedAgreement(payload.events),
    );
  }
}
