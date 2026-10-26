import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';

const StyledRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
`;

type PersonValue = { mapTo: string; value: string };

type FormBuilderPersonValueRowProps = {
  entry: PersonValue;
  settableFields: FormBuilderMappableField[];
  onChange: (entry: PersonValue) => void;
  onRemove: () => void;
};

export const FormBuilderPersonValueRow = ({
  entry,
  settableFields,
  onChange,
  onRemove,
}: FormBuilderPersonValueRowProps) => {
  const selectedField = settableFields.find(
    (field) => field.value === entry.mapTo,
  );

  return (
    <StyledRow>
      <FormBuilderNativeSelect
        value={entry.mapTo}
        ariaLabel={t`Person field`}
        options={[
          ...settableFields.map((field) => ({
            value: field.value,
            label: field.label,
          })),
          ...(selectedField === undefined
            ? [{ value: entry.mapTo, label: entry.mapTo }]
            : []),
        ]}
        onChange={(mapTo) =>
          onChange({
            mapTo,
            value:
              settableFields.find((field) => field.value === mapTo)
                ?.options?.[0]?.value ?? '',
          })
        }
      />
      {selectedField?.options !== undefined ? (
        <FormBuilderNativeSelect
          value={entry.value}
          ariaLabel={t`Value`}
          options={selectedField.options}
          onChange={(value) => onChange({ ...entry, value })}
        />
      ) : (
        <FormBuilderTextInput
          value={entry.value}
          ariaLabel={t`Value`}
          placeholder={t`Value`}
          onChange={(value) => onChange({ ...entry, value })}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={t`Remove`}
        startIcon={<IconTrash size={14} />}
        onClick={onRemove}
      />
    </StyledRow>
  );
};
