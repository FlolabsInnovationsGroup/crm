import { isDefined } from 'twenty-shared/utils';

import { type AnalyticsPdfBarRow } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars';
import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { type AnalyticsPdfRate } from '@/crm-analytics/report-pdf/types/AnalyticsPdfRate';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';
import { formatAnalyticsPdfNumber } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { getAnalyticsPdfCategoryLabel } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfCategoryLabel';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

const LIGHTER_RATE_RANK_SHIFT = 2;
const UNKNOWN_RANK = -Infinity;

// Ranked high to low, with the catch-all rows at the bottom whatever their size.
const sortCategoryBars = <TEntry extends { row: AnalyticsCategoryRow }>(
  entries: TEntry[],
  getRank: (entry: TEntry) => number,
) =>
  [...entries].sort((first, second) => {
    const firstCatchAll = isAnalyticsCatchAllRow(first.row) ? 1 : 0;
    const secondCatchAll = isAnalyticsCatchAllRow(second.row) ? 1 : 0;

    return firstCatchAll !== secondCatchAll
      ? firstCatchAll - secondCatchAll
      : getRank(second) - getRank(first);
  });

// A small group's high rate must not outrank a firm one, so firm rates come first, then lighter, then unknown.
const getConversionRank = ({ ratio, isLighter }: AnalyticsPdfRate) => {
  if (!isDefined(ratio)) {
    return UNKNOWN_RANK;
  }

  return isLighter ? ratio - LIGHTER_RATE_RANK_SHIFT : ratio;
};

export const buildAnalyticsPdfCountBars = (
  rows: AnalyticsCategoryRow[],
  groupBy: AnalyticsCategories['groupBy'],
  getCount: (row: AnalyticsCategoryRow) => number | null,
  getPart?: (row: AnalyticsCategoryRow) => number | null,
): AnalyticsPdfBarRow[] =>
  sortCategoryBars(
    rows.map((row) => ({ row })),
    ({ row }) => getCount(row) ?? UNKNOWN_RANK,
  ).map(({ row }) => {
    const count = getCount(row);

    return {
      key: row.key,
      label: getAnalyticsPdfCategoryLabel(row, groupBy),
      value: count,
      valueText: isDefined(count)
        ? formatAnalyticsPdfNumber(count)
        : ANALYTICS_PDF_UNKNOWN_VALUE,
      partValue: getPart?.(row),
      tone: isAnalyticsCatchAllRow(row) ? 'NEUTRAL' : 'ACCENT',
    };
  });

export const buildAnalyticsPdfConversionBars = (
  rows: AnalyticsCategoryRow[],
  groupBy: AnalyticsCategories['groupBy'],
  minimumSample: number,
): AnalyticsPdfBarRow[] =>
  sortCategoryBars(
    rows.map((row) => ({
      row,
      rate: describeAnalyticsPdfRate({
        rate: row.overallRate,
        soFarRate: row.overallSoFarRate,
        sampleSize: row.overallEligible,
        minimumSample,
      }),
    })),
    ({ rate }) => getConversionRank(rate),
  ).map(({ row, rate }) => ({
    key: row.key,
    label: getAnalyticsPdfCategoryLabel(row, groupBy),
    value: rate.ratio,
    valueText: rate.text,
    detailText: rate.detail,
    tone: rate.isLighter ? 'LIGHTER' : 'ACCENT',
  }));
