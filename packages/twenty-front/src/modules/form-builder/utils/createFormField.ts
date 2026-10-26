import { t } from '@lingui/core/macro';
import { type PublicFormField } from 'twenty-shared/utils';

const getUniqueFieldId = (
  fieldType: PublicFormField['type'],
  existingFieldIds: string[],
) => {
  let index = 1;

  while (existingFieldIds.includes(`${fieldType}${index}`)) {
    index++;
  }

  return `${fieldType}${index}`;
};

const getDefaultLabel = (fieldType: PublicFormField['type']) => {
  switch (fieldType) {
    case 'email':
      return t`Email`;
    case 'phone':
      return t`Phone number`;
    case 'select':
    case 'multiSelect':
      return t`Choose an option`;
    case 'checkbox':
      return t`I agree to the terms`;
    case 'file':
      return t`Upload a file`;
    case 'heading':
      return t`New section`;
    case 'paragraph':
      return t`Add some context for this part of the form.`;
    case 'hidden':
      return t`Source`;
    case 'pageBreak':
      return '';
    default:
      return t`New question`;
  }
};

export const createFormField = (
  fieldType: PublicFormField['type'],
  existingFieldIds: string[],
): PublicFormField => {
  const field: PublicFormField = {
    id: getUniqueFieldId(fieldType, existingFieldIds),
    type: fieldType,
    label: getDefaultLabel(fieldType),
    required: false,
    width: 'full',
    visibleWhenMatch: 'all',
    visibleWhenGroupsMatch: 'any',
    requiredWhenGroupsMatch: 'any',
  };

  if (fieldType === 'select' || fieldType === 'multiSelect') {
    return {
      ...field,
      options: [
        { value: 'OPTION_1', label: t`Option 1` },
        { value: 'OPTION_2', label: t`Option 2` },
      ],
    };
  }

  if (fieldType === 'paragraph') {
    return { ...field, description: field.label, label: t`Text block` };
  }

  if (fieldType === 'hidden') {
    return { ...field, prefillQueryParam: 'utm_source' };
  }

  return field;
};
