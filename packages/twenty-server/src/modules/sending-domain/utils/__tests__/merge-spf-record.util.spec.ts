import { mergeSpfRecord } from 'src/modules/sending-domain/utils/merge-spf-record.util';

describe('mergeSpfRecord', () => {
  it('adds missing mechanisms before the final all', () => {
    expect(
      mergeSpfRecord('v=spf1 a mx -all', ['ip4:128.140.4.151', 'mx']),
    ).toBe('v=spf1 a mx ip4:128.140.4.151 -all');
  });

  it('appends when there is no all term', () => {
    expect(mergeSpfRecord('v=spf1 a', ['ip4:128.140.4.151'])).toBe(
      'v=spf1 a ip4:128.140.4.151',
    );
  });
});
