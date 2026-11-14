import { isNonEmptyString, isNumber, isString } from '@sniptt/guards';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { formatToHumanReadableDate } from '~/utils/date-utils';

type ContactField = Pick<FieldMetadataItem, 'type' | 'options'>;

const getOptionLabel = (field: ContactField, value: string) =>
  field.options?.find((option) => option.value === value)?.label ?? value;

const readString = (value: unknown, key: string) =>
  isPlainObject(value) && isString(value[key]) ? value[key] : '';

export const formatContactFieldValue = (
  field: ContactField,
  value: unknown,
): string => {
  if (!isDefined(value)) {
    return '';
  }

  switch (field.type) {
    case FieldMetadataType.SELECT:
      return isString(value) ? getOptionLabel(field, value) : '';
    case FieldMetadataType.MULTI_SELECT:
      return Array.isArray(value)
        ? value
            .filter(isString)
            .map((option) => getOptionLabel(field, option))
            .join(', ')
        : '';
    case FieldMetadataType.EMAILS:
      return readString(value, 'primaryEmail');
    case FieldMetadataType.PHONES: {
      const number = readString(value, 'primaryPhoneNumber');
      const callingCode = readString(value, 'primaryPhoneCallingCode');

      return isNonEmptyString(number)
        ? [callingCode, number].filter(isNonEmptyString).join(' ')
        : '';
    }
    case FieldMetadataType.LINKS:
      return readString(value, 'primaryLinkUrl');
    case FieldMetadataType.DATE:
    case FieldMetadataType.DATE_TIME:
      return isString(value) ? formatToHumanReadableDate(value) : '';
    default:
      return isString(value) || isNumber(value) ? String(value) : '';
  }
};
