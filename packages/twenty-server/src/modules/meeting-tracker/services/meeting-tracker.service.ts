import { Injectable } from '@nestjs/common';

import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In, IsNull, Not } from 'typeorm';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  type MeetingCandidate,
  type MeetingTrackerPersonRecord,
} from 'src/modules/meeting-tracker/types/meeting-tracker-record.type';
import { pickFirstMeeting } from 'src/modules/meeting-tracker/utils/pick-first-meeting.util';

type ParticipantRecord = {
  personId: string | null;
  calendarEventId: string;
};

type CalendarEventRecord = {
  id: string;
  startsAt: string | null;
  externalCreatedAt: string | null;
  createdAt: string;
  isCanceled: boolean;
};

const BATCH_SIZE = 500;

const toBatches = <TItem>(items: TItem[]): TItem[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) =>
    items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );

const toIsoOrNull = (date: Date | null | undefined) =>
  date?.toISOString() ?? null;

const isSameInstant = (stored: string | null, next: string | null) =>
  (stored === null ? null : new Date(stored).getTime()) ===
  (next === null ? null : new Date(next).getTime());

@Injectable()
export class MeetingTrackerService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async recalculatePeople(
    workspaceId: string,
    personIds: string[],
  ): Promise<{ peopleChecked: number; peopleWithMeeting: number }> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      let peopleChecked = 0;
      let peopleWithMeeting = 0;

      for (const batch of toBatches([...new Set(personIds)])) {
        const result = await this.recalculateBatch(batch);

        peopleChecked += result.peopleChecked;
        peopleWithMeeting += result.peopleWithMeeting;
      }

      return { peopleChecked, peopleWithMeeting };
    }, buildSystemAuthContext(workspaceId));
  }

  async recalculateParticipantsOfEvents(
    workspaceId: string,
    calendarEventIds: string[],
  ): Promise<void> {
    const personIds = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const participants = await this.getParticipantRepository().find({
          where: {
            calendarEventId: In(calendarEventIds),
            personId: Not(IsNull()),
          },
        });

        return participants.map((participant) => participant.personId);
      },
      buildSystemAuthContext(workspaceId),
    );

    await this.recalculatePeople(
      workspaceId,
      personIds.filter((personId): personId is string => isDefined(personId)),
    );
  }

  async recalculateEveryone(
    workspaceId: string,
  ): Promise<{ peopleChecked: number; peopleWithMeeting: number }> {
    const personIds = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const participants = await this.getParticipantRepository().find({
          where: { personId: Not(IsNull()), isOrganizer: false },
        });

        return participants.map((participant) => participant.personId);
      },
      buildSystemAuthContext(workspaceId),
    );

    return this.recalculatePeople(
      workspaceId,
      personIds.filter((personId): personId is string => isDefined(personId)),
    );
  }

  private getParticipantRepository() {
    return this.workspaceOrmManager.getRepository<
      ParticipantRecord & { isOrganizer: boolean }
    >('calendarEventParticipant', { shouldBypassPermissionChecks: true });
  }

  // Must run inside a workspace context.
  private async recalculateBatch(personIds: string[]) {
    const personRepository =
      this.workspaceOrmManager.getRepository<MeetingTrackerPersonRecord>(
        'person',
        { shouldBypassPermissionChecks: true },
      );
    const eventRepository =
      this.workspaceOrmManager.getRepository<CalendarEventRecord>(
        'calendarEvent',
        { shouldBypassPermissionChecks: true },
      );

    const [people, participants] = await Promise.all([
      personRepository.find({ where: { id: In(personIds) } }),
      // Organizers are the interviewers; the applicant is a guest.
      this.getParticipantRepository().find({
        where: { personId: In(personIds), isOrganizer: false },
      }),
    ]);

    const eventIds = [
      ...new Set(
        participants.map((participant) => participant.calendarEventId),
      ),
    ];
    const events = isNonEmptyArray(eventIds)
      ? await eventRepository.find({ where: { id: In(eventIds) } })
      : [];
    const eventsById = new Map(events.map((event) => [event.id, event]));

    let peopleWithMeeting = 0;

    for (const person of people) {
      const meetings: MeetingCandidate[] = participants
        .filter((participant) => participant.personId === person.id)
        .map((participant) => eventsById.get(participant.calendarEventId))
        .filter((event): event is CalendarEventRecord => isDefined(event))
        .map((event) => ({
          startsAt: event.startsAt,
          bookedAt: event.externalCreatedAt ?? event.createdAt,
          isCanceled: event.isCanceled,
        }));

      const firstMeeting = pickFirstMeeting({
        applicationDate: person.applicationDate,
        meetings,
      });

      peopleWithMeeting += isDefined(firstMeeting) ? 1 : 0;

      const next = {
        firstMeetingAt: toIsoOrNull(firstMeeting?.meetingAt),
        meetingBookedAt: toIsoOrNull(firstMeeting?.bookedAt),
        daysToMeeting: firstMeeting?.daysToMeeting ?? null,
      };

      if (
        isSameInstant(person.firstMeetingAt, next.firstMeetingAt) &&
        isSameInstant(person.meetingBookedAt, next.meetingBookedAt) &&
        person.daysToMeeting === next.daysToMeeting
      ) {
        continue;
      }

      await personRepository.update(person.id, next);
    }

    return { peopleChecked: people.length, peopleWithMeeting };
  }
}
