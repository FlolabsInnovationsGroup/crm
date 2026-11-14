import { getContactInitials } from '@/team-inbox/utils/getContactInitials';

describe('getContactInitials', () => {
  it('uses the first and last word of a name', () => {
    expect(getContactInitials('Aisha Bello')).toBe('AB');
    expect(getContactInitials('María José García')).toBe('MG');
  });

  it('falls back to the start of an email address or a single word', () => {
    expect(getContactInitials('crmtest3.flolabs@example.com')).toBe('CF');
    expect(getContactInitials('qiming@outlook.com')).toBe('QI');
    expect(getContactInitials('')).toBe('?');
  });
});
