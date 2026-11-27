import { fillAgreementTemplate } from 'src/modules/agreement-templates/utils/fill-agreement-template.util';

describe('fillAgreementTemplate', () => {
  it('fills known placeholders and lists the ones left to fill', () => {
    expect(
      fillAgreementTemplate(
        'This agreement is made on {{date}} with {{ fullName }} of {{address}}, starting {{startDate}}.',
        {
          date: '27 November 2026',
          fullName: 'Ada Lovelace',
          address: null,
        },
      ),
    ).toEqual({
      text: 'This agreement is made on 27 November 2026 with Ada Lovelace of {{address}}, starting {{startDate}}.',
      missingPlaceholders: ['address', 'startDate'],
    });
  });
});
