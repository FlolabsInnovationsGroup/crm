import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import chunk from 'lodash.chunk';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { Any, IsNull, MoreThan, Not } from 'typeorm';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  type MeetingCandidate,
  type MeetingRecalculationResult,
  type MeetingTrackerPersonRecord,
} from 'src/modules/meeting-tracker/types/meeting-tracker-record.type';
import { pickFirstMeeting } from 'src/modules/meeting-tracker/utils/pick-first-meeting.util';

type ParticipantRecord = {
  id: string;
  personId: string | null;
  calendarEventId: string;
  responseStatus: string | null;
};

type CalendarEventRecord = {
  id: string;
  startsAt: string | null;
  externalCreatedAt: string | null;
  createdAt: string;
  isCanceled: boolean;
  isFullDay: boolean;
};

const PAGE_SIZE = 500;

const toIsoOrNull = (date: Date | null | undefined) =>
  date?.toISOString() ?? null;

const isSameInstant = (stored: string | null, next: string | null) =>
  (stored === null ? null : new Date(stored).getTime()) ===
  (next === null ? null : new Date(next).getTime());

const onlyIds = (ids: (string | null)[]) =>
  [...new Set(ids)].filter((id): id is string => isDefined(id));

@Injectable()
export class MeetingTrackerService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async recalculatePeople(
    workspaceId: string,
    personIds: string[],
  ): Promise<MeetingRecalculationResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      let peopleChecked = 0;
      let peopleWithMeeting = 0;

      for (const batch of chunk(onlyIds(personIds), PAGE_SIZE)) {
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
            calendarEventId: Any(calendarEventIds),
            personId: Not(IsNull()),
          },
          select: { personId: true },
        });

        return participants.map((participant) => participant.personId);
      },
      buildSystemAuthContext(workspaceId),
    );

    await this.recalculatePeople(workspaceId, onlyIds(personIds));
  }

  // Calendar sync hard-deletes cancelled events and their guests cascade away,
  // so the people are found by the event their first meeting pointed at.
  async recalculatePeopleWhoseMeetingWasRemoved(
    workspaceId: string,
    calendarEventIds: string[],
  ): Promise<void> {
    const personIds = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const people = await this.getPersonRepository().find({
          where: { firstMeetingEventId: Any(calendarEventIds) },
          select: { id: true },
        });

        return people.map((person) => person.id);
      },
      buildSystemAuthContext(workspaceId),
    );

    await this.recalculatePeople(workspaceId, personIds);
  }

  // Everyone who is a guest somewhere, plus everyone who still shows a meeting
  // that may no longer exist.
  async recalculateEveryone(
    workspaceId: string,
  ): Promise<MeetingRecalculationResult> {
    const personIds = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const ids = new Set<string>();

        let participantCursor: string | undefined;

        for (;;) {
          const page = await this.getParticipantRepository().find({
            where: {
              personId: Not(IsNull()),
              isOrganizer: false,
              ...(isDefined(participantCursor)
                ? { id: MoreThan(participantCursor) }
                : {}),
            },
            order: { id: 'ASC' },
            take: PAGE_SIZE,
            select: { id: true, personId: true },
          });

          if (!isNonEmptyArray(page)) {
            break;
          }

          participantCursor = page[page.length - 1].id;
          onlyIds(page.map((participant) => participant.personId)).forEach(
            (id) => ids.add(id),
          );
        }

        let personCursor: string | undefined;

        for (;;) {
          const page = await this.getPersonRepository().find({
            where: {
              firstMeetingAt: Not(IsNull()),
              ...(isDefined(personCursor)
                ? { id: MoreThan(personCursor) }
                : {}),
            },
            order: { id: 'ASC' },
            take: PAGE_SIZE,
            select: { id: true },
          });

          if (!isNonEmptyArray(page)) {
            break;
          }

          personCursor = page[page.length - 1].id;
          page.forEach((person) => ids.add(person.id));
        }

        return [...ids];
      },
      buildSystemAuthContext(workspaceId),
    );

    return this.recalculatePeople(workspaceId, personIds);
  }

  private getPersonRepository() {
    return this.workspaceOrmManager.getRepository<MeetingTrackerPersonRecord>(
      'person',
      { shouldBypassPermissionChecks: true },
    );
  }

  private getParticipantRepository() {
    return this.workspaceOrmManager.getRepository<
      ParticipantRecord & {
        isOrganizer: boolean;
        workspaceMemberId: string | null;
      }
    >('calendarEventParticipant', { shouldBypassPermissionChecks: true });
  }

  // Must run inside a workspace context.
  private async recalculateBatch(
    personIds: string[],
  ): Promise<MeetingRecalculationResult> {
    const eventRepository =
      this.workspaceOrmManager.getRepository<CalendarEventRecord>(
        'calendarEvent',
        { shouldBypassPermissionChecks: true },
      );

    const [people, participants] = await Promise.all([
      this.getPersonRepository().find({
        where: { id: Any(personIds) },
        select: {
          id: true,
          applicationDate: true,
          firstMeetingAt: true,
          meetingBookedAt: true,
          daysToMeeting: true,
          firstMeetingEventId: true,
        },
      }),
      // The applicant is a guest; interviewers organise or are team members.
      this.getParticipantRepository().find({
        where: {
          personId: Any(personIds),
          isOrganizer: false,
          workspaceMemberId: IsNull(),
        },
        select: {
          id: true,
          personId: true,
          calendarEventId: true,
          responseStatus: true,
        },
      }),
    ]);

    const attended = participants.filter(
      (participant) => participant.responseStatus !== 'DECLINED',
    );
    const eventIds = onlyIds(
      attended.map((participant) => participant.calendarEventId),
    );
    const events = isNonEmptyArray(eventIds)
      ? await eventRepository.find({
          where: { id: Any(eventIds) },
          select: {
            id: true,
            startsAt: true,
            externalCreatedAt: true,
            createdAt: true,
            isCanceled: true,
            isFullDay: true,
          },
        })
      : [];
    const eventsById = new Map(events.map((event) => [event.id, event]));

    let peopleWithMeeting = 0;

    for (const person of people) {
      const meetings: MeetingCandidate[] = attended
        .filter((participant) => participant.personId === person.id)
        .map((participant) => eventsById.get(participant.calendarEventId))
        .filter((event): event is CalendarEventRecord => isDefined(event))
        .map((event) => ({
          eventId: event.id,
          startsAt: event.startsAt,
          bookedAt: isNonEmptyString(event.externalCreatedAt)
            ? event.externalCreatedAt
            : event.createdAt,
          isCanceled: event.isCanceled,
          isFullDay: event.isFullDay,
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
        firstMeetingEventId: firstMeeting?.eventId ?? null,
      };

      if (
        isSameInstant(person.firstMeetingAt, next.firstMeetingAt) &&
        isSameInstant(person.meetingBookedAt, next.meetingBookedAt) &&
        person.daysToMeeting === next.daysToMeeting &&
        person.firstMeetingEventId === next.firstMeetingEventId
      ) {
        continue;
      }

      await this.getPersonRepository().update(person.id, next);
    }

    return { peopleChecked: people.length, peopleWithMeeting };
  }
}
