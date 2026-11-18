import { normalizeSendingDomain } from 'src/modules/sending-domain/utils/normalize-sending-domain.util';

describe('normalizeSendingDomain', () => {
  it('lowercases and trims a domain and drops a trailing dot', () => {
    expect(normalizeSendingDomain('  News.FloBrain.AI. ')).toBe(
      'news.flobrain.ai',
    );
  });

  it.each([
    '',
    'localhost',
    'news flobrain.ai',
    '-news.flobrain.ai',
    'news.flobrain.ai/path',
    'user@flobrain.ai',
    `${'a'.repeat(250)}.com`,
  ])('rejects %p', (input) => {
    expect(normalizeSendingDomain(input)).toBeNull();
  });
});
