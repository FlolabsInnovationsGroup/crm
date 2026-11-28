import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ApplicantEmailHistoryMessageDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history-message.dto';

export type ApplicantMatcher = {
  // Lower-cased; null when only the person is known.
  handle: string | null;
  personId: string | null;
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

// Exact, case-insensitive: ada@x.com must never match nada@x.com.
export const isApplicantParticipant = (
  participant: Pick<HistoryParticipant, 'handle' | 'personId'>,
  applicant: ApplicantMatcher,
): boolean =>
  (isDefined(applicant.handle) &&
    participant.handle?.trim().toLowerCase() === applicant.handle) ||
  (isDefined(applicant.personId) &&
    participant.personId === applicant.personId);

export const toApplicantEmailHistoryMessage = ({
  message,
  participants,
  applicant,
  ownHandles,
}: {
  message: HistoryMessage;
  participants: HistoryParticipant[];
  applicant: ApplicantMatcher;
  ownHandles: Set<string>;
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
      ownHandles.has(sender.handle?.trim().toLowerCase() ?? ''));

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
