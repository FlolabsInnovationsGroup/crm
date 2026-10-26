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
  visibleWhenGroupsMatch: 'any',
  requiredWhenGroupsMatch: 'any',
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

  it('keeps calculation conditions and lets requirements look ahead', () => {
    const fields: PublicFormField[] = [
      {
        ...buildField('first'),
        visibleWhenGroups: [
          {
            match: 'all',
            conditions: [
              { fieldId: 'score', operator: 'greaterThan', value: '5' },
              { fieldId: 'second', operator: 'isEmpty' },
            ],
          },
        ],
        requiredWhenGroups: [
          {
            match: 'all',
            conditions: [{ fieldId: 'second', operator: 'isNotEmpty' }],
          },
        ],
      },
      buildField('second'),
    ];

    const [first] = removeInvalidFormConditions(fields, ['score']);

    expect(first.visibleWhenGroups?.[0].conditions).toEqual([
      { fieldId: 'score', operator: 'greaterThan', value: '5' },
    ]);
    expect(first.requiredWhenGroups?.[0].conditions).toHaveLength(1);
  });
});
