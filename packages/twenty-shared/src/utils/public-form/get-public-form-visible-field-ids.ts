import { isPublicFormFieldVisible } from './is-public-form-field-visible';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from './public-form-definition-schema';

// Walks the fields in order so a hidden field's answer is ignored by the
// fields that depend on it; conditions may only point at earlier fields.
// A hidden page break hides its whole page, a hidden heading its section.
export const getPublicFormVisibleFieldIds = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
): Set<string> => {
  const visibleAnswers: PublicFormAnswers = {};
  const visibleFieldIds = new Set<string>();
  let isPageHidden = false;
  let isSectionHidden = false;

  for (const field of definition.fields) {
    if (field.type === 'pageBreak') {
      isSectionHidden = false;
      isPageHidden = !isPublicFormFieldVisible(field, visibleAnswers);
    } else if (field.type === 'heading') {
      isSectionHidden =
        isPageHidden || !isPublicFormFieldVisible(field, visibleAnswers);
    }

    const isHiddenByContainer =
      field.type === 'pageBreak'
        ? isPageHidden
        : isPageHidden || isSectionHidden;

    if (
      isHiddenByContainer ||
      !isPublicFormFieldVisible(field, visibleAnswers)
    ) {
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
