import { t } from '@lingui/core/macro';

import { type AnalyticsPeriod } from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';

export const getAnalyticsBucketDescription = (
  bucketStart: string,
  period: AnalyticsPeriod,
) => {
  const label = formatAnalyticsBucketLabel({ bucketStart, period });

  return period === 'WEEK' ? t`Week of ${label}` : label;
};
