import { isNonEmptyString } from '@sniptt/guards';

import { type AgreementPerson } from '@/agreements/types/Agreement';

export const getAgreementPersonLabel = (person: AgreementPerson | null) => {
  const fullName = [person?.name?.firstName, person?.name?.lastName]
    .map((part) => part?.trim())
    .filter(isNonEmptyString)
    .join(' ');

  return fullName || person?.emails?.primaryEmail || '';
};
