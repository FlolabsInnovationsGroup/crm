import { type AnalyticsTrendMetric } from '@/crm-analytics/types/AnalyticsApi';

export const isAnalyticsRateMetric = (metric: AnalyticsTrendMetric): boolean =>
  metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF';
