import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsCategories,
  type AnalyticsFilter,
} from '@/crm-analytics/types/AnalyticsApi';

// Charts draw one level at a time, or a person would count twice. Choosing a track expands it to its programs.
export const getAnalyticsCategoryChartRows = (
  { groupBy, rows }: Pick<AnalyticsCategories, 'groupBy' | 'rows'>,
  { trackKey, programKey }: Pick<AnalyticsFilter, 'trackKey' | 'programKey'>,
) => {
  if (groupBy === 'SOURCE') {
    return rows;
  }

  const programRows = rows.filter((row) => isDefined(row.parentKey));

  if (
    (isDefined(trackKey) || isDefined(programKey)) &&
    programRows.length > 0
  ) {
    return programRows;
  }

  const rowKeys = new Set(rows.map((row) => row.key));

  // A program whose track is not in the payload still has to be counted somewhere visible.
  return rows.filter(
    (row) => !isDefined(row.parentKey) || !rowKeys.has(row.parentKey),
  );
};
