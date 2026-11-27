import { isNonEmptyString } from '@sniptt/guards';

import { type AgreementPersonRecord } from 'src/modules/agreement-templates/types/agreement-template-record.type';

export const getAgreementFullName = (
  name: AgreementPersonRecord['name'] | undefined,
): string | null =>
  [name?.firstName?.trim(), name?.lastName?.trim()]
    .filter(isNonEmptyString)
    .join(' ') || null;
