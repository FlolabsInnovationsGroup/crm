// The parts of Documenso v2.21 API responses this module reads.
export type DocumensoEnvelopeStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type DocumensoRecipient = {
  id: number;
  email: string;
  name: string;
  token: string;
  signingOrder: number | null;
  signingStatus: 'NOT_SIGNED' | 'SIGNED' | 'REJECTED';
  signedAt: string | null;
};

export type DocumensoEnvelope = {
  id: string;
  externalId: string | null;
  status: DocumensoEnvelopeStatus;
  completedAt: string | null;
  recipients: DocumensoRecipient[];
  envelopeItems: { id: string; title: string; order: number }[];
};

export type DocumensoSignatureField = {
  type: 'SIGNATURE' | 'NAME' | 'DATE';
  identifier: number;
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

export type DocumensoNewRecipient = {
  email: string;
  name: string;
  role: 'SIGNER';
  accessAuth?: 'ACCOUNT'[];
  signingOrder: number;
  fields: DocumensoSignatureField[];
};
