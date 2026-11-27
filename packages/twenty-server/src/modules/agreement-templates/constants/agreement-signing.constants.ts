// A4 in PDF points.
export const AGREEMENT_PAGE_WIDTH = 595.28;
export const AGREEMENT_PAGE_HEIGHT = 841.89;

export type AgreementSignatureBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AgreementSignerLayout = {
  heading: string;
  signature: AgreementSignatureBox;
  name: AgreementSignatureBox;
  date: AgreementSignatureBox;
};

// The last page of every document. The PDF draws these boxes and Documenso
// places its fields on them, so both read this one layout.
export const AGREEMENT_SIGNER_LAYOUTS: {
  applicant: AgreementSignerLayout;
  countersigner: AgreementSignerLayout;
} = {
  applicant: {
    heading: 'Intern',
    signature: { left: 56, top: 190, width: 240, height: 70 },
    name: { left: 56, top: 290, width: 240, height: 26 },
    date: { left: 330, top: 290, width: 160, height: 26 },
  },
  countersigner: {
    heading: 'For FloLabs Innovations Group',
    signature: { left: 56, top: 450, width: 240, height: 70 },
    name: { left: 56, top: 550, width: 240, height: 26 },
    date: { left: 330, top: 550, width: 160, height: 26 },
  },
};

export const AGREEMENT_DOCUMENT_MAX_COUNT = 5;
