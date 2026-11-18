import psl from 'psl';
import { isDefined } from 'twenty-shared/utils';

import { isParsedDomain } from 'src/modules/contact-creation-manager/types/is-psl-parsed-domain.type';

// DNS providers such as Dynadot ask for the name relative to the registered domain:
// "lm1._domainkey.news" for "lm1._domainkey.news.acme.com.ng" on acme.com.ng.
export const getDnsProviderHostLabel = ({
  recordName,
  domain,
}: {
  recordName: string;
  domain: string;
}): string => {
  const parsed = psl.parse(domain);
  const registeredDomain = isParsedDomain(parsed) ? parsed.domain : null;

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
