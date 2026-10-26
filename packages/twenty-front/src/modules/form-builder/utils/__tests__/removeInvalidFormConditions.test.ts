import { type PublicFormField } from 'twenty-shared/utils';

import { removeInvalidFormConditions } from '@/form-builder/utils/removeInvalidFormConditions';

const buildField = (
  id: string,
  visibleWhen?: PublicFormField['visibleWhen'],
): PublicFormField => ({
  id,
  type: 'shortText',
  label: id,
  required: false,
  width: 'full',
  visibleWhenMatch: 'all',
  visibleWhen,
});

describe('removeInvalidFormConditions', () => {
  it('keeps conditions on earlier fields', () => {
    const fields = [
      buildField('first'),
      buildField('second', [{ fieldId: 'first', operator: 'isNotEmpty' }]),
    ];

    expect(removeInvalidFormConditions(fields)).toEqual(fields);
  });

  it('drops conditions on later or deleted fields', () => {
    const fields = [
      buildField('second', [
        { fieldId: 'first', operator: 'isNotEmpty' },
        { fieldId: 'deleted', operator: 'isEmpty' },
      ]),
      buildField('first'),
    ];

    expect(removeInvalidFormConditions(fields)[0].visibleWhen).toBeUndefined();
  });
});
