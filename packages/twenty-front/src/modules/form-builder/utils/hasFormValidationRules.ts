import { type PublicFormField } from 'twenty-shared/utils';

const FIELD_TYPES_WITH_RULES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'phone',
  'email',
  'url',
  'number',
  'date',
  'multiSelect',
];

export const hasFormValidationRules = (fieldType: PublicFormField['type']) =>
  FIELD_TYPES_WITH_RULES.includes(fieldType);
