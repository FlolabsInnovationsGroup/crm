import { MANUAL_REVIEW_SUBJECT_PREFIXES } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';
import { type Message } from 'src/modules/messaging/message-import-manager/types/message.type';
import { hasSubjectPrefix } from 'src/modules/messaging/message-import-manager/utils/has-subject-prefix.util';

export const isManualReviewMessage = (message: Pick<Message, 'subject'>) =>
  hasSubjectPrefix(message.subject, MANUAL_REVIEW_SUBJECT_PREFIXES);
