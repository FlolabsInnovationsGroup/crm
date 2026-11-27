// Postgres returns timestamps as Date objects; values written by the CRM or a
// test are ISO strings, so readers accept both.
export type StoredDate = string | Date | null;

export type MeetingTrackerPersonRecord = {
  id: string;
  applicationDate: StoredDate;
  firstMeetingAt: StoredDate;
  meetingBookedAt: StoredDate;
  daysToMeeting: number | null;
  daysToBooking: number | null;
  // A calendar event or Calendly booking id. Cancelled calendar events are
  // hard-deleted by sync, so this is the only way to find whose first meeting
  // just disappeared.
  firstMeetingEventId: string | null;
};

export type MeetingCandidate = {
  eventId: string;
  startsAt: StoredDate;
  bookedAt: StoredDate;
  isCanceled: boolean;
  isFullDay: boolean;
};

export type FirstMeeting = {
  eventId: string;
  meetingAt: Date;
  bookedAt: Date | null;
  daysToMeeting: number;
  daysToBooking: number | null;
};

export type MeetingRecalculationResult = {
  peopleChecked: number;
  peopleWithMeeting: number;
};
