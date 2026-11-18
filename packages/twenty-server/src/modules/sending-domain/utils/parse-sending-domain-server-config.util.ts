import { isNonEmptyString, isString } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type SendingDomainServerConfig } from 'src/modules/sending-domain/types/sending-domain-server-config.type';
import { normalizeSendingDomain } from 'src/modules/sending-domain/utils/normalize-sending-domain.util';

export const parseSendingDomainServerConfig = (
  content: string,
): SendingDomainServerConfig | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) {
    return null;
  }

  const { selector, ipv4, ipv6, fixedDomains } = parsed;

  if (!isNonEmptyString(selector) || !isNonEmptyString(ipv4)) {
    return null;
  }

  return {
    selector,
    ipv4,
    ipv6: isString(ipv6) ? ipv6 : '',
    // Fixed domains end up in file paths, so they pass the same check as added ones.
    fixedDomains: Array.isArray(fixedDomains)
      ? fixedDomains
          .filter(isString)
          .map(normalizeSendingDomain)
          .filter(isDefined)
      : [],
  };
};
