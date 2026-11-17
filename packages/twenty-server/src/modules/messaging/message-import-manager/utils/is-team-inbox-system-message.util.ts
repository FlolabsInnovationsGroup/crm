import { TEAM_INBOX_SYSTEM_SUBJECT_PREFIX } from 'src/engine/core-modules/messaging/utils/team-inbox-system.util';
import { type Message } from 'src/modules/messaging/message-import-manager/types/message.type';
import { hasSubjectPrefix } from 'src/modules/messaging/message-import-manager/utils/has-subject-prefix.util';

export const isTeamInboxSystemMessage = (message: Pick<Message, 'subject'>) =>
  hasSubjectPrefix(message.subject, [TEAM_INBOX_SYSTEM_SUBJECT_PREFIX]);
