import { type PublicFormField } from 'twenty-shared/utils';

export type FormBuilderMappableField = {
  value: string;
  label: string;
  compatibleFieldTypes: PublicFormField['type'][];
  options?: { value: string; label: string }[];
};
