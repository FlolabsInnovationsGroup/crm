import { type MessageDescriptor } from '@lingui/core';
import { type PublicFormField } from 'twenty-shared/utils';
import { type IconComponent } from 'twenty-ui/icon';

export type FormBuilderPaletteEntry = {
  key: string;
  fieldType: PublicFormField['type'];
  label: MessageDescriptor;
  Icon: IconComponent;
  preset?: Partial<PublicFormField>;
};
