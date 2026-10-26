import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type PublicFormField } from 'twenty-shared/utils';

export const FORM_BUILDER_FIELD_TYPE_LABELS: Record<
  PublicFormField['type'],
  MessageDescriptor
> = {
  shortText: msg`Short text`,
  longText: msg`Long text`,
  email: msg`Email`,
  phone: msg`Phone`,
  number: msg`Number`,
  url: msg`Link`,
  date: msg`Date`,
  select: msg`Single choice`,
  multiSelect: msg`Multiple choice`,
  checkbox: msg`Checkbox`,
  file: msg`File upload`,
  hidden: msg`Hidden value`,
  heading: msg`Section title`,
  paragraph: msg`Text block`,
  pageBreak: msg`New page`,
};
