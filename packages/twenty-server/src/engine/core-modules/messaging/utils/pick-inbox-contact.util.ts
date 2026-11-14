import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

type InboxParticipant = {
  handle: string | null;
  displayName: string | null;
  role: MessageParticipantRole;
  receivedAt: Date | null;
  personId: string | null;
};

export type InboxContact = { name: string; personId: string | null };

const ROLE_PRIORITY = [
  MessageParticipantRole.FROM,
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
];

// The first outside sender, or, when only the team wrote, the first outside
// recipient. Callers pass participants that are not workspace members.
export const pickInboxContact = (
  participants: InboxParticipant[],
  ownHandles: string[],
): InboxContact | null => {
  const ownHandleSet = new Set(
    ownHandles.map((handle) => handle.toLowerCase()),
  );
  const outsiders = participants
    .filter(
      (participant) =>
        isDefined(participant.handle) &&
        !ownHandleSet.has(participant.handle.toLowerCase()),
    )
    .sort(
      (first, second) =>
        (first.receivedAt?.getTime() ?? 0) -
        (second.receivedAt?.getTime() ?? 0),
    );

  for (const role of ROLE_PRIORITY) {
    const contact = outsiders.find((participant) => participant.role === role);

    if (isDefined(contact)) {
      return {
        name: contact.displayName || contact.handle || '',
        personId: contact.personId,
      };
    }
  }

  return null;
};
