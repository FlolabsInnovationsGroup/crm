import {
  type PublicFormAnswers,
  type PublicFormCondition,
  type PublicFormField,
} from './public-form-definition-schema';

const toComparableValues = (
  answer: PublicFormAnswers[string] | undefined,
): string[] => {
  if (Array.isArray(answer)) {
    return answer;
  }

  if (typeof answer === 'boolean') {
    return answer ? ['true'] : [];
  }

  if (typeof answer === 'string' && answer.trim() !== '') {
    return [answer.trim()];
  }

  return [];
};

const isConditionMet = (
  condition: PublicFormCondition,
  answers: PublicFormAnswers,
): boolean => {
  const values = toComparableValues(answers[condition.fieldId]);
  const expected = (condition.value ?? '').trim().toLowerCase();
  const normalizedValues = values.map((value) => value.toLowerCase());

  switch (condition.operator) {
    case 'equals':
      return normalizedValues.includes(expected);
    case 'notEquals':
      return !normalizedValues.includes(expected);
    case 'contains':
      return normalizedValues.some((value) => value.includes(expected));
    case 'notContains':
      return !normalizedValues.some((value) => value.includes(expected));
    case 'isEmpty':
      return values.length === 0;
    case 'isNotEmpty':
      return values.length > 0;
  }
};

// All conditions must hold (AND). A field without conditions is visible.
export const isPublicFormFieldVisible = (
  field: PublicFormField,
  answers: PublicFormAnswers,
): boolean =>
  (field.visibleWhen ?? []).every((condition) =>
    isConditionMet(condition, answers),
  );
