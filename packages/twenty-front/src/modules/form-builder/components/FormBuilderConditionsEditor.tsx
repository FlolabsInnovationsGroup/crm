import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { i18n } from '@lingui/core';
import {
  PUBLIC_FORM_CONDITION_OPERATORS,
  type PublicFormCondition,
  type PublicFormConditionMatch,
} from 'twenty-shared/utils';
import { IconPlus, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { FORM_BUILDER_CONDITION_OPERATOR_LABELS } from '@/form-builder/constants/FormBuilderConditionOperatorLabels';
import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';
import {
  createDefaultCondition,
  getDefaultConditionValue,
} from '@/form-builder/utils/createDefaultCondition';

const VALUELESS_OPERATORS: PublicFormCondition['operator'][] = [
  'isEmpty',
  'isNotEmpty',
];

const OPTION_OPERATORS: PublicFormCondition['operator'][] = [
  'equals',
  'notEquals',
];

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledConditionRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.2fr) auto;
`;

const StyledMatchRow = styled.div`
  max-width: 240px;
`;

type FormBuilderConditionsEditorProps = {
  conditions: PublicFormCondition[];
  match: PublicFormConditionMatch;
  sources: FormBuilderConditionSource[];
  onChange: (conditions: PublicFormCondition[]) => void;
  onMatchChange: (match: PublicFormConditionMatch) => void;
};

export const FormBuilderConditionsEditor = ({
  conditions,
  match,
  sources,
  onChange,
  onMatchChange,
}: FormBuilderConditionsEditorProps) => {
  const updateCondition = (
    conditionIndex: number,
    update: Partial<PublicFormCondition>,
  ) => {
    onChange(
      conditions.map((condition, index) =>
        index === conditionIndex ? { ...condition, ...update } : condition,
      ),
    );
  };

  const handleSourceChange = (conditionIndex: number, sourceId: string) => {
    updateCondition(conditionIndex, {
      fieldId: sourceId,
      value: getDefaultConditionValue(
        sources.find((source) => source.id === sourceId),
      ),
    });
  };

  const renderValueInput = (
    condition: PublicFormCondition,
    conditionIndex: number,
  ) => {
    if (VALUELESS_OPERATORS.includes(condition.operator)) {
      return <span />;
    }

    const source = sources.find(
      (candidate) => candidate.id === condition.fieldId,
    );

    if (source?.fieldType === 'checkbox' || source?.fieldType === 'consent') {
      return (
        <FormBuilderNativeSelect
          value={condition.value ?? 'true'}
          ariaLabel={t`Value`}
          options={[
            { value: 'true', label: t`Checked` },
            { value: '', label: t`Not checked` },
          ]}
          onChange={(value) => updateCondition(conditionIndex, { value })}
        />
      );
    }

    if (
      (source?.options ?? []).length > 0 &&
      OPTION_OPERATORS.includes(condition.operator)
    ) {
      return (
        <FormBuilderNativeSelect
          value={condition.value ?? ''}
          ariaLabel={t`Value`}
          options={(source?.options ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(value) => updateCondition(conditionIndex, { value })}
        />
      );
    }

    return (
      <FormBuilderTextInput
        value={condition.value ?? ''}
        ariaLabel={t`Value`}
        placeholder={condition.operator === 'isAnyOf' ? t`a, b, c` : t`Value`}
        onChange={(value) => updateCondition(conditionIndex, { value })}
      />
    );
  };

  return (
    <StyledList>
      {conditions.length > 1 && (
        <StyledMatchRow>
          <FormBuilderNativeSelect
            value={match}
            ariaLabel={t`Match`}
            options={[
              { value: 'all', label: t`All of these are true` },
              { value: 'any', label: t`Any of these is true` },
            ]}
            onChange={(value) =>
              onMatchChange(value as PublicFormConditionMatch)
            }
          />
        </StyledMatchRow>
      )}
      {conditions.map((condition, index) => (
        <StyledConditionRow key={index}>
          <FormBuilderNativeSelect
            value={condition.fieldId}
            ariaLabel={t`Question`}
            options={[
              ...sources.map((source) => ({
                value: source.id,
                label: source.label,
              })),
              ...(sources.some((source) => source.id === condition.fieldId)
                ? []
                : [{ value: condition.fieldId, label: condition.fieldId }]),
            ]}
            onChange={(sourceId) => handleSourceChange(index, sourceId)}
          />
          <FormBuilderNativeSelect
            value={condition.operator}
            ariaLabel={t`Operator`}
            options={PUBLIC_FORM_CONDITION_OPERATORS.map((operator) => ({
              value: operator,
              label: i18n._(FORM_BUILDER_CONDITION_OPERATOR_LABELS[operator]),
            }))}
            onChange={(operator) =>
              updateCondition(index, {
                operator: operator as PublicFormCondition['operator'],
              })
            }
          />
          {renderValueInput(condition, index)}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Remove condition`}
            startIcon={<IconTrash size={14} />}
            onClick={() =>
              onChange(
                conditions.filter(
                  (_, conditionIndex) => conditionIndex !== index,
                ),
              )
            }
          />
        </StyledConditionRow>
      ))}
      <div>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<IconPlus size={14} />}
          onClick={() =>
            onChange([...conditions, createDefaultCondition(sources)])
          }
        >
          {t`Add condition`}
        </Button>
      </div>
    </StyledList>
  );
};
