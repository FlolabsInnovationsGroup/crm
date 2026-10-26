import { type PublicFormCondition } from 'twenty-shared/utils';

import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';

export const getDefaultConditionValue = (
  source: FormBuilderConditionSource | undefined,
) =>
  source?.fieldType === 'checkbox' || source?.fieldType === 'consent'
    ? 'true'
    : (source?.options?.[0]?.value ?? '');

export const createDefaultCondition = (
  sources: FormBuilderConditionSource[],
): PublicFormCondition => {
  const lastSource = sources[sources.length - 1];

  return {
    fieldId: lastSource?.id ?? '',
    operator: 'equals',
    value: getDefaultConditionValue(lastSource),
  };
};
