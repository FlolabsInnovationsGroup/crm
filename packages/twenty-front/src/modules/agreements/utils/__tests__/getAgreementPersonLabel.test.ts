import { getAgreementPersonLabel } from '@/agreements/utils/getAgreementPersonLabel';

describe('getAgreementPersonLabel', () => {
  it('prefers the full name and falls back to the email', () => {
    expect(
      getAgreementPersonLabel({
        id: '1',
        name: { firstName: ' Ada ', lastName: 'Lovelace' },
        emails: { primaryEmail: 'ada@example.com' },
      }),
    ).toBe('Ada Lovelace');
    expect(
      getAgreementPersonLabel({
        id: '1',
        name: { firstName: '', lastName: null },
        emails: { primaryEmail: 'ada@example.com' },
      }),
    ).toBe('ada@example.com');
    expect(getAgreementPersonLabel(null)).toBe('');
  });
});
