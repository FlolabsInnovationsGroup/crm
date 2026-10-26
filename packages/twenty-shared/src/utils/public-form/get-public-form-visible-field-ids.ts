import { isPublicFormFieldVisible } from './is-public-form-field-visible';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from './public-form-definition-schema';

// Walks the fields in order so a hidden field's answer is ignored by the
// fields that depend on it; conditions may only point at earlier fields.
export const getPublicFormVisibleFieldIds = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): Set<string> => {
  const visibleAnswers: PublicFormAnswers = {};
  const visibleFieldIds = new Set<string>();

  for (const field of definition.fields) {
    if (!isPublicFormFieldVisible(field, visibleAnswers)) {
      continue;
    }

    visibleFieldIds.add(field.id);

    const answer = answers[field.id];

    if (answer !== undefined) {
      visibleAnswers[field.id] = answer;
    }
  }

  return visibleFieldIds;
};
