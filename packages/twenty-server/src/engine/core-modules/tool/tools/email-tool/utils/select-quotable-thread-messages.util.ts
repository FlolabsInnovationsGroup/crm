import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type QuotedThreadMessage } from 'src/engine/core-modules/tool/tools/email-tool/types/quoted-thread-history.type';

export const MAX_QUOTED_THREAD_MESSAGES = 20;

type ThreadMessage = {
  id: string;
  text: string | null;
  receivedAt: Date | null;
  isDraft: boolean;
};

type ThreadMessageParticipant = {
  messageId: string;
  role: MessageParticipantRole;
  handle: string | null;
  displayName: string | null;
};

const normalizeHandle = (handle: string): string => handle.trim().toLowerCase();

// Only messages a recipient of the reply already took part in are quoted, so
// internal notes stored in the same thread never reach an applicant.
export const selectQuotableThreadMessages = ({
  messages,
  participants,
  recipientHandles,
}: {
  messages: ThreadMessage[];
  participants: ThreadMessageParticipant[];
  recipientHandles: string[];
}): QuotedThreadMessage[] => {
  const recipients = new Set(recipientHandles.map(normalizeHandle));

  const participantsByMessageId = new Map<string, ThreadMessageParticipant[]>();

  for (const participant of participants) {
    participantsByMessageId.set(participant.messageId, [
      ...(participantsByMessageId.get(participant.messageId) ?? []),
      participant,
    ]);
  }

  return messages
    .filter(
      (
        message,
      ): message is ThreadMessage & { text: string; receivedAt: Date } =>
        !message.isDraft &&
        isNonEmptyString(message.text?.trim()) &&
        isDefined(message.receivedAt),
    )
    .filter((message) =>
      (participantsByMessageId.get(message.id) ?? []).some(
        (participant) =>
          isNonEmptyString(participant.handle) &&
          recipients.has(normalizeHandle(participant.handle)),
      ),
    )
    .sort(
      (first, second) =>
        second.receivedAt.getTime() - first.receivedAt.getTime(),
    )
    .slice(0, MAX_QUOTED_THREAD_MESSAGES)
    .map((message) => {
      const sender = participantsByMessageId
        .get(message.id)
        ?.find(
          (participant) => participant.role === MessageParticipantRole.FROM,
        );

      return {
        senderName: sender?.displayName ?? null,
        senderHandle: sender?.handle ?? null,
        receivedAt: message.receivedAt,
        text: message.text,
      };
    });
};
