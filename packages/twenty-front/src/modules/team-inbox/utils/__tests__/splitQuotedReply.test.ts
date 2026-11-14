import { splitQuotedReply } from '@/team-inbox/utils/splitQuotedReply';

describe('splitQuotedReply', () => {
  it('cuts at a Gmail "wrote:" line', () => {
    expect(
      splitQuotedReply(
        'Yes, I am still interested.\n\nOn Tue, Nov 11, 2026 at 9:00 AM FloLabs HR <hr@flolabs.com> wrote:\n> Hi Ana,',
      ),
    ).toEqual({
      reply: 'Yes, I am still interested.',
      quoted:
        'On Tue, Nov 11, 2026 at 9:00 AM FloLabs HR <hr@flolabs.com> wrote:\n> Hi Ana,',
    });
  });

  it('keeps an email address in angle brackets inside the reply', () => {
    expect(
      splitQuotedReply('Please write to <ana@example.com> instead.').reply,
    ).toBe('Please write to <ana@example.com> instead.');
  });

  it('cuts at an Outlook header and keeps a quote-only message visible', () => {
    expect(
      splitQuotedReply('Thanks!\n\nFrom: FloLabs HR\nSent: Monday\nHello')
        .reply,
    ).toBe('Thanks!');
    expect(splitQuotedReply('> only a quote').reply).toBe('> only a quote');
  });
});
