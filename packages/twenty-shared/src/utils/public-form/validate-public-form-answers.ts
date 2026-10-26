import { formatPublicFormError } from './format-public-form-error';
import { PUBLIC_FORM_ENGINE } from './public-form-engine';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from './public-form-definition-schema';
import { PUBLIC_FORM_PAGE_MESSAGES } from './public-form-page-messages';

export type PublicFormValidationError = {
  fieldId: string;
  code: string;
  params?: Record<string, string>;
  message: string;
};

// Hidden fields are ignored, so a required field behind an unmet condition
// never blocks the submission. Files are validated where they are received.
export const validatePublicFormAnswers = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): PublicFormValidationError[] => {
  const evaluation = PUBLIC_FORM_ENGINE.evaluate(definition, answers);

  return definition.fields.flatMap((field) => {
    if (field.type === 'file' || evaluation.visible[field.id] !== true) {
      return [];
    }

    const error = PUBLIC_FORM_ENGINE.validateValue(
      field,
      answers[field.id],
      PUBLIC_FORM_ENGINE.isFieldRequired(field, evaluation),
    );

    return error === null
      ? []
      : [
          {
            fieldId: field.id,
            code: error.code,
            ...(error.params === undefined ? {} : { params: error.params }),
            message: formatPublicFormError(error, PUBLIC_FORM_PAGE_MESSAGES.en),
          },
        ];
  });
};
