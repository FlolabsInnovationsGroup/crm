import { msg } from '@lingui/core/macro';
import { type PublicFormField } from 'twenty-shared/utils';
import { IconGauge, IconSelector } from 'twenty-ui/icon';

import { type FormBuilderPaletteEntry } from '@/form-builder/types/FormBuilderPaletteEntry';

// Palette entries that are presets of another type, listed after it.
export const FORM_BUILDER_PALETTE_PRESETS: Partial<
  Record<PublicFormField['type'], FormBuilderPaletteEntry>
> = {
  select: {
    key: 'dropdown',
    fieldType: 'select',
    label: msg`Dropdown`,
    Icon: IconSelector,
    preset: { choiceDisplay: 'dropdown' },
  },
  scale: {
    key: 'nps',
    fieldType: 'scale',
    label: msg`NPS (0–10)`,
    Icon: IconGauge,
    preset: { scaleMin: 0, scaleMax: 10 },
  },
};
