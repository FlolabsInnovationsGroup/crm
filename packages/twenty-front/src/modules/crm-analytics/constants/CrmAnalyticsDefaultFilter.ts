import { type AnalyticsFilter } from '@/crm-analytics/types/AnalyticsApi';

export const CRM_ANALYTICS_DEFAULT_FILTER: AnalyticsFilter = {
  dateFrom: null,
  dateTo: null,
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
  period: 'WEEK',
};
