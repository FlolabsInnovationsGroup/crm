import { isDefined } from 'twenty-shared/utils';

const ONE_PERCENT = 0.01;

// Whole percent, except below 1% where one decimal keeps a small rate from reading as zero.
export const formatAnalyticsRate = (
  rate: number | null | undefined,
): string | null => {
  if (!isDefined(rate) || !Number.isFinite(rate)) {
    return null;
  }

  const percent = rate * 100;

  if (rate > 0 && rate < ONE_PERCENT) {
    return `${Math.round(percent * 10) / 10}%`;
  }

  return `${Math.round(percent)}%`;
};
