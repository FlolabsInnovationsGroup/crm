import { getEmailTemplateBody } from '@/activities/emails/utils/getEmailTemplateBody';

describe('getEmailTemplateBody', () => {
  it('keeps the imported HTML while the text was not edited', () => {
    expect(
      getEmailTemplateBody({
        body: { markdown: 'Hi {{firstName}},\n\nWelcome to FloLabs.' },
        bodyHtml:
          '<p>Hi {{firstName}},</p><p><strong>Welcome</strong> to FloLabs.</p>',
      }),
    ).toBe(
      '<p>Hi {{firstName}},</p><p><strong>Welcome</strong> to FloLabs.</p>',
    );
  });

  it('uses the edited body once the text changed', () => {
    const body = getEmailTemplateBody({
      body: {
        markdown:
          'Hi {{firstName}},\n\nPlease fill [the form](https://crm.example.com/f).\n\nhttps://discord.com/',
      },
      bodyHtml: '<p>Hi {{firstName}},</p><p>Old text.</p>',
    });

    expect(body).toContain(
      'Please fill <a href="https://crm.example.com/f">the form</a>',
    );
    expect(body).toContain(
      '<a href="https://discord.com/">https://discord.com/</a>',
    );
    expect(body).not.toContain('Old text');
  });

  it('falls back to the imported HTML when the body is empty', () => {
    expect(
      getEmailTemplateBody({
        body: { markdown: '  ' },
        bodyHtml: '<p>Hello</p>',
      }),
    ).toBe('<p>Hello</p>');
  });
});
