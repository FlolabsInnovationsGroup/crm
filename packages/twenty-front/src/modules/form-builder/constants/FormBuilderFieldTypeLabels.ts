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
  time: msg`Time`,
  select: msg`Single choice`,
  multiSelect: msg`Multiple choice`,
  yesNo: msg`Yes / No`,
  rating: msg`Rating`,
  scale: msg`Scale`,
  slider: msg`Slider`,
  matrix: msg`Matrix`,
  checkbox: msg`Checkbox`,
  consent: msg`Consent`,
  address: msg`Address`,
  file: msg`File upload`,
  signature: msg`Signature`,
  hidden: msg`Hidden value`,
  heading: msg`Section title`,
  paragraph: msg`Text block`,
  image: msg`Image`,
  pageBreak: msg`New page`,
};
