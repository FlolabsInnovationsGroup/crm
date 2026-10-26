import { type PublicFormDefinition } from 'twenty-shared/utils';

const NON_ANSWER_TYPES = [
  'heading',
  'paragraph',
  'pageBreak',
  'file',
  'signature',
];

export type FormResponseColumn = { id: string; label: string };

export const getFormResponseColumns = (
  definition: PublicFormDefinition,
): FormResponseColumn[] => [
  ...definition.fields
    .filter((field) => !NON_ANSWER_TYPES.includes(field.type))
    .map((field) => ({ id: field.id, label: field.label || field.id })),
  ...(definition.variables ?? []).map((variable) => ({
    id: variable.id,
    label: variable.label || variable.id,
  })),
];
