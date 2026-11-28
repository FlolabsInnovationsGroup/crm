import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ApplicantEmailHistoryMessageDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history-message.dto';

export type ApplicantMatcher = {
  // Lower-cased; null when only the person is known.
  handle: string | null;
  personId: string | null;
  // Lower-cased team mailbox handles; never the applicant.
  ownHandles: Set<string>;
};

export type HistoryParticipant = {
  role: MessageParticipantRole;
  handle: string | null;
  displayName: string | null;
  personId: string | null;
  workspaceMemberId: string | null;
};

export type HistoryMessage = {
  id: string;
  messageThreadId: string;
  subject: string | null;
  text: string | null;
  receivedAt: Date | null;
  headerMessageId: string | null;
};

const RECIPIENT_ROLES: MessageParticipantRole[] = [
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
  MessageParticipantRole.BCC,
];

// Exact, case-insensitive: ada@x.com must never match nada@x.com. A person
// can be matched onto one of our mailboxes, so those never count.
export const isApplicantParticipant = (
  participant: Pick<
    HistoryParticipant,
    'handle' | 'personId' | 'workspaceMemberId'
  >,
  applicant: ApplicantMatcher,
): boolean => {
  const handle = participant.handle?.trim().toLowerCase() ?? '';

  if (
    isDefined(participant.workspaceMemberId) ||
    applicant.ownHandles.has(handle)
  ) {
    return false;
  }

  return (
    (isDefined(applicant.handle) && handle === applicant.handle) ||
    (isDefined(applicant.personId) &&
      participant.personId === applicant.personId)
  );
};

export const toApplicantEmailHistoryMessage = ({
  message,
  participants,
  applicant,
}: {
  message: HistoryMessage;
  participants: HistoryParticipant[];
  applicant: ApplicantMatcher;
}): ApplicantEmailHistoryMessageDTO => {
  const toDto = ({ role, handle, displayName }: HistoryParticipant) => ({
    role,
    handle: handle ?? '',
    displayName: isNonEmptyString(displayName) ? displayName : null,
  });
  const sender =
    participants.find(({ role }) => role === MessageParticipantRole.FROM) ??
    null;
  const isOutgoing =
    isDefined(sender) &&
    (isDefined(sender.workspaceMemberId) ||
      applicant.ownHandles.has(sender.handle?.trim().toLowerCase() ?? ''));

  return {
    ...message,
    direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
    isFromApplicant:
      isDefined(sender) && isApplicantParticipant(sender, applicant),
    sender: isDefined(sender) ? toDto(sender) : null,
    recipients: participants
      .filter(
        ({ role, handle }) =>
          RECIPIENT_ROLES.includes(role) && isNonEmptyString(handle),
      )
      .map(toDto),
  };
};
