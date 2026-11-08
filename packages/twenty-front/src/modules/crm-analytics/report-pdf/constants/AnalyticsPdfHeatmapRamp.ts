/* oxlint-disable twenty/no-hardcoded-colors */
// One hue, one step per 20 points. Cells print their value, so the ramp only has to show the pattern.
export const ANALYTICS_PDF_HEATMAP_RAMP = [
  { fill: '#e0e9ff', text: '#333333' },
  { fill: '#c1d0ff', text: '#333333' },
  { fill: '#8da4ef', text: '#333333' },
  { fill: '#4f72e3', text: '#ffffff' },
  { fill: '#2f4dbd', text: '#ffffff' },
] as const;
