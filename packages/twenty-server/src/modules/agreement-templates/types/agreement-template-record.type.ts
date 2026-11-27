// Shapes of the records read by the agreement preview. The template object is
// created by setup-agreement-templates.mjs.
export type AgreementTemplateRecord = {
  id: string;
  name: string | null;
  body: { blocknote?: string | null; markdown?: string | null } | null;
  isActive: boolean | null;
};

export type AgreementPersonRecord = {
  id: string;
  name: { firstName?: string | null; lastName?: string | null } | null;
  emails: { primaryEmail?: string | null } | null;
  city: string | null;
  state: string | null;
  country: string | null;
  candidateLocation: string | null;
  paymentPlan: string | null;
  paymentAgreedAmount: {
    // A NUMERIC column, read back as a string.
    amountMicros: number | string | null;
    currencyCode: string | null;
  } | null;
};
