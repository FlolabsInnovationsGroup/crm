import { isNonEmptyString } from '@sniptt/guards';

import { EMAIL_SENT_EXCERPT_LENGTH } from 'src/engine/core-modules/messaging/constants/emails-sent-to-applicants.constants';

const QUOTED_HISTORY_START =
  /^(>|On .+wrote:\s*$|-{2,}\s*Original Message|From:\s)/im;

// Only the new part of the email, so the card shows what we said rather than
// the applicant's quoted message.
export const getEmailSentExcerpt = (text: string | null): string | null => {
  if (!isNonEmptyString(text)) {
    return null;
  }

  const quotedHistory = text.search(QUOTED_HISTORY_START);
  const newPart = (quotedHistory >= 0 ? text.slice(0, quotedHistory) : text)
    .replace(/\s+/g, ' ')
    .trim();

  if (!isNonEmptyString(newPart)) {
    return null;
  }

  return newPart.length > EMAIL_SENT_EXCERPT_LENGTH
    ? `${newPart.slice(0, EMAIL_SENT_EXCERPT_LENGTH - 1).trimEnd()}…`
    : newPart;
};
