import { isNonEmptyString } from '@sniptt/guards';

import { MANUAL_REVIEW_SUBJECT_PREFIX } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message.type';

// Case-insensitive to match the ILIKE the Needs review query uses.
export const isReplyTriageMessage = (message: MessageWithParticipants) =>
  isNonEmptyString(message.subject) &&
  message.subject
    .toLowerCase()
    .startsWith(MANUAL_REVIEW_SUBJECT_PREFIX.toLowerCase());
