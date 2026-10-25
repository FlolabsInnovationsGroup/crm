import { isPublicFormFieldVisible } from './is-public-form-field-visible';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from './public-form-definition-schema';

type RecordValues = Record<string, unknown>;

const MAP_TO_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)?$/;

export const isValidPublicFormMapTo = (mapTo: string): boolean =>
  MAP_TO_PATTERN.test(mapTo);

const normalizeAnswer = (
  type: PublicFormDefinition['fields'][number]['type'],
  answer: PublicFormAnswers[string],
): unknown => {
  if (type === 'number' && typeof answer === 'string') {
    return Number(answer);
  }

  if (typeof answer === 'string') {
    return answer.trim();
  }

  return answer;
};

// Builds the values to write on the target record, e.g.
// `{ name: { firstName: 'Ada' }, country: 'Egypt' }`. Hidden, unmapped and
// empty answers are skipped so they never overwrite existing data.
export const buildPublicFormRecordValues = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): RecordValues => {
  const values: RecordValues = {};

  for (const field of definition.fields) {
    const answer = answers[field.id];

    if (
      field.mapTo === undefined ||
      !isValidPublicFormMapTo(field.mapTo) ||
      field.type === 'file' ||
      answer === undefined ||
      (typeof answer === 'string' && answer.trim() === '') ||
      !isPublicFormFieldVisible(field, answers)
    ) {
      continue;
    }

    const [fieldName = '', subFieldName] = field.mapTo.split('.');
    const value = normalizeAnswer(field.type, answer);

    if (subFieldName === undefined) {
      values[fieldName] = value;
      continue;
    }

    const existing = values[fieldName];
    const composite =
      typeof existing === 'object' && existing !== null
        ? (existing as RecordValues)
        : {};

    values[fieldName] = { ...composite, [subFieldName]: value };
  }

  return values;
};
