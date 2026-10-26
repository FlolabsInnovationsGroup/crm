import { getOptionValueFromLabel } from '@/form-builder/utils/getOptionValueFromLabel';

describe('getOptionValueFromLabel', () => {
  it('builds CRM-style keys', () => {
    expect(getOptionValueFromLabel('Social media', 'OPTION_1')).toBe(
      'SOCIAL_MEDIA',
    );
    expect(getOptionValueFromLabel('Café & Co.', 'OPTION_1')).toBe('CAFE_CO');
  });

  it('falls back when the label has no latin characters', () => {
    expect(getOptionValueFromLabel('لينكد إن', 'OPTION_3')).toBe('OPTION_3');
  });
});
