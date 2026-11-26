import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { type QuotedThreadMessage } from 'src/engine/core-modules/tool/tools/email-tool/types/quoted-thread-history.type';
import { normalizeEmailHandle } from 'src/engine/core-modules/tool/tools/email-tool/utils/normalize-email-handle.util';

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

// A message is quoted only when every outside recipient of the reply (to, cc
// and bcc) already took part in it, so no one is shown mail they never got.
export const selectQuotableThreadMessages = ({
  messages,
  participants,
  externalRecipientHandles,
}: {
  messages: ThreadMessage[];
  participants: ThreadMessageParticipant[];
  externalRecipientHandles: string[];
}): QuotedThreadMessage[] => {
  const recipients = [
    ...new Set(externalRecipientHandles.map(normalizeEmailHandle)),
  ];

  if (!isNonEmptyArray(recipients)) {
    return [];
  }

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
    .filter((message) => {
      const messageHandles = new Set(
        (participantsByMessageId.get(message.id) ?? [])
          .map((participant) => participant.handle)
          .filter(isNonEmptyString)
          .map(normalizeEmailHandle),
      );

      return recipients.every((recipient) => messageHandles.has(recipient));
    })
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
