import { type AnalyticsStageTotalRow } from '@/crm-analytics/types/AnalyticsApi';

export const countAnalyticsUnmappedPeople = (rows: AnalyticsStageTotalRow[]) =>
  rows.reduce(
    (total, row) => (row.rowKind === 'UNMAPPED' ? total + row.count : total),
    0,
  );
