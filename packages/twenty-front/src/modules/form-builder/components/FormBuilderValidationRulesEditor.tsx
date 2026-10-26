import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import {
  type PublicFormField,
  type PublicFormValidationRules,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';

const TEXT_TYPES: PublicFormField['type'][] = ['shortText', 'longText'];
const PATTERN_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'phone',
  'email',
  'url',
];

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const toCount = (value: string) => {
  const count = Number(value);

  return value.trim() !== '' && Number.isInteger(count) && count >= 0
    ? count
    : undefined;
};

type FormBuilderValidationRulesEditorProps = {
  field: PublicFormField;
  onChange: (validation: PublicFormValidationRules | undefined) => void;
};

export const FormBuilderValidationRulesEditor = ({
  field,
  onChange,
}: FormBuilderValidationRulesEditorProps) => {
  const rules = field.validation ?? {};

  const update = (changes: Partial<PublicFormValidationRules>) => {
    const next = Object.fromEntries(
      Object.entries({ ...rules, ...changes }).filter(
        ([, value]) => value !== undefined && value !== '',
      ),
    ) as PublicFormValidationRules;

    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  const isText = TEXT_TYPES.includes(field.type);
  const isMultiSelect = field.type === 'multiSelect';
  const isRange = field.type === 'number' || field.type === 'date';
  const inputType = field.type === 'number' ? 'number' : 'text';
  const rangePlaceholder = field.type === 'date' ? 'YYYY-MM-DD' : '';

  return (
    <>
      {(isText || isMultiSelect) && (
        <StyledGrid>
          <FormBuilderFieldRow
            label={isMultiSelect ? t`At least (choices)` : t`Min characters`}
          >
            <FormBuilderTextInput
              type="number"
              min={0}
              dir="ltr"
              value={
                rules.minLength === undefined ? '' : String(rules.minLength)
              }
              onChange={(value) => update({ minLength: toCount(value) })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow
            label={isMultiSelect ? t`At most (choices)` : t`Max characters`}
          >
            <FormBuilderTextInput
              type="number"
              min={0}
              dir="ltr"
              value={
                rules.maxLength === undefined ? '' : String(rules.maxLength)
              }
              onChange={(value) => update({ maxLength: toCount(value) })}
            />
          </FormBuilderFieldRow>
        </StyledGrid>
      )}
      {isRange && (
        <StyledGrid>
          <FormBuilderFieldRow
            label={field.type === 'date' ? t`Earliest date` : t`Minimum`}
          >
            <FormBuilderTextInput
              type={inputType}
              dir="ltr"
              placeholder={rangePlaceholder}
              value={rules.minValue ?? ''}
              onChange={(value) =>
                update({ minValue: value.trim() || undefined })
              }
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow
            label={field.type === 'date' ? t`Latest date` : t`Maximum`}
          >
            <FormBuilderTextInput
              type={inputType}
              dir="ltr"
              placeholder={rangePlaceholder}
              value={rules.maxValue ?? ''}
              onChange={(value) =>
                update({ maxValue: value.trim() || undefined })
              }
            />
          </FormBuilderFieldRow>
        </StyledGrid>
      )}
      {PATTERN_TYPES.includes(field.type) && (
        <StyledGrid>
          <FormBuilderFieldRow
            label={t`Must match (regex)`}
            hint={t`e.g. ^01[0-9]{9}$ for an Egyptian mobile`}
          >
            <FormBuilderTextInput
              dir="ltr"
              value={rules.pattern ?? ''}
              onChange={(pattern) =>
                update({
                  pattern: isNonEmptyString(pattern) ? pattern : undefined,
                })
              }
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow label={t`Error message`}>
            <FormBuilderTextInput
              value={rules.patternMessage ?? ''}
              onChange={(patternMessage) =>
                update({ patternMessage: patternMessage || undefined })
              }
            />
          </FormBuilderFieldRow>
        </StyledGrid>
      )}
    </>
  );
};
