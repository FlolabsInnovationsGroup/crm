import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type ReplyContext } from '@/activities/emails/types/ReplyContext';
import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';

// The target's own thread gives the mailbox and recipients; the reply then
// answers the target itself, so it threads under that message.
export const buildApplicantHistoryReplyContext = (
  threadReplyContext: ReplyContext | null,
  target: ApplicantEmailHistoryMessage | null,
): ReplyContext | null => {
  if (
    !isDefined(target) ||
    !isDefined(threadReplyContext) ||
    threadReplyContext.loading
  ) {
    return threadReplyContext;
  }

  const subject = target.subject?.trim() ?? '';

  return {
    ...threadReplyContext,
    inReplyTo: isNonEmptyString(target.headerMessageId)
      ? target.headerMessageId
      : threadReplyContext.inReplyTo,
    subject: !isNonEmptyString(subject)
      ? threadReplyContext.subject
      : /^re:/i.test(subject)
        ? subject
        : // oxlint-disable-next-line lingui/no-unlocalized-strings -- Re: is the standard email reply prefix used for threading.
          `Re: ${subject}`,
  };
};
