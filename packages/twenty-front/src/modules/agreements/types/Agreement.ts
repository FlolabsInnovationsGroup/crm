export type AgreementRequestStatus =
  | 'SENT'
  | 'APPLICANT_SIGNED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type AgreementPerson = {
  id: string;
  name: { firstName: string | null; lastName: string | null } | null;
  emails: { primaryEmail: string | null } | null;
};

export type AgreementTemplate = {
  id: string;
  name: string | null;
  isActive: boolean | null;
  paymentPlan: string | null;
};

export type AgreementRequest = {
  id: string;
  documents: string | null;
  status: AgreementRequestStatus | null;
  sentAt: string | null;
  completedAt: string | null;
  person: AgreementPerson | null;
};

export type AgreementPreview = {
  templateName: string | null;
  text: string;
  missingPlaceholders: string[];
};
