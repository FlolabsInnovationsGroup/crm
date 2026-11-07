import { themeCssVariables } from 'twenty-ui/theme';

// The order is the color-blind safety: it passed the palette validator in both modes, so do not reorder.
// Give a color by the track's place in meta.tracks, never by rank, so a track keeps its color when filtered.
export const ANALYTICS_CHART_CATEGORICAL_COLORS = [
  themeCssVariables.color.blue9,
  themeCssVariables.color.tomato9,
  themeCssVariables.color.cyan9,
  themeCssVariables.color.grass9,
  themeCssVariables.color.pink9,
] as const;
