import psl from 'psl';

import { isParsedDomain } from 'src/modules/contact-creation-manager/types/is-psl-parsed-domain.type';

// "acme.com.ng" for "news.acme.com.ng": the name bought at the registrar.
export const getRegisteredDomain = (domain: string): string | null => {
  const parsed = psl.parse(domain);

  return isParsedDomain(parsed) ? parsed.domain : null;
};
