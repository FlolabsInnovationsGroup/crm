// Stages the reminder workflows move a person to when a reminder goes out.
export const REMINDER_STAGES = [
  'REMINDER_1ST_IF_INTERESTED',
  'REMINDER_FROM_PAULA',
  'REMINDER_AFTER_CONTACTED',
  'SECOND_REMINDER_CONTACTED',
  'REMINDER_BEFORE_MEETING',
  'OPT_2ND_REMINDER_BEFORE_MEETING',
];

// The reminder email and the stage change land minutes apart, in either order,
// and the timeline can date a change up to 10 minutes early.
export const REMINDER_SEND_WINDOW_MS = 10 * 60 * 1000;
export const REMINDER_EMAIL_AFTER_WINDOW_MS = 20 * 60 * 1000;

export const MAX_REMINDED_AFTER_REPLY_DAYS = 90;
