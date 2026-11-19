export type SendingDomainRecord = {
  type: string;
  name: string;
  hostLabel: string;
  value: string;
  existingValue: string | null;
  status: 'ok' | 'missing';
};

export type SendingDomain = {
  domain: string;
  status: 'preparing' | 'pending' | 'verified';
  isFixed: boolean;
  dnsProvider: { name: string; url: string | null } | null;
  records: SendingDomainRecord[];
};

export type SendingSender = {
  name: string;
  email: string;
  replyTo: string;
  canReceiveReplies: boolean;
};

export type SendingDomainList = {
  isConfigured: boolean;
  domains: SendingDomain[];
  senders: SendingSender[];
};
