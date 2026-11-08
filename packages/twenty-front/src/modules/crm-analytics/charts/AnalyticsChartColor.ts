import { themeCssVariables } from 'twenty-ui/theme';

// Accent and warning pass the palette validator side by side in both modes.
// neutralSoft is under 2:1 on a light card, so use it only on a mark with a label beside it.
export const ANALYTICS_CHART_COLOR = {
  accent: themeCssVariables.color.blue9,
  accentStrong: themeCssVariables.color.blue12,
  warning: themeCssVariables.color.tomato10,
  neutral: themeCssVariables.color.gray8,
  neutralStrong: themeCssVariables.color.gray9,
  neutralSoft: themeCssVariables.color.gray7,
} as const;
