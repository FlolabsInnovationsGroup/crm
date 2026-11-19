// Shared with dkim-manager in packages/twenty-utils/flolabs/mail.
export const SENDING_DOMAIN_FILES = {
  requestedDomains: 'domains.txt',
  serverConfig: 'server.json',
  dkimRecordSuffix: '.dkim',
  // Read by the CRM only; dkim-manager ignores it.
  senders: 'senders.json',
} as const;
