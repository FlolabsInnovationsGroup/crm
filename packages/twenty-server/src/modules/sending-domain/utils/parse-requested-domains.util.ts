import { isDefined } from 'twenty-shared/utils';

import { normalizeSendingDomain } from 'src/modules/sending-domain/utils/normalize-sending-domain.util';

export const parseRequestedDomains = (content: string): string[] => [
  ...new Set(content.split('\n').map(normalizeSendingDomain).filter(isDefined)),
];
