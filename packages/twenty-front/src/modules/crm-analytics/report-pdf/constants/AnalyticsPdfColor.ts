/* oxlint-disable twenty/no-hardcoded-colors */
// react-pdf cannot read CSS variables, so these are the chart kit's light theme values as hex.
// Accent passed the dataviz palette validator on white; the grays are context, not series.
export const ANALYTICS_PDF_COLOR = {
  surface: '#ffffff',
  ink: '#333333',
  inkSecondary: '#666666',
  inkMuted: '#838383',
  hairline: '#ebebeb',
  baseline: '#cccccc',
  panel: '#f7f7f7',
  accent: '#3e63dd',
  accentLight: '#abbdf9',
  accentMiddle: '#8da4ef',
  accentWash: '#e0e9ff',
  // These two differ from accent in lightness too, so they still read when printed in gray.
  stalled: '#f29a4e',
  left: '#222222',
  neutral: '#b3b3b3',
  neutralSoft: '#d6d6d6',
  uncertainCell: '#f0f0f0',
  onDark: '#ffffff',
  onLight: '#111111',
} as const;
