// Stages the reminder workflows move a person to when a reminder goes out.
export const REMINDER_STAGES = [
  'REMINDER_1ST_IF_INTERESTED',
  'REMINDER_FROM_PAULA',
  'REMINDER_AFTER_CONTACTED',
  'SECOND_REMINDER_CONTACTED',
  'REMINDER_BEFORE_MEETING',
  'OPT_2ND_REMINDER_BEFORE_MEETING',
];

// The reminder email and the stage change land a few minutes apart, so an
// email of ours inside this window before the stage change is the reminder.
export const REMINDER_SEND_WINDOW_MS = 10 * 60 * 1000;

export const MAX_REMINDED_AFTER_REPLY_DAYS = 90;
