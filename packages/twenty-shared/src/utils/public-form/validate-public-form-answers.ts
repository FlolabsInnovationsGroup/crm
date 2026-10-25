import { isPublicFormFieldVisible } from './is-public-form-field-visible';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
  type PublicFormField,
} from './public-form-definition-schema';

export type PublicFormValidationError = {
  fieldId: string;
  message: string;
};

const NON_INPUT_FIELD_TYPES: PublicFormField['type'][] = [
  'heading',
  'paragraph',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9 ()./-]{6,25}$/;
const URL_PATTERN = /^https?:\/\/\S+\.\S+$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isEmptyAnswer = (answer: PublicFormAnswers[string] | undefined) =>
  answer === undefined ||
  answer === false ||
  (typeof answer === 'string' && answer.trim() === '') ||
  (Array.isArray(answer) && answer.length === 0);

const validateFieldFormat = (
  field: PublicFormField,
  answer: PublicFormAnswers[string],
): string | null => {
  const optionValues = (field.options ?? []).map((option) => option.value);

  switch (field.type) {
    case 'email':
      return typeof answer === 'string' && EMAIL_PATTERN.test(answer.trim())
        ? null
        : 'Enter a valid email address';
    case 'phone':
      return typeof answer === 'string' && PHONE_PATTERN.test(answer.trim())
        ? null
        : 'Enter a valid phone number';
    case 'url':
      return typeof answer === 'string' && URL_PATTERN.test(answer.trim())
        ? null
        : 'Enter a valid link starting with http:// or https://';
    case 'number':
      return typeof answer === 'string' && !Number.isNaN(Number(answer))
        ? null
        : 'Enter a number';
    case 'date':
      return typeof answer === 'string' && DATE_PATTERN.test(answer)
        ? null
        : 'Enter a valid date';
    case 'select':
      return typeof answer === 'string' && optionValues.includes(answer)
        ? null
        : 'Choose one of the options';
    case 'multiSelect':
      return Array.isArray(answer) &&
        answer.every((value) => optionValues.includes(value))
        ? null
        : 'Choose from the listed options';
    default:
      return null;
  }
};

// Hidden fields are ignored, so a required field behind an unmet condition
// never blocks the submission. Files are validated where they are received.
export const validatePublicFormAnswers = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): PublicFormValidationError[] =>
  definition.fields.flatMap((field) => {
    if (
      NON_INPUT_FIELD_TYPES.includes(field.type) ||
      field.type === 'file' ||
      !isPublicFormFieldVisible(field, answers)
    ) {
      return [];
    }

    const answer = answers[field.id];

    if (answer === undefined || isEmptyAnswer(answer)) {
      return field.required
        ? [{ fieldId: field.id, message: 'This field is required' }]
        : [];
    }

    const formatError = validateFieldFormat(field, answer);

    return formatError === null
      ? []
      : [{ fieldId: field.id, message: formatError }];
  });
