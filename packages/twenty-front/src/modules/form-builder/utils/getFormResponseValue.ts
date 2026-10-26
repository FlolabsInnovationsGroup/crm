import {
  PUBLIC_FORM_ENGINE,
  type PublicFormAnswers,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

// Stored answers hold calculated values next to the questions, so one map
// serves both lookups.
export const getFormResponseValue = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
  id: string,
) =>
  PUBLIC_FORM_ENGINE.interpolate(`{{${id}}}`, definition, {
    visible: {},
    visibleAnswers: answers,
    variables: answers,
  });
