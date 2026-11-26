import { isNonEmptyString, isString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';

import { getManualReviewDoneKey } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

const MANUAL_REVIEW_DONE_BY_KEY_PREFIX = 'TEAM_INBOX_MANUAL_REVIEW_DONE_BY:';

// People usually press Done right after sending, sometimes just before.
export const MANUAL_REVIEW_REPLY_GRACE_MS = 30 * 60 * 1000;

export const getManualReviewDoneByKey = (messageThreadId: string) =>
  `${MANUAL_REVIEW_DONE_BY_KEY_PREFIX}${messageThreadId}`;

export const getManualReviewDoneState = (
  workspaceVars: Map<string, unknown>,
  messageThreadId: string,
): { doneAt: Date | null; doneByWorkspaceMemberId: string | null } => {
  const doneAt = workspaceVars.get(getManualReviewDoneKey(messageThreadId));
  const doneBy = workspaceVars.get(getManualReviewDoneByKey(messageThreadId));

  return {
    doneAt: isString(doneAt) ? new Date(doneAt) : null,
    doneByWorkspaceMemberId: isNonEmptyString(doneBy) ? doneBy : null,
  };
};

export type CandidateReplyMessage = {
  id: string;
  receivedAt: Date;
  participants: { role: MessageParticipantRole; handle: string | null }[];
};

const normalizeHandle = (handle: string) => handle.trim().toLowerCase();

// The last email one of our mailboxes sent the applicant between the review
// email and the moment it was marked done is taken as the answer, so an
// automated reminder sent earlier does not count.
export const pickManualReviewReply = <TMessage extends CandidateReplyMessage>({
  messages,
  applicantEmail,
  ownHandles,
  reviewReceivedAt,
  doneAt,
}: {
  messages: TMessage[];
  applicantEmail: string;
  ownHandles: string[];
  reviewReceivedAt: Date;
  doneAt: Date;
}): TMessage | null => {
  const applicant = normalizeHandle(applicantEmail);
  const ours = new Set(ownHandles.map(normalizeHandle));
  const windowEnd = doneAt.getTime() + MANUAL_REVIEW_REPLY_GRACE_MS;

  const hasParticipant = (
    message: TMessage,
    roles: MessageParticipantRole[],
    matches: (handle: string) => boolean,
  ) =>
    message.participants.some(
      (participant) =>
        roles.includes(participant.role) &&
        isNonEmptyString(participant.handle) &&
        matches(normalizeHandle(participant.handle)),
    );

  return (
    messages
      .filter(
        (message) =>
          message.receivedAt.getTime() >= reviewReceivedAt.getTime() &&
          message.receivedAt.getTime() <= windowEnd &&
          hasParticipant(message, [MessageParticipantRole.FROM], (handle) =>
            ours.has(handle),
          ) &&
          hasParticipant(
            message,
            [MessageParticipantRole.TO, MessageParticipantRole.CC],
            (handle) => handle === applicant,
          ),
      )
      .sort(
        (first, second) =>
          second.receivedAt.getTime() - first.receivedAt.getTime(),
      )[0] ?? null
  );
};
