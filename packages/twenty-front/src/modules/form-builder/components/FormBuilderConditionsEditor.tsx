import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { i18n } from '@lingui/core';
import {
  PUBLIC_FORM_CONDITION_OPERATORS,
  type PublicFormCondition,
  type PublicFormField,
} from 'twenty-shared/utils';
import { IconPlus, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { FORM_BUILDER_CONDITION_OPERATOR_LABELS } from '@/form-builder/constants/FormBuilderConditionOperatorLabels';

const VALUELESS_OPERATORS: PublicFormCondition['operator'][] = [
  'isEmpty',
  'isNotEmpty',
];

const ANSWERABLE_FIELD_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'select',
  'multiSelect',
  'checkbox',
  'hidden',
];

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledConditionRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.2fr) auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledMatchRow = styled.div`
  max-width: 240px;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

type FormBuilderConditionsEditorProps = {
  conditions: PublicFormCondition[];
  match: PublicFormField['visibleWhenMatch'];
  previousFields: PublicFormField[];
  onChange: (conditions: PublicFormCondition[]) => void;
  onMatchChange: (match: PublicFormField['visibleWhenMatch']) => void;
};

export const FormBuilderConditionsEditor = ({
  conditions,
  match,
  previousFields,
  onChange,
  onMatchChange,
}: FormBuilderConditionsEditorProps) => {
  const sourceFields = previousFields.filter((field) =>
    ANSWERABLE_FIELD_TYPES.includes(field.type),
  );

  if (sourceFields.length === 0) {
    return (
      <StyledHint>
        {t`Add a question above this one to show it only for some answers.`}
      </StyledHint>
    );
  }

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

  const handleSourceFieldChange = (conditionIndex: number, fieldId: string) => {
    const sourceField = sourceFields.find((field) => field.id === fieldId);
    const firstOptionValue = sourceField?.options?.[0]?.value;

    updateCondition(conditionIndex, {
      fieldId,
      value:
        sourceField?.type === 'checkbox' ? 'true' : (firstOptionValue ?? ''),
    });
  };

  const handleAddCondition = () => {
    const lastField = sourceFields[sourceFields.length - 1];

    onChange([
      ...conditions,
      {
        fieldId: lastField.id,
        operator: 'equals',
        value:
          lastField.type === 'checkbox'
            ? 'true'
            : (lastField.options?.[0]?.value ?? ''),
      },
    ]);
  };

  const renderValueInput = (
    condition: PublicFormCondition,
    conditionIndex: number,
  ) => {
    if (VALUELESS_OPERATORS.includes(condition.operator)) {
      return <span />;
    }

    const sourceField = sourceFields.find(
      (field) => field.id === condition.fieldId,
    );

    if (sourceField?.type === 'checkbox') {
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
      (sourceField?.type === 'select' || sourceField?.type === 'multiSelect') &&
      (condition.operator === 'equals' || condition.operator === 'notEquals')
    ) {
      return (
        <FormBuilderNativeSelect
          value={condition.value ?? ''}
          ariaLabel={t`Value`}
          options={(sourceField.options ?? []).map((option) => ({
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
        placeholder={t`Value`}
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
              onMatchChange(value as PublicFormField['visibleWhenMatch'])
            }
          />
        </StyledMatchRow>
      )}
      {conditions.map((condition, index) => (
        <StyledConditionRow key={index}>
          <FormBuilderNativeSelect
            value={condition.fieldId}
            ariaLabel={t`Question`}
            options={sourceFields.map((field) => ({
              value: field.id,
              label: field.label || field.id,
            }))}
            onChange={(fieldId) => handleSourceFieldChange(index, fieldId)}
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
          onClick={handleAddCondition}
        >
          {conditions.length === 0 ? t`Show only when…` : t`Add condition`}
        </Button>
      </div>
    </StyledList>
  );
};
