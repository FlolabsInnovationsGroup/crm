import { type AnalyticsCategoryRow } from '@/crm-analytics/types/AnalyticsApi';

const NO_VALUE_CATEGORY_KEY = 'NONE';

// The server sends people with no position or source as a NONE row with isUnmapped false.
export const isAnalyticsCatchAllRow = (row: AnalyticsCategoryRow) =>
  row.isUnmapped || row.key === NO_VALUE_CATEGORY_KEY;
