import { isDefined, PUBLIC_FORM_FIELD_TYPES } from 'twenty-shared/utils';

import { FORM_BUILDER_FIELD_TYPE_ICONS } from '@/form-builder/constants/FormBuilderFieldTypeIcons';
import { FORM_BUILDER_FIELD_TYPE_LABELS } from '@/form-builder/constants/FormBuilderFieldTypeLabels';
import { FORM_BUILDER_PALETTE_PRESETS } from '@/form-builder/constants/FormBuilderPalettePresets';
import { type FormBuilderPaletteEntry } from '@/form-builder/types/FormBuilderPaletteEntry';

export const FORM_BUILDER_PALETTE: FormBuilderPaletteEntry[] =
  PUBLIC_FORM_FIELD_TYPES.flatMap((fieldType) => [
    {
      key: fieldType,
      fieldType,
      label: FORM_BUILDER_FIELD_TYPE_LABELS[fieldType],
      Icon: FORM_BUILDER_FIELD_TYPE_ICONS[fieldType],
    },
    ...[FORM_BUILDER_PALETTE_PRESETS[fieldType]].filter(isDefined),
  ]);
