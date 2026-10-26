import { type PublicFormField } from 'twenty-shared/utils';

// Something a condition can test: an earlier question or a calculation.
export type FormBuilderConditionSource = {
  id: string;
  label: string;
  fieldType: PublicFormField['type'] | 'variable';
  options?: { value: string; label: string }[];
};
