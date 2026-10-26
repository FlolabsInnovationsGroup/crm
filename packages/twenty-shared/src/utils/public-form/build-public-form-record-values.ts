import {
  PUBLIC_FORM_ENGINE,
  type PublicFormEvaluation,
} from './public-form-engine';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
  type PublicFormField,
} from './public-form-definition-schema';

type RecordValues = Record<string, unknown>;

const MAP_TO_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)?$/;

export const isValidPublicFormMapTo = (mapTo: string): boolean =>
  MAP_TO_PATTERN.test(mapTo);

const NUMERIC_TYPES: PublicFormField['type'][] = [
  'number',
  'rating',
  'scale',
  'slider',
];

const ADDRESS_SUB_FIELDS = [
  'addressStreet1',
  'addressCity',
  'addressState',
  'addressPostcode',
  'addressCountry',
];

const normalizeAnswer = (
  definition: PublicFormDefinition,
  field: PublicFormField,
  answer: PublicFormAnswers[string],
  evaluation: PublicFormEvaluation,
): unknown => {
  if (NUMERIC_TYPES.includes(field.type) && typeof answer === 'string') {
    return Number(answer);
  }

  // A yes/no question mapped to a CRM boolean uses "true"/"false" values.
  if (field.type === 'yesNo' && (answer === 'true' || answer === 'false')) {
    return answer === 'true';
  }

  if (field.type === 'address' && Array.isArray(answer)) {
    return Object.fromEntries(
      ADDRESS_SUB_FIELDS.map((subField, index) => [
        subField,
        (answer[index] ?? '').trim(),
      ]),
    );
  }

  if (field.type === 'matrix') {
    return PUBLIC_FORM_ENGINE.interpolate(
      `{{${field.id}}}`,
      definition,
      evaluation,
    );
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
  const evaluation = PUBLIC_FORM_ENGINE.evaluate(definition, answers);
  const { visible } = evaluation;

  for (const field of definition.fields) {
    const answer = answers[field.id];

    if (
      field.mapTo === undefined ||
      !isValidPublicFormMapTo(field.mapTo) ||
      field.type === 'file' ||
      field.type === 'signature' ||
      answer === undefined ||
      (typeof answer === 'string' && answer.trim() === '') ||
      visible[field.id] !== true
    ) {
      continue;
    }

    const [fieldName = '', subFieldName] = field.mapTo.split('.');
    const value = normalizeAnswer(definition, field, answer, evaluation);

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
