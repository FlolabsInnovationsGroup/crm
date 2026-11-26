// The fields setup-meeting-tracker.mjs adds to person, plus the existing
// application date.
export type MeetingTrackerPersonRecord = {
  id: string;
  applicationDate: string | null;
  firstMeetingAt: string | null;
  meetingBookedAt: string | null;
  daysToMeeting: number | null;
};

export type MeetingCandidate = {
  startsAt: string | null;
  bookedAt: string | null;
  isCanceled: boolean;
};

export type FirstMeeting = {
  meetingAt: Date;
  bookedAt: Date | null;
  daysToMeeting: number;
};
