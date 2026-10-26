import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_ENGINE,
  type PublicFormDefinition,
  type PublicFormVariable,
} from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderLogicCard } from '@/form-builder/components/FormBuilderLogicCard';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { getFormBuilderConditionSources } from '@/form-builder/utils/getFormBuilderConditionSources';
import { getPipingToken } from '@/form-builder/utils/getPipingToken';
import { getUniqueLogicId } from '@/form-builder/utils/getUniqueLogicId';

const NO_INSERT = '';

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledError = styled.p`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const getFormulaError = (
  formula: string,
  knownIds: string[],
): string | null => {
  if (formula.trim() === '') {
    return null;
  }

  const syntaxError = PUBLIC_FORM_ENGINE.parseFormula(formula);

  if (syntaxError !== null) {
    return syntaxError;
  }

  const unknownReference = PUBLIC_FORM_ENGINE.getFormulaReferences(
    formula,
  ).find((reference) => !knownIds.includes(reference));

  return unknownReference === undefined
    ? null
    : t`Unknown question or calculation: ${unknownReference}`;
};

type FormBuilderVariablesEditorProps = {
  definition: PublicFormDefinition;
  onChange: (variables: PublicFormVariable[]) => void;
};

export const FormBuilderVariablesEditor = ({
  definition,
  onChange,
}: FormBuilderVariablesEditorProps) => {
  const variables = definition.variables ?? [];
  const fieldIds = definition.fields.map((field) => field.id);

  const updateVariable = (
    variableIndex: number,
    changes: Partial<PublicFormVariable>,
  ) =>
    onChange(
      variables.map((variable, index) =>
        index === variableIndex ? { ...variable, ...changes } : variable,
      ),
    );

  const handleAdd = () =>
    onChange([
      ...variables,
      {
        id: getUniqueLogicId('score', [
          ...fieldIds,
          ...variables.map((variable) => variable.id),
        ]),
        label: t`Score`,
        formula: '0',
      },
    ]);

  return (
    <StyledList>
      {variables.map((variable, index) => {
        const earlierVariables = variables.slice(0, index);
        const knownIds = [
          ...fieldIds,
          ...earlierVariables.map((earlier) => earlier.id),
        ];
        const formulaError = getFormulaError(variable.formula, knownIds);
        const insertableSources = getFormBuilderConditionSources(
          definition.fields,
          earlierVariables,
        );

        return (
          <FormBuilderLogicCard
            key={variable.id}
            title={variable.label || variable.id}
            onRemove={() =>
              onChange(
                variables.filter((_, otherIndex) => otherIndex !== index),
              )
            }
          >
            <FormBuilderFieldRow
              label={t`Name`}
              hint={t`Use it in texts as ${getPipingToken(variable.id)}`}
            >
              <FormBuilderTextInput
                value={variable.label}
                onChange={(label) => updateVariable(index, { label })}
              />
            </FormBuilderFieldRow>
            <FormBuilderFieldRow label={t`Formula`}>
              <FormBuilderTextarea
                value={variable.formula}
                isMonospace
                maxRows={6}
                ariaLabel={t`Formula`}
                onChange={(formula) => updateVariable(index, { formula })}
              />
            </FormBuilderFieldRow>
            {formulaError !== null && <StyledError>{formulaError}</StyledError>}
            <FormBuilderNativeSelect
              value={NO_INSERT}
              ariaLabel={t`Insert an answer`}
              options={[
                { value: NO_INSERT, label: t`Insert an answer…` },
                ...insertableSources.map((source) => ({
                  value: source.id,
                  label: source.label,
                })),
              ]}
              onChange={(sourceId) =>
                updateVariable(index, {
                  formula: `${variable.formula.trimEnd()} {${sourceId}}`.trim(),
                })
              }
            />
          </FormBuilderLogicCard>
        );
      })}
      <StyledHint>
        {t`Numbers and text, + - * / %, comparisons (= != < > <= >=), and, or, not, condition ? a : b. Functions: if, round, floor, ceil, abs, min, max, sum, len, contains, lower, upper, concat, number, isEmpty, today, daysBetween.`}
      </StyledHint>
      <div>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<IconPlus size={14} />}
          onClick={handleAdd}
        >
          {t`Add calculation`}
        </Button>
      </div>
    </StyledList>
  );
};
