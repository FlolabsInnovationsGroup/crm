import { isNonEmptyString } from '@sniptt/guards';

const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAXIMUM_DOMAIN_LENGTH = 253;

// Same rule as dkim-manager.sh, so a domain the CRM accepts always gets a key.
export const normalizeSendingDomain = (input: string): string | null => {
  const domain = input.trim().toLowerCase().replace(/\.$/, '');

  if (
    !isNonEmptyString(domain) ||
    domain.length > MAXIMUM_DOMAIN_LENGTH ||
    !DOMAIN_PATTERN.test(domain)
  ) {
    return null;
  }

  return domain;
};
