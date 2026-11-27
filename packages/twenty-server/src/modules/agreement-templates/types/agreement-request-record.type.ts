import { type ActorMetadata } from 'twenty-shared/types';

// The object is created by setup-agreement-templates.mjs.
export type AgreementRequestStatus =
  | 'SENT'
  | 'APPLICANT_SIGNED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type AgreementRequestRecord = {
  id: string;
  name: string | null;
  personId: string | null;
  status: AgreementRequestStatus | null;
  documents: string | null;
  documensoEnvelopeId: string | null;
  sentAt: string | Date | null;
  applicantSignedAt: string | Date | null;
  countersignerEmailedAt: string | Date | null;
  completedAt: string | Date | null;
  signedFilesSavedAt: string | Date | null;
  createdBy?: ActorMetadata;
  updatedBy?: ActorMetadata;
};

export type AgreementAttachmentRecord = {
  id: string;
  name: string | null;
  targetPersonId: string | null;
  file: { fileId: string; label?: string | null }[] | null;
};
