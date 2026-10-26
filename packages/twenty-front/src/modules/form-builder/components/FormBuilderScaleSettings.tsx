import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type PublicFormField } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const toNumberOrUndefined = (value: string) => {
  const number = Number(value);

  return value.trim() !== '' && Number.isFinite(number) ? number : undefined;
};

const toIntegerOrUndefined = (value: string) => {
  const number = toNumberOrUndefined(value);

  return number === undefined ? undefined : Math.round(number);
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => {
    const value = String(from + index);

    return { value, label: value };
  });

type FormBuilderScaleSettingsProps = {
  field: PublicFormField;
  onChange: (changes: Partial<PublicFormField>) => void;
};

export const FormBuilderScaleSettings = ({
  field,
  onChange,
}: FormBuilderScaleSettingsProps) => {
  const labels = (
    <StyledGrid>
      <FormBuilderFieldRow label={t`Label at the start`}>
        <FormBuilderTextInput
          value={field.minLabel ?? ''}
          onChange={(minLabel) => onChange({ minLabel: minLabel || undefined })}
        />
      </FormBuilderFieldRow>
      <FormBuilderFieldRow label={t`Label at the end`}>
        <FormBuilderTextInput
          value={field.maxLabel ?? ''}
          onChange={(maxLabel) => onChange({ maxLabel: maxLabel || undefined })}
        />
      </FormBuilderFieldRow>
    </StyledGrid>
  );

  if (field.type === 'rating') {
    return (
      <FormBuilderFieldRow label={t`Number of stars`}>
        <FormBuilderNativeSelect
          value={String(field.scaleMax ?? 5)}
          ariaLabel={t`Number of stars`}
          options={range(3, 10)}
          onChange={(value) => onChange({ scaleMax: Number(value) })}
        />
      </FormBuilderFieldRow>
    );
  }

  if (field.type === 'scale') {
    const scaleMin = field.scaleMin === 0 ? 0 : 1;

    return (
      <>
        <StyledGrid>
          <FormBuilderFieldRow label={t`From`}>
            <FormBuilderNativeSelect
              value={String(scaleMin)}
              ariaLabel={t`From`}
              options={range(0, 1)}
              onChange={(value) => onChange({ scaleMin: Number(value) })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow label={t`To`}>
            <FormBuilderNativeSelect
              value={String(field.scaleMax ?? 5)}
              ariaLabel={t`To`}
              options={range(scaleMin + 2, 10)}
              onChange={(value) => onChange({ scaleMax: Number(value) })}
            />
          </FormBuilderFieldRow>
        </StyledGrid>
        {labels}
      </>
    );
  }

  return (
    <>
      <StyledGrid>
        <FormBuilderFieldRow label={t`Minimum`}>
          <FormBuilderTextInput
            type="number"
            dir="ltr"
            value={String(field.scaleMin ?? 0)}
            onChange={(value) =>
              onChange({ scaleMin: toIntegerOrUndefined(value) })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Maximum`}>
          <FormBuilderTextInput
            type="number"
            dir="ltr"
            value={String(field.scaleMax ?? 100)}
            onChange={(value) =>
              onChange({ scaleMax: toIntegerOrUndefined(value) })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Step`}>
          <FormBuilderTextInput
            type="number"
            min={0}
            dir="ltr"
            value={String(field.scaleStep ?? 1)}
            onChange={(value) => {
              const step = toNumberOrUndefined(value);

              onChange({
                scaleStep: step !== undefined && step > 0 ? step : undefined,
              });
            }}
          />
        </FormBuilderFieldRow>
      </StyledGrid>
      {labels}
    </>
  );
};
