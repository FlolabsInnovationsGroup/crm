import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';

import { type AnalyticsLineChartBucket } from '@/crm-analytics/charts/AnalyticsLineChart';
import { type AnalyticsTrendPoint } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { toAnalyticsLocalDate } from '@/crm-analytics/utils/toAnalyticsLocalDate';

export const buildWeeklyLineChartBuckets = (
  points: AnalyticsTrendPoint[],
): AnalyticsLineChartBucket[] =>
  points.map(({ bucketStart, isPartial }) => {
    const weekStart = i18n.date(toAnalyticsLocalDate(bucketStart), {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });

    return {
      key: bucketStart,
      label: formatAnalyticsBucketLabel({
        bucketStart,
        period: 'WEEK',
        isCompact: true,
      }),
      tooltipLabel: t`Week of ${weekStart}`,
      isPartial,
    };
  });
