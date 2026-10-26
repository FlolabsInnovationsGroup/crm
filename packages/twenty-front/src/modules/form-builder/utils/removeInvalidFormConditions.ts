import { type PublicFormField } from 'twenty-shared/utils';

import { filterConditionGroups as keepConditions } from '@/form-builder/utils/filterConditionGroups';

// Visibility may only depend on earlier fields (or calculations), so moving
// or deleting a field drops the conditions it would break.
export const removeInvalidFormConditions = (
  fields: PublicFormField[],
  variableIds: string[] = [],
): PublicFormField[] => {
  const allFieldIds = fields.map((field) => field.id);

  return fields.map((field, fieldIndex) => {
    const earlierFieldIds = allFieldIds.slice(0, fieldIndex);
    const isEarlierOrVariable = (id: string) =>
      earlierFieldIds.includes(id) || variableIds.includes(id);
    const isOtherFieldOrVariable = (id: string) =>
      (id !== field.id && allFieldIds.includes(id)) || variableIds.includes(id);
    const visibleWhen = (field.visibleWhen ?? []).filter((condition) =>
      isEarlierOrVariable(condition.fieldId),
    );

    return {
      ...field,
      visibleWhen: visibleWhen.length > 0 ? visibleWhen : undefined,
      visibleWhenGroups: keepConditions(
        field.visibleWhenGroups,
        isEarlierOrVariable,
      ),
      requiredWhenGroups: keepConditions(
        field.requiredWhenGroups,
        isOtherFieldOrVariable,
      ),
    };
  });
};
