import { type AnalyticsLineChartSeries } from '@/crm-analytics/charts/AnalyticsLineChart';
import {
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';

type BuildAnalyticsSeriesSampleArgs = {
  points: AnalyticsTrendPoint[];
  metric: AnalyticsTrendMetric;
  minimumSample: number;
  formatNumber: (value: number) => string;
};

export const buildAnalyticsSeriesSample = ({
  points,
  metric,
  minimumSample,
  formatNumber,
}: BuildAnalyticsSeriesSampleArgs): Pick<
  AnalyticsLineChartSeries,
  'sizes' | 'minimumSample' | 'formatSize'
> => {
  const sizes = points.map(({ size }) => size);

  if (isAnalyticsRateMetric(metric)) {
    return {
      sizes,
      minimumSample,
      formatSize: (size) => formatAnalyticsOfPeople(size, formatNumber),
    };
  }

  // The tooltip title already counts the stays behind a median.
  return metric === 'MEDIAN_DAYS' ? { sizes, minimumSample } : {};
};
