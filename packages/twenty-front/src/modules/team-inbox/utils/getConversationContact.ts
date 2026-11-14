import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type EmailThreadMessage } from '@/activities/emails/types/EmailThreadMessage';

export type ConversationContact = {
  personId: string | null;
  displayName: string;
};

const ROLE_PRIORITY = [
  MessageParticipantRole.FROM,
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
];

// The first outside sender, or the first outside recipient when only the
// team wrote. Team mailboxes are not always linked to a workspace member,
// so their handles are excluded too.
export const getConversationContact = (
  messages: Pick<EmailThreadMessage, 'messageParticipants'>[],
  ownHandles: string[],
): ConversationContact | null => {
  const ownHandleSet = new Set(
    ownHandles.map((handle) => handle.toLowerCase()),
  );
  const participants = messages.flatMap(
    (message) => message.messageParticipants ?? [],
  );

  for (const role of ROLE_PRIORITY) {
    const contact = participants.find(
      (participant) =>
        participant.role === role &&
        !isDefined(participant.workspaceMember) &&
        !ownHandleSet.has(participant.handle.toLowerCase()),
    );

    if (isDefined(contact)) {
      return {
        personId: contact.person?.id ?? null,
        displayName: contact.displayName || contact.handle,
      };
    }
  }

  return null;
};
