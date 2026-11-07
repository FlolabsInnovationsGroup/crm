import { themeCssVariables } from 'twenty-ui/theme';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';

const RAMP_START = `color-mix(in oklch, ${themeCssVariables.color.blue7}, ${themeCssVariables.color.blue8})`;
const RAMP_END = themeCssVariables.color.blue12;

// One hue for ordered things such as stages. Both ends flip with the theme, so later always stands out more.
// Passes the validator's ordinal checks in both modes up to 8 steps.
export const getAnalyticsOrdinalColor = (index: number, stepCount: number) => {
  if (stepCount <= 1) {
    return ANALYTICS_CHART_COLOR.accent;
  }

  const endShare = Math.round((index / (stepCount - 1)) * 100);

  return `color-mix(in oklch, ${RAMP_START}, ${RAMP_END} ${endShare}%)`;
};
