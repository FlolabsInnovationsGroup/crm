// The n8n reply-triage workflow emails hr@ with this subject prefix when an
// applicant's reply needs a person to answer it.
export const MANUAL_REVIEW_SUBJECT_PREFIX = '[Reply triage]';

// One key per thread, so two teammates marking items done at the same time
// never overwrite each other.
const MANUAL_REVIEW_DONE_KEY_PREFIX = 'TEAM_INBOX_MANUAL_REVIEW_DONE:';

export const getManualReviewDoneKey = (messageThreadId: string) =>
  `${MANUAL_REVIEW_DONE_KEY_PREFIX}${messageThreadId}`;

export const getManualReviewDoneThreadIds = (keys: Iterable<string>) =>
  [...keys]
    .filter((key) => key.startsWith(MANUAL_REVIEW_DONE_KEY_PREFIX))
    .map((key) => key.slice(MANUAL_REVIEW_DONE_KEY_PREFIX.length));
