import { isDefined } from 'twenty-shared/utils';

import { getRegisteredDomain } from 'src/modules/sending-domain/utils/get-registered-domain.util';

// DNS providers such as Dynadot ask for the name relative to the registered domain:
// "lm1._domainkey.news" for "lm1._domainkey.news.acme.com.ng" on acme.com.ng.
export const getDnsProviderHostLabel = ({
  recordName,
  domain,
}: {
  recordName: string;
  domain: string;
}): string => {
  const registeredDomain = getRegisteredDomain(domain);

  if (!isDefined(registeredDomain)) {
    return recordName;
  }

  if (recordName === registeredDomain) {
    return '@';
  }

  return recordName.endsWith(`.${registeredDomain}`)
    ? recordName.slice(0, -registeredDomain.length - 1)
    : recordName;
};
