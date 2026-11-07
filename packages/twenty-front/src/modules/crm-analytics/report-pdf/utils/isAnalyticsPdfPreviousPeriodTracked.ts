import { Temporal } from 'temporal-polyfill';

import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';

// Stored reports stay as generated, and the first of each type compared itself with untracked days.
export const isAnalyticsPdfPreviousPeriodTracked = (
  report: AnalyticsReport,
) => {
  const previousStart = Temporal.PlainDate.from(
    report.periodStart.slice(0, 10),
  ).subtract(report.periodType === 'MONTH' ? { months: 1 } : { weeks: 1 });

  return isAnalyticsPeriodFullyTracked(previousStart.toString(), report);
};
