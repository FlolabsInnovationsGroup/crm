import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { getAnalyticsWindowLength } from '@/crm-analytics/utils/getAnalyticsWindowLength';

type TrendChartSeries = {
  key: 'previous' | 'current';
  label: string;
  color: 'gray' | 'blue';
  data: { x: string; y: number | null }[];
};

type BuildTrendChartSeriesArgs = {
  points: AnalyticsTrendPoint[];
  metric: AnalyticsTrendMetric;
  period: AnalyticsPeriod;
  formatBucketLabel: (bucketStart: string) => string;
};

export const isAnalyticsRateMetric = (metric: AnalyticsTrendMetric): boolean =>
  metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF';

// The chart gets rates as 0 to 100; pair it with suffix="%". A null stays null so the line stops.
export const buildTrendChartSeries = ({
  points,
  metric,
  period,
  formatBucketLabel,
}: BuildTrendChartSeriesArgs): TrendChartSeries[] => {
  const toChartValue = (value: number | null) => {
    if (!isDefined(value)) {
      return null;
    }

    return isAnalyticsRateMetric(metric)
      ? Math.round(value * 1000) / 10
      : value;
  };

  const windowLength = getAnalyticsWindowLength(points.length, period);

  const currentSeries: TrendChartSeries = {
    key: 'current',
    label: t`These ${windowLength}`,
    color: 'blue',
    data: points.map((point) => ({
      x: formatBucketLabel(point.bucketStart),
      y: toChartValue(point.value),
    })),
  };

  if (!points.some((point) => isDefined(point.previousValue))) {
    return [currentSeries];
  }

  const previousSeries: TrendChartSeries = {
    key: 'previous',
    label: t`${windowLength} before`,
    color: 'gray',
    data: points.map((point) => ({
      x: formatBucketLabel(point.bucketStart),
      y: toChartValue(point.previousValue),
    })),
  };

  return [previousSeries, currentSeries];
};
