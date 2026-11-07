import { type AnalyticsReportListItem } from '@/crm-analytics/types/AnalyticsApi';

export const buildAnalyticsPdfFileName = ({
  periodType,
  periodStart,
}: Pick<AnalyticsReportListItem, 'periodType' | 'periodStart'>) => {
  const periodName = periodType === 'MONTH' ? 'monthly' : 'weekly';

  return `FloLabs-analytics-${periodName}-${periodStart.slice(0, 10)}.pdf`;
};
