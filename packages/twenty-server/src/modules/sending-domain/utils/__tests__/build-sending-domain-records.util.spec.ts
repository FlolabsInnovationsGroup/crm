import { buildSendingDomainRecords } from 'src/modules/sending-domain/utils/build-sending-domain-records.util';

const SERVER_CONFIG = {
  selector: 'lm1',
  ipv4: '128.140.4.151',
  ipv6: '2a01:4f8:1c19:7c31::1',
  fixedDomains: [],
};

const DKIM_VALUE = 'v=DKIM1; k=rsa; p=ABC123';

describe('buildSendingDomainRecords', () => {
  it('lists the three records and marks unpublished ones missing', () => {
    const records = buildSendingDomainRecords({
      domain: 'news.flobrain.ai',
      dkimValue: DKIM_VALUE,
      serverConfig: SERVER_CONFIG,
      published: { root: [], dkim: [], dmarc: [] },
    });

    expect(records).toEqual([
      {
        type: 'TXT',
        name: 'news.flobrain.ai',
        hostLabel: 'news',
        value: 'v=spf1 ip4:128.140.4.151 ip6:2a01:4f8:1c19:7c31::1 -all',
        status: 'missing',
      },
      {
        type: 'TXT',
        name: 'lm1._domainkey.news.flobrain.ai',
        hostLabel: 'lm1._domainkey.news',
        value: DKIM_VALUE,
        status: 'missing',
      },
      {
        type: 'TXT',
        name: '_dmarc.news.flobrain.ai',
        hostLabel: '_dmarc.news',
        value: 'v=DMARC1; p=none',
        status: 'missing',
      },
    ]);
  });

  it('accepts an existing SPF record that lists our IPv4 and a DKIM value split differently', () => {
    const records = buildSendingDomainRecords({
      domain: 'flobrain.ai',
      dkimValue: DKIM_VALUE,
      serverConfig: SERVER_CONFIG,
      published: {
        root: [
          'google-site-verification=x',
          'v=spf1 mx ip4:128.140.4.151 ~all',
        ],
        dkim: ['v=DKIM1;k=rsa;p=ABC123'],
        dmarc: ['v=DMARC1; p=quarantine'],
      },
    });

    expect(records.map((record) => record.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('does not take a longer IP that only starts with ours', () => {
    const [spfRecord] = buildSendingDomainRecords({
      domain: 'flobrain.ai',
      dkimValue: DKIM_VALUE,
      serverConfig: SERVER_CONFIG,
      published: {
        root: ['v=spf1 ip4:128.140.4.1510 -all'],
        dkim: [],
        dmarc: [],
      },
    });

    expect(spfRecord.status).toBe('missing');
  });
});
