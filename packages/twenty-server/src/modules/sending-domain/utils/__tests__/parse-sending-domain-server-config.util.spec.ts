import { parseSendingDomainServerConfig } from 'src/modules/sending-domain/utils/parse-sending-domain-server-config.util';

describe('parseSendingDomainServerConfig', () => {
  it('reads the file dkim-manager writes', () => {
    expect(
      parseSendingDomainServerConfig(
        '{"selector":"lm1","ipv4":"128.140.4.151","ipv6":"","fixedDomains":["news.hephaestus.international"]}',
      ),
    ).toEqual({
      selector: 'lm1',
      ipv4: '128.140.4.151',
      ipv6: '',
      fixedDomains: ['news.hephaestus.international'],
    });
  });

  it.each(['', 'not json', '[]', '{"selector":"lm1"}'])(
    'returns null for %p',
    (content) => {
      expect(parseSendingDomainServerConfig(content)).toBeNull();
    },
  );
});
