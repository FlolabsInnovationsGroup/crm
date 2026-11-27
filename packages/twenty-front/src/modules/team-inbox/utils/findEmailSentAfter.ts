import { isDefined } from 'twenty-shared/utils';

import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';

// Emails come newest first, so the newest one tells whether anything went out
// after the card arrived.
export const findEmailSentAfter = (
  sentEmails: EmailSentToApplicant[] | undefined,
  after: string,
): EmailSentToApplicant | null => {
  const latest = sentEmails?.[0];

  return isDefined(latest) &&
    new Date(latest.receivedAt).getTime() > new Date(after).getTime()
    ? latest
    : null;
};
