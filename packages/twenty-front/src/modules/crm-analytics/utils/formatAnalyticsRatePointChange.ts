import { plural } from '@lingui/core/macro';

import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';

const getDisplayedPercent = (rate: number) =>
  Number.parseFloat(formatAnalyticsRate(rate) ?? '0');

// Measured from the rates as printed, so a change never contradicts the two values beside it.
export const formatAnalyticsRatePointChange = (
  rate: number,
  previousRate: number,
  formatNumber: (value: number, options?: { decimals?: number }) => string,
) => {
  const points =
    Math.round(
      (getDisplayedPercent(rate) - getDisplayedPercent(previousRate)) * 10,
    ) / 10;
  const formattedPoints = formatAnalyticsSignedNumber(points, (value) =>
    formatNumber(value, Number.isInteger(value) ? undefined : { decimals: 1 }),
  );

  return plural(Math.abs(points), {
    one: `${formattedPoints} point`,
    other: `${formattedPoints} points`,
  });
};
