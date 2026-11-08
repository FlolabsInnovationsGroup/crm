import { isDefined } from 'twenty-shared/utils';

const ONE_PERCENT = 0.01;
const NINETY_NINE_PERCENT = 0.99;
const LOWEST_PERCENT_ABOVE_NONE = 0.1;
const HIGHEST_PERCENT_BELOW_ALL = 99.9;

// Whole percent, except within 1% of either end, where one decimal keeps a rate from reading as none or all.
export const formatAnalyticsRate = (
  rate: number | null | undefined,
): string | null => {
  if (!isDefined(rate) || !Number.isFinite(rate)) {
    return null;
  }

  const percent = rate * 100;
  const percentToOneDecimal = Math.round(percent * 10) / 10;

  if (rate > 0 && rate < ONE_PERCENT) {
    return `${Math.max(percentToOneDecimal, LOWEST_PERCENT_ABOVE_NONE)}%`;
  }

  if (rate > NINETY_NINE_PERCENT && rate < 1) {
    return `${Math.min(percentToOneDecimal, HIGHEST_PERCENT_BELOW_ALL)}%`;
  }

  return `${Math.round(percent)}%`;
};
