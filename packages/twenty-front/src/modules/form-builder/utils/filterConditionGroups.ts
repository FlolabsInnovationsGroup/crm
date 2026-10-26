import { type PublicFormConditionGroup } from 'twenty-shared/utils';

export const filterConditionGroups = (
  groups: PublicFormConditionGroup[] | undefined,
  isKnownId: (id: string) => boolean,
): PublicFormConditionGroup[] | undefined => {
  const keptGroups = (groups ?? [])
    .map((group) => ({
      ...group,
      conditions: group.conditions.filter((condition) =>
        isKnownId(condition.fieldId),
      ),
    }))
    .filter((group) => group.conditions.length > 0);

  return keptGroups.length > 0 ? keptGroups : undefined;
};
