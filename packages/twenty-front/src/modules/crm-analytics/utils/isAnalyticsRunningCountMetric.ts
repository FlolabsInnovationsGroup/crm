import { type AnalyticsTrendMetric } from '@/crm-analytics/types/AnalyticsApi';

// Adds up over its period, so an unfinished or partly tracked one is not comparable. Levels and rates are.
export const isAnalyticsRunningCountMetric = (
  metric: AnalyticsTrendMetric,
): boolean => metric === 'NEW_APPLICATIONS';
