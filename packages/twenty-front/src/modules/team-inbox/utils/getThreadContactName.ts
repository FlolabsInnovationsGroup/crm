import { isDefined } from 'twenty-shared/utils';

type ThreadParticipant = {
  displayName: string;
  handle?: string;
  workspaceMemberId?: string | null;
};

// A thread we started lists our own mailbox first, so the person who wrote
// to us is the first sender who is neither a workspace member nor one of
// our mailboxes.
export const getThreadContact = <TParticipant extends ThreadParticipant>(
  {
    firstParticipant,
    lastTwoParticipants,
  }: {
    firstParticipant: TParticipant;
    lastTwoParticipants: TParticipant[];
  },
  ownHandles: string[] = [],
): TParticipant =>
  [firstParticipant, ...lastTwoParticipants].find(
    (participant) =>
      !isDefined(participant.workspaceMemberId) &&
      !ownHandles.some(
        (handle) => handle.toLowerCase() === participant.handle?.toLowerCase(),
      ),
  ) ?? firstParticipant;

export const getThreadContactName = (
  thread: {
    firstParticipant: ThreadParticipant;
    lastTwoParticipants: ThreadParticipant[];
  },
  ownHandles: string[] = [],
) => getThreadContact(thread, ownHandles).displayName;
