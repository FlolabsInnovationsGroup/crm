import { plural } from '@lingui/core/macro';

import { type AnalyticsPeriod } from '@/crm-analytics/types/AnalyticsApi';

export const getAnalyticsWindowLength = (
  bucketCount: number,
  period: AnalyticsPeriod,
) => {
  switch (period) {
    case 'DAY':
      return plural(bucketCount, { one: '# day', other: '# days' });
    case 'WEEK':
      return plural(bucketCount, { one: '# week', other: '# weeks' });
    case 'MONTH':
      return plural(bucketCount, { one: '# month', other: '# months' });
  }
};
