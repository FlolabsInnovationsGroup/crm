export type SendingDomainRecord = {
  type: string;
  name: string;
  hostLabel: string;
  value: string;
  status: 'ok' | 'missing';
};

export type SendingDomain = {
  domain: string;
  status: 'preparing' | 'pending' | 'verified';
  isFixed: boolean;
  records: SendingDomainRecord[];
};

export type SendingDomainList = {
  isConfigured: boolean;
  domains: SendingDomain[];
};
