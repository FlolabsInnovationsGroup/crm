import { type AnalyticsPdfComparisonRow } from '@/crm-analytics/report-pdf/components/AnalyticsPdfComparisonTable';
import { getAnalyticsPdfComparisonLabel } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfComparisonLabel';
import { isAnalyticsPdfPreviousPeriodTracked } from '@/crm-analytics/report-pdf/utils/isAnalyticsPdfPreviousPeriodTracked';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';

// With an untracked previous period, its count only looks known, so nothing can be significant against it.
export const buildAnalyticsPdfComparisonRows = (
  report: AnalyticsReport,
): AnalyticsPdfComparisonRow[] => {
  const isPreviousPeriodTracked = isAnalyticsPdfPreviousPeriodTracked(report);

  return report.comparisons.map((comparison) => ({
    key: comparison.metricKey,
    label: getAnalyticsPdfComparisonLabel(comparison, report.movement),
    current: comparison.current,
    previous: isPreviousPeriodTracked ? comparison.previous : null,
    isSignificant: isPreviousPeriodTracked && comparison.isSignificant,
  }));
};
