import { styled } from '@linaria/react';
import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import {
  type PublicFormField,
  type PublicFormVariable,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldCard } from '@/form-builder/components/FormBuilderFieldCard';
import { FORM_BUILDER_PALETTE } from '@/form-builder/constants/FormBuilderPalette';
import { type FormBuilderPaletteEntry } from '@/form-builder/types/FormBuilderPaletteEntry';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';
import { createFormField } from '@/form-builder/utils/createFormField';
import { removeInvalidFormConditions } from '@/form-builder/utils/removeInvalidFormConditions';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding: ${themeCssVariables.spacing[4]} 0;
  text-align: center;
`;

const StyledPaletteTitle = styled.h4`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: ${themeCssVariables.spacing[4]} 0 ${themeCssVariables.spacing[1]};
  text-transform: uppercase;
`;

const StyledPalette = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
`;

const StyledPaletteButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: start;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    border-color: ${themeCssVariables.color.blue};
    color: ${themeCssVariables.font.color.primary};
  }
`;

type FormBuilderFieldsTabProps = {
  fields: PublicFormField[];
  variables: PublicFormVariable[];
  mappableFields: FormBuilderMappableField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onChange: (fields: PublicFormField[]) => void;
};

export const FormBuilderFieldsTab = ({
  fields,
  variables,
  mappableFields,
  selectedFieldId,
  onSelectField,
  onChange,
}: FormBuilderFieldsTabProps) => {
  const existingFieldIds = fields.map((field) => field.id);

  const handleAddField = (entry: FormBuilderPaletteEntry) => {
    const field: PublicFormField = {
      ...createFormField(entry.fieldType, existingFieldIds),
      ...entry.preset,
    };

    onChange([...fields, field]);
    onSelectField(field.id);
  };

  const handleFieldChange = (fieldIndex: number, field: PublicFormField) => {
    onChange(
      fields.map((current, index) => (index === fieldIndex ? field : current)),
    );
  };

  const handleMove = (fieldIndex: number, direction: -1 | 1) => {
    const targetIndex = fieldIndex + direction;
    const reorderedFields = [...fields];

    [reorderedFields[fieldIndex], reorderedFields[targetIndex]] = [
      reorderedFields[targetIndex],
      reorderedFields[fieldIndex],
    ];

    onChange(
      removeInvalidFormConditions(
        reorderedFields,
        variables.map((variable) => variable.id),
      ),
    );
  };

  const handleDuplicate = (fieldIndex: number) => {
    const source = fields[fieldIndex];
    // Two fields writing to the same CRM field would overwrite each other.
    const copy: PublicFormField = {
      ...source,
      id: createFormField(source.type, existingFieldIds).id,
      mapTo: undefined,
    };

    onChange([
      ...fields.slice(0, fieldIndex + 1),
      copy,
      ...fields.slice(fieldIndex + 1),
    ]);
    onSelectField(copy.id);
  };

  const handleRemove = (fieldIndex: number) => {
    onChange(
      removeInvalidFormConditions(
        fields.filter((_, index) => index !== fieldIndex),
        variables.map((variable) => variable.id),
      ),
    );
  };

  return (
    <StyledContainer>
      {fields.length === 0 && (
        <StyledEmpty>{t`Add your first question below.`}</StyledEmpty>
      )}
      {fields.map((field, index) => (
        <FormBuilderFieldCard
          key={field.id}
          field={field}
          previousFields={fields.slice(0, index)}
          allFields={fields}
          variables={variables}
          mappableFields={mappableFields}
          isSelected={selectedFieldId === field.id}
          isFirst={index === 0}
          isLast={index === fields.length - 1}
          onSelect={() =>
            onSelectField(selectedFieldId === field.id ? null : field.id)
          }
          onChange={(nextField) => handleFieldChange(index, nextField)}
          onMove={(direction) => handleMove(index, direction)}
          onDuplicate={() => handleDuplicate(index)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <StyledPaletteTitle>{t`Add a field`}</StyledPaletteTitle>
      <StyledPalette>
        {FORM_BUILDER_PALETTE.map((entry) => (
          <StyledPaletteButton
            key={entry.key}
            type="button"
            onClick={() => handleAddField(entry)}
          >
            <entry.Icon size={16} />
            {i18n._(entry.label)}
          </StyledPaletteButton>
        ))}
      </StyledPalette>
    </StyledContainer>
  );
};
