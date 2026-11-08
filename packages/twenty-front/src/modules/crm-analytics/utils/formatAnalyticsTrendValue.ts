import { type AnalyticsTrendMetric } from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

export const formatAnalyticsTrendValue = (
  value: number,
  metric: AnalyticsTrendMetric,
  formatNumber: (value: number, options?: { decimals?: number }) => string,
) => {
  if (isAnalyticsRateMetric(metric)) {
    return formatAnalyticsRate(value) ?? '';
  }

  return metric === 'MEDIAN_DAYS'
    ? formatNumber(value, { decimals: 1 })
    : formatNumber(value);
};
