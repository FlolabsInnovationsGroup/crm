import { buildQuotedThreadHistory } from 'src/engine/core-modules/tool/tools/email-tool/utils/build-quoted-thread-history.util';
import { extractMessageTextWithoutQuotedHistory } from 'src/modules/messaging/message-import-manager/utils/extract-message-text-without-quoted-history.util';

const applicantMessage = {
  senderName: 'Jane Applicant',
  senderHandle: 'jane@example.com',
  receivedAt: new Date('2026-11-24T09:05:00Z'),
  text: 'Is the internship paid?\nAnd when does it start?',
};

const ourFirstReply = {
  senderName: 'FloLabs HR',
  senderHandle: 'hr@flolabsinnovations.com',
  receivedAt: new Date('2026-11-23T14:30:00Z'),
  text: 'Thank you for applying.',
};

describe('buildQuotedThreadHistory', () => {
  it('returns nothing when there is no earlier message', () => {
    expect(buildQuotedThreadHistory([])).toBeUndefined();
  });

  it('quotes the newest message with a Gmail-style attribution line', () => {
    const history = buildQuotedThreadHistory([applicantMessage]);

    expect(history?.text).toBe(
      '\n\nOn Tue, 24 Nov 2026 at 09:05 UTC, Jane Applicant <jane@example.com> wrote:\n> Is the internship paid?\n> And when does it start?',
    );
    expect(history?.html).toContain('class="gmail_quote"');
    expect(history?.html).toContain('Is the internship paid?<br>And when');
  });

  it('nests older messages inside newer ones', () => {
    const history = buildQuotedThreadHistory([applicantMessage, ourFirstReply]);

    expect(history?.text).toBe(
      [
        '',
        '',
        'On Tue, 24 Nov 2026 at 09:05 UTC, Jane Applicant <jane@example.com> wrote:',
        '> Is the internship paid?',
        '> And when does it start?',
        '>',
        '> On Mon, 23 Nov 2026 at 14:30 UTC, FloLabs HR <hr@flolabsinnovations.com> wrote:',
        '> > Thank you for applying.',
      ].join('\n'),
    );
    expect(history?.html.indexOf('Jane Applicant')).toBeLessThan(
      history?.html.indexOf('FloLabs HR') ?? 0,
    );
  });

  it('escapes HTML in quoted text and sender names', () => {
    const history = buildQuotedThreadHistory([
      {
        ...applicantMessage,
        senderName: '<b>Jane</b>',
        text: '<script>alert(1)</script>',
      },
    ]);

    expect(history?.html).not.toContain('<script>');
    expect(history?.html).not.toContain('<b>Jane</b>');
    expect(history?.html).toContain('&lt;script&gt;');
  });

  it('falls back to the address when the sender has no name', () => {
    const history = buildQuotedThreadHistory([
      { ...applicantMessage, senderName: null },
    ]);

    expect(history?.text).toContain(', jane@example.com wrote:');
  });

  it('keeps Windows line breaks out of the plain-text quote', () => {
    const history = buildQuotedThreadHistory([
      { ...applicantMessage, text: 'First line\r\nSecond line' },
    ]);

    expect(history?.text).toContain('> First line\n> Second line');
    expect(history?.text).not.toContain('\r');
  });

  it('shortens very long sender names', () => {
    const history = buildQuotedThreadHistory([
      { ...applicantMessage, senderName: 'A'.repeat(500) },
    ]);

    expect(history?.text).toContain(`${'A'.repeat(100)} <jane@example.com>`);
    expect(history?.text).not.toContain('A'.repeat(101));
  });

  it('is removed again when the CRM imports the sent reply', () => {
    const history = buildQuotedThreadHistory([applicantMessage, ourFirstReply]);

    const reply = 'Yes, it is paid. It starts on 1 December.';

    expect(
      extractMessageTextWithoutQuotedHistory({
        html: `<div>${reply}</div>${history?.html}`,
      }),
    ).toBe(reply);
    expect(
      extractMessageTextWithoutQuotedHistory({
        text: `${reply}${history?.text}`,
      }),
    ).toBe(reply);
  });
});
