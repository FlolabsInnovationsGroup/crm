import { type MessageParticipantRole } from 'twenty-shared/types';

export type ApplicantEmailHistoryParticipant = {
  role: MessageParticipantRole;
  handle: string;
  displayName: string | null;
};

export type ApplicantEmailHistoryMessage = {
  id: string;
  messageThreadId: string;
  subject: string | null;
  text: string | null;
  receivedAt: string | null;
  headerMessageId: string | null;
  direction: 'INCOMING' | 'OUTGOING';
  isFromApplicant: boolean;
  sender: ApplicantEmailHistoryParticipant | null;
  recipients: ApplicantEmailHistoryParticipant[];
};
