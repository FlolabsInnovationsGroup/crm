import {
  type IconComponent,
  IconAlignLeft,
  IconAt,
  IconCalendarEvent,
  IconCheckbox,
  IconCircleDot,
  IconEyeOff,
  IconFileUpload,
  IconHeading,
  IconLink,
  IconListCheck,
  IconNumber,
  IconPageBreak,
  IconPhone,
  IconPilcrow,
  IconTextSize,
} from 'twenty-ui/icon';
import { type PublicFormField } from 'twenty-shared/utils';

export const FORM_BUILDER_FIELD_TYPE_ICONS: Record<
  PublicFormField['type'],
  IconComponent
> = {
  shortText: IconTextSize,
  longText: IconAlignLeft,
  email: IconAt,
  phone: IconPhone,
  number: IconNumber,
  url: IconLink,
  date: IconCalendarEvent,
  select: IconCircleDot,
  multiSelect: IconListCheck,
  checkbox: IconCheckbox,
  file: IconFileUpload,
  hidden: IconEyeOff,
  heading: IconHeading,
  paragraph: IconPilcrow,
  pageBreak: IconPageBreak,
};
