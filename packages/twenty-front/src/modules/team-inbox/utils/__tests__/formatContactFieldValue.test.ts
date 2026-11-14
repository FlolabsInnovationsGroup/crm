import { FieldMetadataType } from 'twenty-shared/types';

import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';

const stageField = {
  type: FieldMetadataType.SELECT,
  options: [
    {
      id: '1',
      value: 'CONTACTED',
      label: 'Contacted',
      color: 'blue' as const,
      position: 0,
    },
  ],
};

describe('formatContactFieldValue', () => {
  it('shows select options by their label', () => {
    expect(formatContactFieldValue(stageField, 'CONTACTED')).toBe('Contacted');
    expect(
      formatContactFieldValue(
        { ...stageField, type: FieldMetadataType.MULTI_SELECT },
        ['CONTACTED', 'UNKNOWN'],
      ),
    ).toBe('Contacted, UNKNOWN');
  });

  it('reads the primary email and phone', () => {
    expect(
      formatContactFieldValue(
        { type: FieldMetadataType.EMAILS, options: null },
        { primaryEmail: 'a@b.co', additionalEmails: null },
      ),
    ).toBe('a@b.co');
    expect(
      formatContactFieldValue(
        { type: FieldMetadataType.PHONES, options: null },
        { primaryPhoneNumber: '1234', primaryPhoneCallingCode: '+20' },
      ),
    ).toBe('+20 1234');
  });

  it('is empty when there is no value', () => {
    expect(
      formatContactFieldValue(
        { type: FieldMetadataType.TEXT, options: null },
        null,
      ),
    ).toBe('');
    expect(
      formatContactFieldValue(
        { type: FieldMetadataType.PHONES, options: null },
        { primaryPhoneNumber: '', primaryPhoneCallingCode: '+20' },
      ),
    ).toBe('');
  });
});
