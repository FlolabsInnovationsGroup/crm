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
    case 'greaterThan':
      return values.some((value) => compareAnswers(value, expected) > 0);
    case 'lessThan':
      return values.some((value) => compareAnswers(value, expected) < 0);
  }
};

// Numbers compare numerically; anything else (e.g. YYYY-MM-DD dates)
// compares as text, which orders ISO dates correctly.
const compareAnswers = (value: string, expected: string): number => {
  const numericValue = Number(value);
  const numericExpected = Number(expected);

  if (
    value.trim() !== '' &&
    expected !== '' &&
    !Number.isNaN(numericValue) &&
    !Number.isNaN(numericExpected)
  ) {
    return numericValue - numericExpected;
  }

  return value.toLowerCase().localeCompare(expected);
};

// A field without conditions is visible; `visibleWhenMatch` picks AND or OR.
export const isPublicFormFieldVisible = (
  field: PublicFormField,
  answers: PublicFormAnswers,
): boolean => {
  const conditions = field.visibleWhen ?? [];

  if (conditions.length === 0) {
    return true;
  }

  const isMet = (condition: PublicFormCondition) =>
    isConditionMet(condition, answers);

  return field.visibleWhenMatch === 'any'
    ? conditions.some(isMet)
    : conditions.every(isMet);
};
