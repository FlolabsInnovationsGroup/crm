import { plural, t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsLineChartBucket } from '@/crm-analytics/charts/AnalyticsLineChart';
import {
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { getAnalyticsBucketDescription } from '@/crm-analytics/utils/getAnalyticsBucketDescription';

type BuildAnalyticsSeriesBucketsArgs = {
  points: AnalyticsTrendPoint[];
  period: AnalyticsPeriod;
  // Given only for a single line, where a median's tooltip title can carry its count of stays.
  metric?: AnalyticsTrendMetric;
  formatNumber: (value: number) => string;
};

export const buildAnalyticsSeriesBuckets = ({
  points,
  period,
  metric,
  formatNumber,
}: BuildAnalyticsSeriesBucketsArgs): AnalyticsLineChartBucket[] => {
  const getTooltipLabel = ({ bucketStart, size }: AnalyticsTrendPoint) => {
    const description = getAnalyticsBucketDescription(bucketStart, period);

    if (metric !== 'MEDIAN_DAYS' || !isDefined(size)) {
      return description;
    }

    const count = formatNumber(size);
    const stays = plural(size, {
      one: `${count} completed stay`,
      other: `${count} completed stays`,
    });

    return t`${description}, from ${stays}`;
  };

  return points.map((point) => ({
    key: point.bucketStart,
    label: formatAnalyticsBucketLabel({
      bucketStart: point.bucketStart,
      period,
      isCompact: true,
    }),
    tooltipLabel: getTooltipLabel(point),
    isPartial: point.isPartial,
  }));
};
