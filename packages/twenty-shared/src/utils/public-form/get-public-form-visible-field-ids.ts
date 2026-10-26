import { PUBLIC_FORM_ENGINE } from './public-form-engine';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from './public-form-definition-schema';

export const getPublicFormVisibleFieldIds = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): Set<string> =>
  new Set(
    Object.keys(PUBLIC_FORM_ENGINE.evaluate(definition, answers).visible),
  );
