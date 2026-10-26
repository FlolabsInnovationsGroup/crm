import {
  type PublicFormConditionGroup,
  type PublicFormConditionMatch,
  type PublicFormField,
} from 'twenty-shared/utils';

// Forms saved before groups existed keep one flat list, read as one group.
export const getFieldVisibilityGroups = (
  field: PublicFormField,
): {
  groups: PublicFormConditionGroup[];
  groupsMatch: PublicFormConditionMatch;
} => {
  if ((field.visibleWhenGroups ?? []).length > 0) {
    return {
      groups: field.visibleWhenGroups ?? [],
      groupsMatch: field.visibleWhenGroupsMatch,
    };
  }

  const legacyConditions = field.visibleWhen ?? [];

  return {
    groups:
      legacyConditions.length > 0
        ? [{ match: field.visibleWhenMatch, conditions: legacyConditions }]
        : [],
    groupsMatch: 'any',
  };
};
