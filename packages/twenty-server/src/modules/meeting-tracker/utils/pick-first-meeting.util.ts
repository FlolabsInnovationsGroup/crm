import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  type FirstMeeting,
  type MeetingCandidate,
  type StoredDate,
} from 'src/modules/meeting-tracker/types/meeting-tracker-record.type';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value: StoredDate): Date | null => {
  if (!(value instanceof Date) && !isNonEmptyString(value)) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfUtcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

// Meetings before the application date belong to an earlier application, so
// only the first one on or after that day counts. All-day events are
// reminders or holidays, never an interview.
export const pickFirstMeeting = ({
  applicationDate,
  meetings,
}: {
  applicationDate: StoredDate;
  meetings: MeetingCandidate[];
}): FirstMeeting | null => {
  const appliedAt = toDate(applicationDate);

  if (!isDefined(appliedAt)) {
    return null;
  }

  const appliedDay = startOfUtcDay(appliedAt);

  const firstMeeting = meetings
    .filter((meeting) => !meeting.isCanceled && !meeting.isFullDay)
    .map((meeting) => ({
      eventId: meeting.eventId,
      meetingAt: toDate(meeting.startsAt),
      bookedAt: toDate(meeting.bookedAt),
    }))
    .filter(
      (
        meeting,
      ): meeting is {
        eventId: string;
        meetingAt: Date;
        bookedAt: Date | null;
      } =>
        isDefined(meeting.meetingAt) &&
        startOfUtcDay(meeting.meetingAt) >= appliedDay,
    )
    .sort(
      (first, second) => first.meetingAt.getTime() - second.meetingAt.getTime(),
    )[0];

  if (!isDefined(firstMeeting)) {
    return null;
  }

  const daysToBooking = isDefined(firstMeeting.bookedAt)
    ? Math.round((startOfUtcDay(firstMeeting.bookedAt) - appliedDay) / DAY_MS)
    : null;

  return {
    ...firstMeeting,
    daysToMeeting: Math.round(
      (startOfUtcDay(firstMeeting.meetingAt) - appliedDay) / DAY_MS,
    ),
    // Before the application it is an earlier booking; after the meeting it is
    // when the CRM first saw an event with no booking time of its own.
    daysToBooking:
      isDefined(daysToBooking) &&
      daysToBooking >= 0 &&
      isDefined(firstMeeting.bookedAt) &&
      firstMeeting.bookedAt <= firstMeeting.meetingAt
        ? daysToBooking
        : null,
  };
};
