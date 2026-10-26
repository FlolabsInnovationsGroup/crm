import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  type PublicFormConditionGroup,
  type PublicFormConditionMatch,
} from 'twenty-shared/utils';
import { IconPlus, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderConditionsEditor } from '@/form-builder/components/FormBuilderConditionsEditor';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';
import { createDefaultCondition } from '@/form-builder/utils/createDefaultCondition';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledGroup = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledGroupHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  justify-content: space-between;
  text-transform: uppercase;
`;

const StyledJoiner = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-align: center;
`;

const StyledFooter = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

type FormBuilderConditionGroupsEditorProps = {
  groups: PublicFormConditionGroup[];
  groupsMatch: PublicFormConditionMatch;
  sources: FormBuilderConditionSource[];
  addLabel: string;
  emptyHint: string;
  onChange: (
    groups: PublicFormConditionGroup[],
    groupsMatch: PublicFormConditionMatch,
  ) => void;
};

export const FormBuilderConditionGroupsEditor = ({
  groups,
  groupsMatch,
  sources,
  addLabel,
  emptyHint,
  onChange,
}: FormBuilderConditionGroupsEditorProps) => {
  if (sources.length === 0) {
    return <StyledHint>{emptyHint}</StyledHint>;
  }

  const updateGroup = (
    groupIndex: number,
    group: PublicFormConditionGroup | null,
  ) => {
    const nextGroups =
      group === null || group.conditions.length === 0
        ? groups.filter((_, index) => index !== groupIndex)
        : groups.map((current, index) =>
            index === groupIndex ? group : current,
          );

    onChange(nextGroups, groupsMatch);
  };

  const addGroup = () =>
    onChange(
      [
        ...groups,
        { match: 'all', conditions: [createDefaultCondition(sources)] },
      ],
      groupsMatch,
    );

  const joinerLabel = groupsMatch === 'all' ? t`AND` : t`OR`;

  return (
    <StyledContainer>
      {groups.map((group, groupIndex) => (
        <StyledContainer key={groupIndex}>
          {groupIndex > 0 && <StyledJoiner>{joinerLabel}</StyledJoiner>}
          <StyledGroup>
            {groups.length > 1 && (
              <StyledGroupHeader>
                <span>{t`Group ${groupIndex + 1}`}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t`Remove group`}
                  startIcon={<IconTrash size={14} />}
                  onClick={() => updateGroup(groupIndex, null)}
                />
              </StyledGroupHeader>
            )}
            <FormBuilderConditionsEditor
              conditions={group.conditions}
              match={group.match}
              sources={sources}
              onChange={(conditions) =>
                updateGroup(groupIndex, { ...group, conditions })
              }
              onMatchChange={(match) =>
                updateGroup(groupIndex, { ...group, match })
              }
            />
          </StyledGroup>
        </StyledContainer>
      ))}
      <StyledFooter>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<IconPlus size={14} />}
          onClick={addGroup}
        >
          {groups.length === 0 ? addLabel : t`Add another group`}
        </Button>
        {groups.length > 1 && (
          <FormBuilderNativeSelect
            value={groupsMatch}
            ariaLabel={t`Groups match`}
            options={[
              { value: 'any', label: t`Any group is true (OR)` },
              { value: 'all', label: t`Every group is true (AND)` },
            ]}
            onChange={(value) =>
              onChange(groups, value as PublicFormConditionMatch)
            }
          />
        )}
      </StyledFooter>
    </StyledContainer>
  );
};
