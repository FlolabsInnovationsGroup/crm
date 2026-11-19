import { isNonEmptyString } from '@sniptt/guards';

import { type SendingDomainRecordDTO } from 'src/modules/sending-domain/dtos/sending-domain-record.dto';
import { type SendingDomainServerConfig } from 'src/modules/sending-domain/types/sending-domain-server-config.type';
import { getDnsProviderHostLabel } from 'src/modules/sending-domain/utils/get-dns-provider-host-label.util';
import { mergeSpfRecord } from 'src/modules/sending-domain/utils/merge-spf-record.util';

export type SendingDomainPublishedTxtRecords = {
  root: string[];
  dkim: string[];
  dmarc: string[];
};

const withoutWhitespace = (value: string) => value.replace(/\s+/g, '');

export const buildSendingDomainRecords = ({
  domain,
  dkimValue,
  serverConfig,
  published,
}: {
  domain: string;
  dkimValue: string;
  serverConfig: SendingDomainServerConfig;
  published: SendingDomainPublishedTxtRecords;
}): SendingDomainRecordDTO[] => {
  const spfMechanisms = [
    `ip4:${serverConfig.ipv4}`,
    ...(isNonEmptyString(serverConfig.ipv6)
      ? [`ip6:${serverConfig.ipv6}`]
      : []),
  ];
  // A domain may have only one SPF record, so an existing one is edited, never doubled.
  const existingSpfValue =
    published.root.find((value) => value.startsWith('v=spf1')) ?? null;
  const spfValue = isNonEmptyString(existingSpfValue)
    ? mergeSpfRecord(existingSpfValue, spfMechanisms)
    : ['v=spf1', ...spfMechanisms, '-all'].join(' ');

  // An existing SPF record that also lists our IPv4 counts, so a domain can keep its own senders.
  const isSpfPublished = published.root.some(
    (value) =>
      value.startsWith('v=spf1') &&
      value.split(/\s+/).includes(`ip4:${serverConfig.ipv4}`),
  );

  const isDkimPublished = published.dkim.some(
    (value) => withoutWhitespace(value) === withoutWhitespace(dkimValue),
  );

  const isDmarcPublished = published.dmarc.some((value) =>
    value.startsWith('v=DMARC1'),
  );

  const records: Omit<SendingDomainRecordDTO, 'hostLabel'>[] = [
    {
      type: 'TXT',
      name: domain,
      value: spfValue,
      existingValue: isSpfPublished ? null : existingSpfValue,
      status: isSpfPublished ? 'ok' : 'missing',
    },
    {
      type: 'TXT',
      name: `${serverConfig.selector}._domainkey.${domain}`,
      value: dkimValue,
      existingValue: null,
      status: isDkimPublished ? 'ok' : 'missing',
    },
    {
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: 'v=DMARC1; p=none',
      existingValue: null,
      status: isDmarcPublished ? 'ok' : 'missing',
    },
  ];

  return records.map((record) => ({
    ...record,
    hostLabel: getDnsProviderHostLabel({ recordName: record.name, domain }),
  }));
};
