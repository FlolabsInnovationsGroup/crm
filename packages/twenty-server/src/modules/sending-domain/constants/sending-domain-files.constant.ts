// Shared with dkim-manager in packages/twenty-utils/flolabs/mail.
export const SENDING_DOMAIN_FILES = {
  requestedDomains: 'domains.txt',
  serverConfig: 'server.json',
  dkimRecordSuffix: '.dkim',
} as const;
