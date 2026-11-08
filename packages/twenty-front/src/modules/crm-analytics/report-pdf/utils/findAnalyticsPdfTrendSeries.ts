import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsReport,
  type AnalyticsSeries,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';

// Reports frozen before trend history was stored have no such field.
const getAnalyticsPdfTrendSeries = ({
  trendSeries,
}: AnalyticsReport): AnalyticsSeries[] =>
  Array.isArray(trendSeries) ? trendSeries : [];

// A report stores one ungrouped series per metric, and some carry a stage key.
export const findAnalyticsPdfTrendSeries = (
  report: AnalyticsReport,
  metric: AnalyticsTrendMetric,
) =>
  getAnalyticsPdfTrendSeries(report).find(
    (series) => series.metric === metric && !isDefined(series.groupKey),
  );
