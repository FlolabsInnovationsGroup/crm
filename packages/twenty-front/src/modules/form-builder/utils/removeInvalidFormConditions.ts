import { type PublicFormField } from 'twenty-shared/utils';

// Conditions may only depend on earlier fields, so moving or deleting a field
// drops the conditions it would break.
export const removeInvalidFormConditions = (
  fields: PublicFormField[],
): PublicFormField[] =>
  fields.map((field, fieldIndex) => {
    if ((field.visibleWhen ?? []).length === 0) {
      return field;
    }

    const earlierFieldIds = fields
      .slice(0, fieldIndex)
      .map((earlierField) => earlierField.id);
    const visibleWhen = (field.visibleWhen ?? []).filter((condition) =>
      earlierFieldIds.includes(condition.fieldId),
    );

    return {
      ...field,
      visibleWhen: visibleWhen.length > 0 ? visibleWhen : undefined,
    };
  });
