import { i18n } from '@lingui/core';

import { type AnalyticsPeriod } from '@/crm-analytics/types/AnalyticsApi';
import { toAnalyticsLocalDate } from '@/crm-analytics/utils/toAnalyticsLocalDate';

type FormatAnalyticsBucketLabelArgs = {
  bucketStart: string;
  period: AnalyticsPeriod;
  isCompact?: boolean;
};

export const formatAnalyticsBucketLabel = ({
  bucketStart,
  period,
  isCompact = false,
}: FormatAnalyticsBucketLabelArgs) => {
  const bucketDate = toAnalyticsLocalDate(bucketStart);

  if (period === 'MONTH') {
    return i18n.date(bucketDate, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  return i18n.date(bucketDate, {
    month: 'short',
    day: 'numeric',
    year: isCompact ? undefined : 'numeric',
    timeZone: 'UTC',
  });
};
