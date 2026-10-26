import { t } from '@lingui/core/macro';
import {
  type PublicFormField,
  type PublicFormVariable,
} from 'twenty-shared/utils';

import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';

const ANSWERABLE_FIELD_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'time',
  'select',
  'multiSelect',
  'yesNo',
  'rating',
  'scale',
  'slider',
  'matrix',
  'checkbox',
  'consent',
  'address',
  'hidden',
];

export const getFormBuilderConditionSources = (
  fields: PublicFormField[],
  variables: PublicFormVariable[] = [],
): FormBuilderConditionSource[] => [
  ...fields
    .filter((field) => ANSWERABLE_FIELD_TYPES.includes(field.type))
    .map((field) => ({
      id: field.id,
      label: field.label || field.id,
      fieldType: field.type,
      // Matrix rows are not answers; their columns are.
      options: field.type === 'matrix' ? field.columns : field.options,
    })),
  ...variables.map((variable) => ({
    id: variable.id,
    label: t`Calculation: ${variable.label || variable.id}`,
    fieldType: 'variable' as const,
  })),
];
