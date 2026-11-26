import { Injectable } from '@nestjs/common';

import {
  type ObjectRecordCreateEvent,
  type ObjectRecordDeleteEvent,
  type ObjectRecordDestroyEvent,
  type ObjectRecordRestoreEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';
import { getMeetingTrackerWorkspaceId } from 'src/modules/meeting-tracker/utils/get-meeting-tracker-workspace-id.util';
import {
  getPersonIdsFromBookingEvents,
  getPersonIdsFromParticipantEvents,
} from 'src/modules/meeting-tracker/utils/get-person-ids-from-meeting-events.util';

type BookingEventRecord = { personId?: string | null };

// A booking saved from Calendly, linked to someone by hand, or deleted changes
// that person's first meeting.
@Injectable()
export class CalendlyBookingListener {
  constructor(private readonly meetingTrackerService: MeetingTrackerService) {}

  private async recalculatePeople(workspaceId: string, personIds: string[]) {
    if (
      getMeetingTrackerWorkspaceId() !== workspaceId ||
      !isNonEmptyArray(personIds)
    ) {
      return;
    }

    await this.meetingTrackerService.recalculatePeople(workspaceId, personIds);
  }

  @OnDatabaseBatchEvent('calendlyBooking', DatabaseEventAction.CREATED)
  async handleBookingCreated(
    payload: WorkspaceEventBatch<ObjectRecordCreateEvent<BookingEventRecord>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendlyBooking', DatabaseEventAction.UPDATED)
  async handleBookingUpdated(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent<BookingEventRecord>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromBookingEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendlyBooking', DatabaseEventAction.DELETED)
  async handleBookingDeleted(
    payload: WorkspaceEventBatch<ObjectRecordDeleteEvent<BookingEventRecord>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendlyBooking', DatabaseEventAction.DESTROYED)
  async handleBookingDestroyed(
    payload: WorkspaceEventBatch<ObjectRecordDestroyEvent<BookingEventRecord>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendlyBooking', DatabaseEventAction.RESTORED)
  async handleBookingRestored(
    payload: WorkspaceEventBatch<ObjectRecordRestoreEvent<BookingEventRecord>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }
}
