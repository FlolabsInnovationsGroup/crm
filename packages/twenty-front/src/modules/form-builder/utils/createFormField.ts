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
    case 'consent':
      return t`I accept the [privacy policy](https://example.com/privacy)`;
    case 'yesNo':
      return t`Are you available full time?`;
    case 'rating':
      return t`How would you rate us?`;
    case 'scale':
      return t`How likely are you to recommend us?`;
    case 'slider':
      return t`How many hours per week can you work?`;
    case 'matrix':
      return t`Rate your skills`;
    case 'address':
      return t`Address`;
    case 'time':
      return t`Preferred time`;
    case 'signature':
      return t`Signature`;
    case 'file':
      return t`Upload a file`;
    case 'heading':
      return t`New section`;
    case 'paragraph':
      return t`Add some context for this part of the form.`;
    case 'image':
      return t`Image`;
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
    choiceDisplay: 'auto',
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

  if (fieldType === 'yesNo') {
    return {
      ...field,
      width: 'half',
      options: [
        { value: 'true', label: t`Yes` },
        { value: 'false', label: t`No` },
      ],
    };
  }

  if (fieldType === 'rating') {
    return { ...field, scaleMax: 5 };
  }

  if (fieldType === 'scale') {
    return {
      ...field,
      scaleMin: 1,
      scaleMax: 5,
      minLabel: t`Not likely`,
      maxLabel: t`Very likely`,
    };
  }

  if (fieldType === 'slider') {
    return { ...field, scaleMin: 0, scaleMax: 40, scaleStep: 1 };
  }

  if (fieldType === 'matrix') {
    return {
      ...field,
      options: [
        { value: 'ROW_1', label: t`Communication` },
        { value: 'ROW_2', label: t`Teamwork` },
      ],
      columns: [
        { value: 'LOW', label: t`Beginner` },
        { value: 'MEDIUM', label: t`Intermediate` },
        { value: 'HIGH', label: t`Expert` },
      ],
    };
  }

  if (fieldType === 'consent') {
    return { ...field, required: true };
  }

  if (fieldType === 'paragraph') {
    return { ...field, description: field.label, label: t`Text block` };
  }

  if (fieldType === 'hidden') {
    return { ...field, prefillQueryParam: 'utm_source' };
  }

  return field;
};
