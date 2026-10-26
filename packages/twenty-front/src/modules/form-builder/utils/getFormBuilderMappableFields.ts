import { t } from '@lingui/core/macro';
import { FieldMetadataType } from 'twenty-shared/types';
import { type PublicFormField } from 'twenty-shared/utils';

import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';

const TEXT_ANSWER_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'email',
  'phone',
  'url',
  'select',
  'time',
  'matrix',
  'hidden',
];

const getCompositeSubFields = (
  fieldMetadataItem: FieldMetadataItem,
): FormBuilderMappableField[] => {
  const { name, label } = fieldMetadataItem;

  switch (fieldMetadataItem.type) {
    case FieldMetadataType.FULL_NAME:
      return [
        {
          value: `${name}.firstName`,
          label: `${label} › ${t`First name`}`,
          compatibleFieldTypes: ['shortText', 'hidden'],
        },
        {
          value: `${name}.lastName`,
          label: `${label} › ${t`Last name`}`,
          compatibleFieldTypes: ['shortText', 'hidden'],
        },
      ];
    case FieldMetadataType.EMAILS:
      return [
        {
          value: `${name}.primaryEmail`,
          label,
          compatibleFieldTypes: ['email', 'hidden'],
        },
      ];
    case FieldMetadataType.PHONES:
      return [
        {
          value: `${name}.primaryPhoneNumber`,
          label,
          compatibleFieldTypes: ['phone', 'shortText', 'hidden'],
        },
      ];
    case FieldMetadataType.LINKS:
      return [
        {
          value: `${name}.primaryLinkUrl`,
          label,
          compatibleFieldTypes: ['url', 'shortText', 'hidden'],
        },
      ];
    case FieldMetadataType.ADDRESS:
      return [
        {
          value: name,
          label: `${label} › ${t`Full address`}`,
          compatibleFieldTypes: ['address'],
        },
        {
          value: `${name}.addressStreet1`,
          label: `${label} › ${t`Street`}`,
          compatibleFieldTypes: ['shortText', 'longText', 'hidden'],
        },
        {
          value: `${name}.addressCity`,
          label: `${label} › ${t`City`}`,
          compatibleFieldTypes: ['shortText', 'select', 'hidden'],
        },
        {
          value: `${name}.addressCountry`,
          label: `${label} › ${t`Country`}`,
          compatibleFieldTypes: ['shortText', 'select', 'hidden'],
        },
      ];
    default:
      return [];
  }
};

const getSimpleField = (
  fieldMetadataItem: FieldMetadataItem,
): FormBuilderMappableField | null => {
  const { name, label } = fieldMetadataItem;
  const options = (fieldMetadataItem.options ?? []).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  switch (fieldMetadataItem.type) {
    case FieldMetadataType.TEXT:
      return { value: name, label, compatibleFieldTypes: TEXT_ANSWER_TYPES };
    case FieldMetadataType.NUMBER:
      return {
        value: name,
        label,
        compatibleFieldTypes: ['number', 'rating', 'scale', 'slider'],
      };
    case FieldMetadataType.BOOLEAN:
      return {
        value: name,
        label,
        compatibleFieldTypes: ['checkbox', 'consent', 'yesNo'],
      };
    case FieldMetadataType.DATE:
      return { value: name, label, compatibleFieldTypes: ['date'] };
    case FieldMetadataType.SELECT:
      return {
        value: name,
        label,
        compatibleFieldTypes: ['select', 'yesNo'],
        options,
      };
    case FieldMetadataType.MULTI_SELECT:
      return {
        value: name,
        label,
        compatibleFieldTypes: ['multiSelect'],
        options,
      };
    default:
      return null;
  }
};

export const getFormBuilderMappableFields = (
  fieldMetadataItems: FieldMetadataItem[],
): FormBuilderMappableField[] =>
  fieldMetadataItems
    .filter(
      (fieldMetadataItem) =>
        fieldMetadataItem.isActive === true &&
        fieldMetadataItem.isSystem !== true,
    )
    .flatMap((fieldMetadataItem) => {
      const subFields = getCompositeSubFields(fieldMetadataItem);

      if (subFields.length > 0) {
        return subFields;
      }

      const simpleField = getSimpleField(fieldMetadataItem);

      return simpleField === null ? [] : [simpleField];
    })
    .sort((first, second) => first.label.localeCompare(second.label));
