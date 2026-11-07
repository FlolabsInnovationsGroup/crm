import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsFilter } from '@/crm-analytics/types/AnalyticsApi';

// Period only groups the Trends buckets, so it never narrows who is counted.
export const hasActiveAnalyticsFilter = (filter: AnalyticsFilter) =>
  isDefined(filter.dateFrom) ||
  isDefined(filter.dateTo) ||
  isDefined(filter.trackKey) ||
  isDefined(filter.programKey) ||
  isDefined(filter.sourceKey) ||
  filter.status !== 'ALL';
