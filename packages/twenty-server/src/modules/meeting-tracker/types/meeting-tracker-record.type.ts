export type MeetingTrackerPersonRecord = {
  id: string;
  applicationDate: string | null;
  firstMeetingAt: string | null;
  meetingBookedAt: string | null;
  daysToMeeting: number | null;
  // A calendar event or Calendly booking id. Cancelled calendar events are
  // hard-deleted by sync, so this is the only way to find whose first meeting
  // just disappeared.
  firstMeetingEventId: string | null;
};

export type MeetingCandidate = {
  eventId: string;
  startsAt: string | null;
  bookedAt: string | null;
  isCanceled: boolean;
  isFullDay: boolean;
};

export type FirstMeeting = {
  eventId: string;
  meetingAt: Date;
  bookedAt: Date | null;
  daysToMeeting: number;
};

export type MeetingRecalculationResult = {
  peopleChecked: number;
  peopleWithMeeting: number;
};
