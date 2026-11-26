import { isNonEmptyString, isString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { getManualReviewDoneKey } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

const MANUAL_REVIEW_DONE_BY_KEY_PREFIX = 'TEAM_INBOX_MANUAL_REVIEW_DONE_BY:';

export const getManualReviewDoneByKey = (messageThreadId: string) =>
  `${MANUAL_REVIEW_DONE_BY_KEY_PREFIX}${messageThreadId}`;

export const getManualReviewDoneState = (
  workspaceVars: Map<string, unknown>,
  messageThreadId: string,
): { doneAt: Date | null; doneByWorkspaceMemberId: string | null } => {
  const doneAt = workspaceVars.get(getManualReviewDoneKey(messageThreadId));
  const doneBy = workspaceVars.get(getManualReviewDoneByKey(messageThreadId));

  return {
    // Items marked done before the time was stored hold `true`.
    doneAt: isString(doneAt) ? new Date(doneAt) : null,
    doneByWorkspaceMemberId: isNonEmptyString(doneBy) ? doneBy : null,
  };
};

type CandidateReplyParticipant = {
  role: MessageParticipantRole;
  handle: string | null;
};

export type CandidateReplyMessage = {
  id: string;
  text: string | null;
  receivedAt: Date | null;
  participants: CandidateReplyParticipant[];
};

const normalizeHandle = (handle: string) => handle.trim().toLowerCase();

// The first email one of our mailboxes sent to the applicant once the review
// item arrived is taken as the answer to it.
export const pickManualReviewReply = ({
  messages,
  applicantEmail,
  ownHandles,
  reviewReceivedAt,
}: {
  messages: CandidateReplyMessage[];
  applicantEmail: string;
  ownHandles: string[];
  reviewReceivedAt: Date;
}): CandidateReplyMessage | null => {
  const applicant = normalizeHandle(applicantEmail);
  const ours = new Set(ownHandles.map(normalizeHandle));

  const hasParticipant = (
    message: CandidateReplyMessage,
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
        (message): message is CandidateReplyMessage & { receivedAt: Date } =>
          isDefined(message.receivedAt) &&
          message.receivedAt.getTime() >= reviewReceivedAt.getTime(),
      )
      .filter(
        (message) =>
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
          first.receivedAt.getTime() - second.receivedAt.getTime(),
      )[0] ?? null
  );
};
