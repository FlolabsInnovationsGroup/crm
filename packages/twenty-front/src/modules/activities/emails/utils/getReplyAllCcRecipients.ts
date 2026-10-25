import { isNonEmptyString } from '@sniptt/guards';

import { formatEmailRecipient } from '@/activities/emails/recipients/utils/formatEmailRecipient';
import { parseEmailRecipients } from '@/activities/emails/recipients/utils/parseEmailRecipients';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';
import { MessageParticipantRole } from 'twenty-shared/types';

export const getReplyAllCcRecipients = ({
  message,
  connectedAccountHandle,
  replyToRecipients,
}: {
  message: EmailThreadMessageWithSender;
  connectedAccountHandle: string | null | undefined;
  replyToRecipients: string;
}): string => {
  const excludedHandles = new Set(
    parseEmailRecipients(replyToRecipients).map((recipient) =>
      recipient.address.toLowerCase(),
    ),
  );

  if (isNonEmptyString(connectedAccountHandle)) {
    excludedHandles.add(connectedAccountHandle.toLowerCase());
  }

  return message.messageParticipants
    .filter(
      (participant) =>
        participant.role === MessageParticipantRole.TO ||
        participant.role === MessageParticipantRole.CC,
    )
    .filter((participant) => isNonEmptyString(participant.handle))
    .filter((participant) => {
      const normalizedHandle = participant.handle.toLowerCase();

      if (excludedHandles.has(normalizedHandle)) {
        return false;
      }

      excludedHandles.add(normalizedHandle);

      return true;
    })
    .map((participant) =>
      formatEmailRecipient({
        address: participant.handle,
        displayName: participant.displayName,
      }),
    )
    .join(', ');
};
