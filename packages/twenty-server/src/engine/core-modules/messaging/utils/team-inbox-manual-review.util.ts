import { isString } from '@sniptt/guards';
import { isValidUuid } from 'twenty-shared/utils';

// The n8n recruitment workflows email hr@ with these subject prefixes when a
// person has to act; Needs review lists them.
export const MANUAL_REVIEW_SUBJECT_PREFIXES = [
  '[Reply triage]',
  'APPROVAL NEEDED (Form 1)',
  'APPROVAL NEEDED (orientation)',
  '[Stuck applicant]',
  '[n8n] Recruitment automation needs attention',
  '[n8n] Email SENT but CRM not updated',
  '[n8n] CRM application not queued',
  '[n8n] CRM first email step failed',
];

// One key per thread, so two teammates marking items done at the same time
// never overwrite each other.
const MANUAL_REVIEW_DONE_KEY_PREFIX = 'TEAM_INBOX_MANUAL_REVIEW_DONE:';

export const getManualReviewDoneKey = (messageThreadId: string) =>
  `${MANUAL_REVIEW_DONE_KEY_PREFIX}${messageThreadId}`;

export const getManualReviewDoneThreadIds = (keys: Iterable<string>) =>
  [...keys]
    .filter((key) => key.startsWith(MANUAL_REVIEW_DONE_KEY_PREFIX))
    .map((key) => key.slice(MANUAL_REVIEW_DONE_KEY_PREFIX.length))
    // A malformed id would break the uuid[] cast in the review query.
    .filter(isValidUuid);

// Done entries hold the time they were marked done; older ones hold `true`.
export const getManualReviewDoneThreadIdsSince = (
  entries: Iterable<[string, unknown]>,
  since: Date,
) =>
  getManualReviewDoneThreadIds(
    [...entries]
      .filter(
        ([, doneAt]) =>
          isString(doneAt) && new Date(doneAt).getTime() >= since.getTime(),
      )
      .map(([key]) => key),
  );
