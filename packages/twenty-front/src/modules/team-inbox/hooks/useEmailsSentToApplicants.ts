import { isNonEmptyString } from '@sniptt/guards';
import {
  CoreObjectNameSingular,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';

type ParticipantRecord = ObjectRecord & {
  handle?: string | null;
  message?: {
    subject?: string | null;
    text?: string | null;
    receivedAt?: string | null;
  } | null;
};

// Enough recent emails per applicant to find the one after a card.
const EMAILS_PER_APPLICANT = 5;
const MAX_PARTICIPANTS = 500;

// Every email in the CRM addressed to these applicants, newest first; only
// our own mailboxes write to applicants, so these are the emails we sent.
export const useEmailsSentToApplicants = (emails: string[]) => {
  const sortedEmails = [
    ...new Set(emails.map((email) => email.toLowerCase())),
  ].sort();

  const { records } = useFindManyRecords<ParticipantRecord>({
    objectNameSingular: CoreObjectNameSingular.MessageParticipant,
    filter: {
      role: { eq: MessageParticipantRole.TO },
      or: sortedEmails.map((email) => ({
        handle: { ilike: email.replace(/[\\%_]/g, '\\$&') },
      })),
    },
    orderBy: [{ createdAt: 'DescNullsLast' }],
    limit: Math.min(
      sortedEmails.length * EMAILS_PER_APPLICANT,
      MAX_PARTICIPANTS,
    ),
    recordGqlFields: {
      id: true,
      handle: true,
      message: { subject: true, text: true, receivedAt: true },
    },
    skip: sortedEmails.length === 0,
  });

  const emailsByApplicant = new Map<string, EmailSentToApplicant[]>();

  for (const participant of records) {
    const handle = participant.handle?.toLowerCase();
    const receivedAt = participant.message?.receivedAt;

    if (!isNonEmptyString(handle) || !isNonEmptyString(receivedAt)) {
      continue;
    }

    const sentEmails = emailsByApplicant.get(handle) ?? [];

    sentEmails.push({
      subject: participant.message?.subject ?? '',
      text: participant.message?.text ?? '',
      receivedAt,
    });
    emailsByApplicant.set(handle, sentEmails);
  }

  for (const sentEmails of emailsByApplicant.values()) {
    sentEmails.sort(
      (first, second) =>
        new Date(second.receivedAt).getTime() -
        new Date(first.receivedAt).getTime(),
    );
  }

  return emailsByApplicant;
};
