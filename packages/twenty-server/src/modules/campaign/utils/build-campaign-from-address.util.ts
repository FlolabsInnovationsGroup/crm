import { isNonEmptyString } from '@sniptt/guards';

export const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i;

// Returns null for a local part an email server would refuse, or a name that
// could inject another header.
export const buildCampaignFromAddress = ({
  fromName,
  fromLocalPart,
  fromDomain,
}: {
  fromName: string;
  fromLocalPart: string;
  fromDomain: string;
}): string | null => {
  const name = fromName.trim().replace(/["\\]/g, '');
  const localPart = fromLocalPart.trim();

  if (
    !isNonEmptyString(name) ||
    /[\r\n<>]/.test(name) ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.includes('..')
  ) {
    return null;
  }

  return `"${name}" <${localPart.toLowerCase()}@${fromDomain}>`;
};
