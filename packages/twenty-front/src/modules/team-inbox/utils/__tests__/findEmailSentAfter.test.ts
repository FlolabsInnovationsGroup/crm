import { findEmailSentAfter } from '@/team-inbox/utils/findEmailSentAfter';

const email = (receivedAt: string) => ({
  subject: 'Re: Internship',
  text: 'Hi Ada',
  receivedAt,
});

describe('findEmailSentAfter', () => {
  it('returns the newest email when it went out after the card', () => {
    expect(
      findEmailSentAfter(
        [email('2026-11-26T12:00:00Z'), email('2026-11-20T12:00:00Z')],
        '2026-11-25T08:00:00Z',
      )?.receivedAt,
    ).toBe('2026-11-26T12:00:00Z');
  });

  it('returns nothing when the last email is older than the card', () => {
    expect(
      findEmailSentAfter(
        [email('2026-11-20T12:00:00Z')],
        '2026-11-25T08:00:00Z',
      ),
    ).toBeNull();
    expect(findEmailSentAfter(undefined, '2026-11-25T08:00:00Z')).toBeNull();
  });
});
