import { getDnsProviderHostLabel } from 'src/modules/sending-domain/utils/get-dns-provider-host-label.util';

describe('getDnsProviderHostLabel', () => {
  it.each([
    ['news.flobrain.ai', 'news.flobrain.ai', 'news'],
    [
      'lm1._domainkey.news.flobrain.ai',
      'news.flobrain.ai',
      'lm1._domainkey.news',
    ],
    ['_dmarc.news.acme.com.ng', 'news.acme.com.ng', '_dmarc.news'],
    ['news.hephaestus.international', 'news.hephaestus.international', 'news'],
    ['flobrain.ai', 'flobrain.ai', '@'],
  ])('gives %s on %s the label %s', (recordName, domain, expected) => {
    expect(getDnsProviderHostLabel({ recordName, domain })).toBe(expected);
  });
});
