import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type PublicFormField } from 'twenty-shared/utils';
import { IconPlus, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { getOptionValueFromLabel } from '@/form-builder/utils/getOptionValueFromLabel';

type FormFieldOption = NonNullable<PublicFormField['options']>[number];

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledOptionRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1fr) auto;
`;

const StyledOptionValue = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
`;

type FormBuilderOptionsEditorProps = {
  options: FormFieldOption[];
  areValuesLocked: boolean;
  onChange: (options: FormFieldOption[]) => void;
};

const getUniqueValue = (value: string, otherValues: string[]) => {
  let candidate = value;
  let index = 2;

  while (otherValues.includes(candidate)) {
    candidate = `${value}_${index}`;
    index++;
  }

  return candidate;
};

// When the answer goes to a CRM select field, option values are the CRM
// keys and only the labels shown to visitors can change.
export const FormBuilderOptionsEditor = ({
  options,
  areValuesLocked,
  onChange,
}: FormBuilderOptionsEditorProps) => {
  const handleLabelChange = (optionIndex: number, label: string) => {
    onChange(
      options.map((option, index) => {
        if (index !== optionIndex) {
          return option;
        }

        if (areValuesLocked) {
          return { ...option, label };
        }

        const otherValues = options
          .filter((_, otherIndex) => otherIndex !== optionIndex)
          .map((otherOption) => otherOption.value);

        return {
          label,
          value: getUniqueValue(
            getOptionValueFromLabel(label, `OPTION_${optionIndex + 1}`),
            otherValues,
          ),
        };
      }),
    );
  };

  const handleAddOption = () => {
    const label = t`Option ${options.length + 1}`;
    const value = getUniqueValue(
      getOptionValueFromLabel(label, `OPTION_${options.length + 1}`),
      options.map((option) => option.value),
    );

    onChange([...options, { value, label }]);
  };

  const handleRemoveOption = (optionIndex: number) => {
    onChange(options.filter((_, index) => index !== optionIndex));
  };

  return (
    <StyledList>
      {options.map((option, index) => (
        <StyledOptionRow key={index}>
          <div>
            <FormBuilderTextInput
              value={option.label}
              ariaLabel={t`Option label`}
              onChange={(label) => handleLabelChange(index, label)}
            />
            <StyledOptionValue>{option.value}</StyledOptionValue>
          </div>
          {!areValuesLocked && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t`Remove option`}
              startIcon={<IconTrash size={14} />}
              disabled={options.length <= 1}
              onClick={() => handleRemoveOption(index)}
            />
          )}
        </StyledOptionRow>
      ))}
      {!areValuesLocked && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            startIcon={<IconPlus size={14} />}
            onClick={handleAddOption}
          >
            {t`Add option`}
          </Button>
        </div>
      )}
    </StyledList>
  );
};
