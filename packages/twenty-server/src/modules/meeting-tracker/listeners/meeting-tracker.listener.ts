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
  getCalendarEventIdsWithChangedTiming,
  getPersonIdsFromParticipantEvents,
  getPersonIdsWithChangedApplicationDate,
} from 'src/modules/meeting-tracker/utils/get-person-ids-from-meeting-events.util';

type ParticipantEventRecord = { personId?: string | null };

// Calendar sync links a guest to a person after the event is saved, moves
// rescheduled events and hard-deletes cancelled ones, so each of these can
// change someone's first meeting.
@Injectable()
export class MeetingTrackerListener {
  constructor(private readonly meetingTrackerService: MeetingTrackerService) {}

  private isTrackedWorkspace(workspaceId: string) {
    return getMeetingTrackerWorkspaceId() === workspaceId;
  }

  private async recalculatePeople(workspaceId: string, personIds: string[]) {
    if (!this.isTrackedWorkspace(workspaceId) || !isNonEmptyArray(personIds)) {
      return;
    }

    await this.meetingTrackerService.recalculatePeople(workspaceId, personIds);
  }

  @OnDatabaseBatchEvent('calendarEventParticipant', DatabaseEventAction.CREATED)
  async handleParticipantCreated(
    payload: WorkspaceEventBatch<
      ObjectRecordCreateEvent<ParticipantEventRecord>
    >,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendarEventParticipant', DatabaseEventAction.UPDATED)
  async handleParticipantUpdated(
    payload: WorkspaceEventBatch<
      ObjectRecordUpdateEvent<ParticipantEventRecord>
    >,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendarEventParticipant', DatabaseEventAction.DELETED)
  async handleParticipantDeleted(
    payload: WorkspaceEventBatch<
      ObjectRecordDeleteEvent<ParticipantEventRecord>
    >,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent(
    'calendarEventParticipant',
    DatabaseEventAction.DESTROYED,
  )
  async handleParticipantDestroyed(
    payload: WorkspaceEventBatch<
      ObjectRecordDestroyEvent<ParticipantEventRecord>
    >,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent(
    'calendarEventParticipant',
    DatabaseEventAction.RESTORED,
  )
  async handleParticipantRestored(
    payload: WorkspaceEventBatch<
      ObjectRecordRestoreEvent<ParticipantEventRecord>
    >,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsFromParticipantEvents(payload.events),
    );
  }

  @OnDatabaseBatchEvent('calendarEvent', DatabaseEventAction.UPDATED)
  async handleCalendarEventUpdated(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent<object>>,
  ) {
    const calendarEventIds = getCalendarEventIdsWithChangedTiming(
      payload.events,
    );

    if (
      !this.isTrackedWorkspace(payload.workspaceId) ||
      !isNonEmptyArray(calendarEventIds)
    ) {
      return;
    }

    await this.meetingTrackerService.recalculateParticipantsOfEvents(
      payload.workspaceId,
      calendarEventIds,
    );
  }

  @OnDatabaseBatchEvent('calendarEvent', DatabaseEventAction.DELETED)
  async handleCalendarEventDeleted(
    payload: WorkspaceEventBatch<ObjectRecordDeleteEvent<object>>,
  ) {
    await this.recalculatePeopleWhoseMeetingWasRemoved(payload);
  }

  @OnDatabaseBatchEvent('calendarEvent', DatabaseEventAction.DESTROYED)
  async handleCalendarEventDestroyed(
    payload: WorkspaceEventBatch<ObjectRecordDestroyEvent<object>>,
  ) {
    await this.recalculatePeopleWhoseMeetingWasRemoved(payload);
  }

  private async recalculatePeopleWhoseMeetingWasRemoved(
    payload: WorkspaceEventBatch<{ recordId: string }>,
  ) {
    const calendarEventIds = payload.events.map(({ recordId }) => recordId);

    if (
      !this.isTrackedWorkspace(payload.workspaceId) ||
      !isNonEmptyArray(calendarEventIds)
    ) {
      return;
    }

    await this.meetingTrackerService.recalculatePeopleWhoseMeetingWasRemoved(
      payload.workspaceId,
      calendarEventIds,
    );
  }

  @OnDatabaseBatchEvent('person', DatabaseEventAction.UPDATED)
  async handlePersonUpdated(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent<object>>,
  ) {
    await this.recalculatePeople(
      payload.workspaceId,
      getPersonIdsWithChangedApplicationDate(payload.events),
    );
  }
}
