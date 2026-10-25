import { fillEmailTemplateVariables } from '@/activities/emails/utils/fillEmailTemplateVariables';

describe('fillEmailTemplateVariables', () => {
  it('replaces first and last name placeholders', () => {
    expect(
      fillEmailTemplateVariables('<p>Hi {{firstName}} {{ lastName }},</p>', {
        firstName: 'Sanjay',
        lastName: 'Vijayakumar',
      }),
    ).toBe('<p>Hi Sanjay Vijayakumar,</p>');
  });

  it('falls back to a neutral greeting when the first name is unknown', () => {
    expect(
      fillEmailTemplateVariables('Hi {{firstName}},', { firstName: '  ' }),
    ).toBe('Hi there,');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(
      fillEmailTemplateVariables('{{companyName}}', { firstName: 'A' }),
    ).toBe('{{companyName}}');
  });
});
