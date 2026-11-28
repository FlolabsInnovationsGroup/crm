import { getApplicantFirstName } from '@/team-inbox/utils/getApplicantFirstName';

describe('getApplicantFirstName', () => {
  it('uses the first word of the display name', () => {
    expect(getApplicantFirstName('  Ada Lovelace ', 'ada@x.com')).toBe('Ada');
  });

  it('falls back to the address when there is no real name', () => {
    expect(getApplicantFirstName(null, 'ada.l@x.com')).toBe('ada.l');
    expect(getApplicantFirstName('ada.l@x.com', 'ada.l@x.com')).toBe('ada.l');
    expect(getApplicantFirstName('   ', 'ada@x.com')).toBe('ada');
  });
});
