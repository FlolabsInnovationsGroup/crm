import { isNonEmptyString } from '@sniptt/guards';

import { TEAM_INBOX_SYSTEM_SUBJECT_PREFIX } from 'src/engine/core-modules/messaging/utils/team-inbox-system.util';
import { type Message } from 'src/modules/messaging/message-import-manager/types/message.type';

// Case-insensitive to match the ILIKE the System tab query uses.
export const isTeamInboxSystemMessage = (message: Pick<Message, 'subject'>) =>
  isNonEmptyString(message.subject) &&
  message.subject
    .toLowerCase()
    .startsWith(TEAM_INBOX_SYSTEM_SUBJECT_PREFIX.toLowerCase());
