import { getEmailSentExcerpt } from 'src/engine/core-modules/messaging/utils/get-email-sent-excerpt.util';

describe('getEmailSentExcerpt', () => {
  it('keeps only the new part of a reply, on one line', () => {
    expect(
      getEmailSentExcerpt(
        'Hi Ada,\n\nYour interview is on Monday.\n\nOn Tue, 24 Nov 2026 Ada wrote:\n> When is my interview?',
      ),
    ).toBe('Hi Ada, Your interview is on Monday.');
    expect(getEmailSentExcerpt('Thanks!\n> quoted')).toBe('Thanks!');
  });

  it('shortens long emails and returns nothing for empty ones', () => {
    const excerpt = getEmailSentExcerpt('word '.repeat(200));

    expect(excerpt?.length).toBe(280);
    expect(excerpt?.endsWith('…')).toBe(true);
    expect(getEmailSentExcerpt(null)).toBeNull();
    expect(getEmailSentExcerpt('> only quoted')).toBeNull();
  });
});
