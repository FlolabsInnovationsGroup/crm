import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { formatEmailRecipient } from '@/activities/emails/recipients/utils/formatEmailRecipient';
import { type ReplyContext } from '@/activities/emails/types/ReplyContext';
import {
  type ApplicantEmailHistoryMessage,
  type ApplicantEmailHistoryParticipant,
} from '@/team-inbox/types/ApplicantEmailHistoryMessage';

const formatRecipient = ({
  handle,
  displayName,
}: Pick<ApplicantEmailHistoryParticipant, 'handle' | 'displayName'>) =>
  formatEmailRecipient({
    address: handle,
    displayName: displayName ?? undefined,
  });

// The reply answers the target message itself, so its recipients come from
// that message, not from whatever was last sent in its thread (a forward to a
// colleague, say). Only the sending mailbox comes from the thread.
export const buildApplicantHistoryReplyContext = (
  threadReplyContext: ReplyContext | null,
  target: ApplicantEmailHistoryMessage | null,
  {
    applicantEmail,
    ownHandles,
  }: { applicantEmail: string; ownHandles: string[] },
): ReplyContext | null => {
  if (
    !isDefined(target) ||
    !isDefined(threadReplyContext) ||
    threadReplyContext.loading
  ) {
    return threadReplyContext;
  }

  const ownHandleSet = new Set(
    ownHandles.map((handle) => handle.trim().toLowerCase()),
  );
  const seenHandles = new Set<string>();
  const otherRecipients = target.recipients.filter(({ role, handle }) => {
    const normalizedHandle = handle.trim().toLowerCase();

    if (
      (role !== MessageParticipantRole.TO &&
        role !== MessageParticipantRole.CC) ||
      !isNonEmptyString(normalizedHandle) ||
      ownHandleSet.has(normalizedHandle) ||
      seenHandles.has(normalizedHandle)
    ) {
      return false;
    }

    seenHandles.add(normalizedHandle);

    return true;
  });

  const to = target.isFromApplicant
    ? isNonEmptyString(target.sender?.handle)
      ? formatRecipient(target.sender)
      : applicantEmail.trim()
    : otherRecipients.map(formatRecipient).join(', ');

  const subject = target.subject?.trim() ?? '';

  return {
    loading: false,
    to,
    replyAllCc: '',
    subject: /^re:/i.test(subject)
      ? subject
      : // oxlint-disable-next-line lingui/no-unlocalized-strings -- Re: is the standard email reply prefix used for threading.
        `Re: ${subject}`,
    inReplyTo: target.headerMessageId ?? '',
    connectedAccountId: threadReplyContext.connectedAccountId,
    connectedAccountProvider: threadReplyContext.connectedAccountProvider,
  };
};
