import { isNonEmptyString } from '@sniptt/guards';

import { getMeetingTrackerWorkspaceId } from 'src/modules/meeting-tracker/utils/get-meeting-tracker-workspace-id.util';

export type AgreementSigningConfig = {
  workspaceId: string;
  documensoApiUrl: string;
  documensoPublicUrl: string;
  documensoApiToken: string;
  webhookSecret: string | null;
  senderHandle: string;
  countersignerEmail: string;
  countersignerName: string;
};

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const read = (name: string): string | null => {
  const value = process.env[name]?.trim();

  return isNonEmptyString(value) ? value : null;
};

// Null until the server has a Documenso token and knows who countersigns.
// The API is reached inside Docker; signing links use the public address.
export const getAgreementSigningConfig = (): AgreementSigningConfig | null => {
  const workspaceId = getMeetingTrackerWorkspaceId();
  const documensoApiToken = read('FLOLABS_DOCUMENSO_API_TOKEN');
  const countersignerEmail = read('FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL');

  if (
    !isNonEmptyString(workspaceId) ||
    !isNonEmptyString(documensoApiToken) ||
    !isNonEmptyString(countersignerEmail)
  ) {
    return null;
  }

  return {
    workspaceId,
    documensoApiUrl: withoutTrailingSlash(
      read('FLOLABS_DOCUMENSO_API_URL') ?? 'http://documenso:3000',
    ),
    documensoPublicUrl: withoutTrailingSlash(
      read('FLOLABS_DOCUMENSO_PUBLIC_URL') ??
        'https://sign.flolabsinnovations.com',
    ),
    documensoApiToken,
    webhookSecret: read('FLOLABS_DOCUMENSO_WEBHOOK_SECRET'),
    senderHandle: (
      read('FLOLABS_AGREEMENT_SENDER') ?? 'hr@flolabsinnovations.com'
    ).toLowerCase(),
    countersignerEmail: countersignerEmail.toLowerCase(),
    countersignerName:
      read('FLOLABS_AGREEMENT_COUNTERSIGNER_NAME') ?? 'FloLabs Innovations',
  };
};
