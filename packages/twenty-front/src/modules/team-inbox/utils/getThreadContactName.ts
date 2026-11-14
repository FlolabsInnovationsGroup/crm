import { isDefined } from 'twenty-shared/utils';

type ThreadParticipant = {
  displayName: string;
  workspaceMemberId?: string | null;
};

// A thread we started lists our own mailbox first, so the person who wrote
// to us is the first sender who is not a workspace member.
export const getThreadContactName = ({
  firstParticipant,
  lastTwoParticipants,
}: {
  firstParticipant: ThreadParticipant;
  lastTwoParticipants: ThreadParticipant[];
}) =>
  [firstParticipant, ...lastTwoParticipants].find(
    (participant) => !isDefined(participant.workspaceMemberId),
  )?.displayName ?? firstParticipant.displayName;
