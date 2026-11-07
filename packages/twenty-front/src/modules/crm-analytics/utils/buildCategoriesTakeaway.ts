import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

const pickHighestRow = (
  rows: AnalyticsCategoryRow[],
  getValue: (row: AnalyticsCategoryRow) => number,
): AnalyticsCategoryRow | undefined =>
  rows.reduce<AnalyticsCategoryRow | undefined>(
    (highestRow, row) =>
      !isDefined(highestRow) || getValue(row) > getValue(highestRow)
        ? row
        : highestRow,
    undefined,
  );

export const buildCategoriesTakeaway = (
  categories: AnalyticsCategories,
): string => {
  const { minimumSample, rows } = categories;
  const topLevelRows = rows.filter(
    (row) => !isDefined(row.parentKey) && !isAnalyticsCatchAllRow(row),
  );

  const largestRow = pickHighestRow(
    topLevelRows.filter((row) => row.people >= minimumSample),
    (row) => row.people,
  );

  if (!isDefined(largestRow)) {
    return t`Not enough people in any group to compare yet.`;
  }

  const largestLabel = largestRow.label;

  const bestRow = pickHighestRow(
    topLevelRows.filter(
      (row) =>
        isDefined(row.overallRate) && row.overallEligible >= minimumSample,
    ),
    (row) => row.overallRate ?? 0,
  );

  if (!isDefined(bestRow)) {
    return t`${largestLabel} is largest; no group has enough people to compare conversion yet.`;
  }

  if (bestRow.overallRate === 0) {
    return t`${largestLabel} is largest; no group has converted yet.`;
  }

  const bestLabel = bestRow.label;
  const bestRate = formatAnalyticsRate(bestRow.overallRate);

  return t`${largestLabel} is largest; ${bestLabel} converts best, ${bestRate}.`;
};
