import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  type FirstMeeting,
  type MeetingCandidate,
} from 'src/modules/meeting-tracker/types/meeting-tracker-record.type';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value: string | null): Date | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfUtcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

// Meetings before the application date belong to an earlier application, so
// only the first one on or after that day counts.
export const pickFirstMeeting = ({
  applicationDate,
  meetings,
}: {
  applicationDate: string | null;
  meetings: MeetingCandidate[];
}): FirstMeeting | null => {
  const appliedAt = toDate(applicationDate);

  if (!isDefined(appliedAt)) {
    return null;
  }

  const appliedDay = startOfUtcDay(appliedAt);

  const firstMeeting = meetings
    .filter((meeting) => !meeting.isCanceled)
    .map((meeting) => ({
      meetingAt: toDate(meeting.startsAt),
      bookedAt: toDate(meeting.bookedAt),
    }))
    .filter(
      (meeting): meeting is { meetingAt: Date; bookedAt: Date | null } =>
        isDefined(meeting.meetingAt) &&
        startOfUtcDay(meeting.meetingAt) >= appliedDay,
    )
    .sort(
      (first, second) => first.meetingAt.getTime() - second.meetingAt.getTime(),
    )[0];

  if (!isDefined(firstMeeting)) {
    return null;
  }

  return {
    ...firstMeeting,
    daysToMeeting: Math.round(
      (startOfUtcDay(firstMeeting.meetingAt) - appliedDay) / DAY_MS,
    ),
  };
};
