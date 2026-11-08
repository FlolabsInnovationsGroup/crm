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

  // While a filter loads, rows are still the previous answer, so the filter narrows them as the server will.
  const programRows = rows.filter(
    (row) =>
      isDefined(row.parentKey) &&
      (!isDefined(trackKey) || row.parentKey === trackKey) &&
      (!isDefined(programKey) || row.key === programKey),
  );

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
