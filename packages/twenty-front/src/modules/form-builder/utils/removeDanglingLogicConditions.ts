import { type PublicFormDefinition } from 'twenty-shared/utils';

import { filterConditionGroups } from '@/form-builder/utils/filterConditionGroups';

// Endings and after-submit steps may test any question or calculation; once
// one is deleted, the conditions pointing at it go too.
export const removeDanglingLogicConditions = (
  definition: PublicFormDefinition,
): PublicFormDefinition => {
  if (
    (definition.endings ?? []).length === 0 &&
    (definition.actions ?? []).length === 0
  ) {
    return definition;
  }

  const knownIds = new Set([
    ...definition.fields.map((field) => field.id),
    ...(definition.variables ?? []).map((variable) => variable.id),
  ]);
  const isKnownId = (id: string) => knownIds.has(id);

  return {
    ...definition,
    endings: definition.endings?.map((ending) => ({
      ...ending,
      when: filterConditionGroups(ending.when, isKnownId),
    })),
    actions: definition.actions?.map((action) => ({
      ...action,
      when: filterConditionGroups(action.when, isKnownId),
    })),
  };
};
