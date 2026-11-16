import { isNonEmptyString } from '@sniptt/guards';

import { MANUAL_REVIEW_SUBJECT_PREFIXES } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';
import { type Message } from 'src/modules/messaging/message-import-manager/types/message.type';

// Case-insensitive to match the ILIKE the Needs review query uses.
export const isManualReviewMessage = (message: Pick<Message, 'subject'>) => {
  if (!isNonEmptyString(message.subject)) {
    return false;
  }

  const subject = message.subject.toLowerCase();

  return MANUAL_REVIEW_SUBJECT_PREFIXES.some((prefix) =>
    subject.startsWith(prefix.toLowerCase()),
  );
};
