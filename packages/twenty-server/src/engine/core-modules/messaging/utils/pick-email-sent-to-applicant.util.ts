import { isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';

export type SentEmailCandidate = {
  id: string;
  receivedAt: Date;
  participants: {
    role: MessageParticipantRole;
    handle: string | null;
    displayName: string | null;
  }[];
};

// The newest email one of our mailboxes sent the applicant after the review
// email arrived.
export const pickEmailSentToApplicant = <
  TCandidate extends SentEmailCandidate,
>({
  candidates,
  applicantEmail,
  ownHandles,
  after,
}: {
  candidates: TCandidate[];
  applicantEmail: string;
  ownHandles: Set<string>;
  after: Date;
}): TCandidate | null => {
  const applicant = applicantEmail.trim().toLowerCase();

  const isFrom = (
    candidate: TCandidate,
    matches: (handle: string) => boolean,
  ) =>
    candidate.participants.some(
      ({ role, handle }) =>
        role === MessageParticipantRole.FROM &&
        isNonEmptyString(handle) &&
        matches(handle.trim().toLowerCase()),
    );
  const isAddressedToApplicant = (candidate: TCandidate) =>
    candidate.participants.some(
      ({ role, handle }) =>
        (role === MessageParticipantRole.TO ||
          role === MessageParticipantRole.CC) &&
        handle?.trim().toLowerCase() === applicant,
    );

  return (
    candidates
      .filter(
        (candidate) =>
          candidate.receivedAt.getTime() > after.getTime() &&
          isFrom(candidate, (handle) => ownHandles.has(handle)) &&
          isAddressedToApplicant(candidate),
      )
      .sort(
        (first, second) =>
          second.receivedAt.getTime() - first.receivedAt.getTime(),
      )[0] ?? null
  );
};

export const getSender = (candidate: SentEmailCandidate) =>
  candidate.participants.find(
    ({ role }) => role === MessageParticipantRole.FROM,
  ) ?? null;
