import { styled } from '@linaria/react';
import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import {
  type PublicFormField,
  type PublicFormVariable,
} from 'twenty-shared/utils';
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconFilter,
  IconTrash,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldSettings } from '@/form-builder/components/FormBuilderFieldSettings';
import { FORM_BUILDER_FIELD_TYPE_ICONS } from '@/form-builder/constants/FormBuilderFieldTypeIcons';
import { FORM_BUILDER_FIELD_TYPE_LABELS } from '@/form-builder/constants/FormBuilderFieldTypeLabels';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';

const StyledCard = styled.div<{ isSelected: boolean }>`
  background: ${themeCssVariables.background.primary};
  border: 1px solid
    ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${({ isSelected }) =>
    isSelected ? themeCssVariables.boxShadow.light : 'none'};
`;

const StyledHeader = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 44px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]}
    ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const StyledIcon = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex: none;
`;

const StyledTitle = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.light};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRequired = styled.span`
  color: ${themeCssVariables.font.color.danger};
`;

const StyledActions = styled.div`
  display: flex;
  flex: none;
`;

const StyledBody = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[4]};
`;

type FormBuilderFieldCardProps = {
  field: PublicFormField;
  previousFields: PublicFormField[];
  allFields: PublicFormField[];
  variables: PublicFormVariable[];
  mappableFields: FormBuilderMappableField[];
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onChange: (field: PublicFormField) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

export const FormBuilderFieldCard = ({
  field,
  previousFields,
  allFields,
  variables,
  mappableFields,
  isSelected,
  isFirst,
  isLast,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: FormBuilderFieldCardProps) => {
  const FieldTypeIcon = FORM_BUILDER_FIELD_TYPE_ICONS[field.type];
  const mappedField = mappableFields.find(
    (mappableField) => mappableField.value === field.mapTo,
  );
  const label =
    field.type === 'paragraph'
      ? (field.description ?? '')
      : field.type === 'pageBreak' && field.label === ''
        ? i18n._(FORM_BUILDER_FIELD_TYPE_LABELS.pageBreak)
        : field.label;

  return (
    <StyledCard isSelected={isSelected}>
      <StyledHeader onClick={onSelect}>
        <StyledIcon>
          <FieldTypeIcon size={16} />
        </StyledIcon>
        <StyledTitle>
          <StyledLabel dir="auto">
            {label || t`Untitled`}
            {field.required && <StyledRequired> *</StyledRequired>}
          </StyledLabel>
          <StyledMeta>
            <span>{i18n._(FORM_BUILDER_FIELD_TYPE_LABELS[field.type])}</span>
            {mappedField && <span>→ {mappedField.label}</span>}
            {((field.visibleWhen ?? []).length > 0 ||
              (field.visibleWhenGroups ?? []).length > 0 ||
              (field.requiredWhenGroups ?? []).length > 0) && (
              <IconFilter size={12} aria-label={t`Conditional`} />
            )}
          </StyledMeta>
        </StyledTitle>
        <StyledActions onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Move up`}
            disabled={isFirst}
            startIcon={<IconArrowUp size={14} />}
            onClick={() => onMove(-1)}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Move down`}
            disabled={isLast}
            startIcon={<IconArrowDown size={14} />}
            onClick={() => onMove(1)}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t`Duplicate`}
            startIcon={<IconCopy size={14} />}
            onClick={onDuplicate}
          />
          <Button
            variant="ghost"
            size="sm"
            color="danger"
            aria-label={t`Delete`}
            startIcon={<IconTrash size={14} />}
            onClick={onRemove}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={isSelected ? t`Collapse` : t`Edit`}
            startIcon={
              isSelected ? (
                <IconChevronUp size={14} />
              ) : (
                <IconChevronDown size={14} />
              )
            }
            onClick={onSelect}
          />
        </StyledActions>
      </StyledHeader>
      {isSelected && (
        <StyledBody>
          <FormBuilderFieldSettings
            field={field}
            previousFields={previousFields}
            allFields={allFields}
            variables={variables}
            mappableFields={mappableFields}
            onChange={onChange}
          />
        </StyledBody>
      )}
    </StyledCard>
  );
};
