import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { type AnalyticsHorizontalBarRow } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { describeAnalyticsRate } from '@/crm-analytics/utils/describeAnalyticsRate';
import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
import { getAnalyticsCategoryChartRows } from '@/crm-analytics/utils/getAnalyticsCategoryChartRows';
import { getAnalyticsCategoryLabel } from '@/crm-analytics/utils/getAnalyticsCategoryLabel';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';

type FormatNumber = (value: number) => string;

export type AnalyticsCategoryBarRows = {
  rows: AnalyticsHorizontalBarRow[];
  // People with no value or an unmapped one, kept under a line so they never rank against real groups.
  dividedRows: AnalyticsHorizontalBarRow[];
};

// A report has no filter, so its charts always draw the top level.
const getTopLevelRows = (categories: AnalyticsCategories) =>
  getAnalyticsCategoryChartRows(categories, {
    trackKey: null,
    programKey: null,
  });

const splitCatchAllRows = (
  sourceRows: AnalyticsCategoryRow[],
  toBarRow: (row: AnalyticsCategoryRow) => AnalyticsHorizontalBarRow,
): AnalyticsCategoryBarRows => ({
  rows: sourceRows
    .filter((row) => !isAnalyticsCatchAllRow(row))
    .map(toBarRow),
  dividedRows: sourceRows.filter(isAnalyticsCatchAllRow).map(toBarRow),
});

export const buildAnalyticsCategoryPeopleRows = (
  categories: AnalyticsCategories,
  formatNumber: FormatNumber,
): AnalyticsCategoryBarRows =>
  splitCatchAllRows(
    getTopLevelRows(categories).toSorted(
      (rowA, rowB) => rowB.people - rowA.people,
    ),
    (row) => {
      const otherPeople = Math.max(row.people - row.activePeople, 0);

      return {
        key: row.key,
        label: getAnalyticsCategoryLabel(row, categories.groupBy),
        segments: [
          {
            key: 'active',
            label: t`Active`,
            value: row.activePeople,
            color: ANALYTICS_CHART_COLOR.accent,
          },
          {
            key: 'other',
            label: t`Not active`,
            value: otherPeople,
            color: ANALYTICS_CHART_COLOR.neutralSoft,
          },
        ],
        tooltip: {
          title: getAnalyticsCategoryLabel(row, categories.groupBy),
          rows: [
            { label: t`People`, value: formatNumber(row.people) },
            {
              label: t`Active`,
              value: formatNumber(row.activePeople),
              color: ANALYTICS_CHART_COLOR.accent,
            },
            {
              label: t`Not active`,
              value: formatNumber(otherPeople),
              color: ANALYTICS_CHART_COLOR.neutralSoft,
            },
            ...(isDefined(row.newApplications)
              ? [
                  {
                    label: t`New applications`,
                    value: formatNumber(row.newApplications),
                  },
                ]
              : []),
          ],
        },
      };
    },
  );

const describeOverallRate = (
  row: AnalyticsCategoryRow,
  minimumSample: number,
) =>
  describeAnalyticsRate({
    rate: row.overallRate,
    soFarRate: row.overallSoFarRate,
    eligible: row.overallEligible,
    isUnderMinimum: row.overallEligible < minimumSample,
  });

export const buildAnalyticsCategoryRateRows = (
  categories: AnalyticsCategories,
  formatNumber: FormatNumber,
): AnalyticsCategoryBarRows => {
  const { minimumSample } = categories;

  // Unknown rates go last, and a so far rate is not a finished one, so it ranks after every measured rate.
  const getRank = (row: AnalyticsCategoryRow) => {
    const rate = describeOverallRate(row, minimumSample);

    return rate.isInProgress ? -1 : (rate.value ?? -2);
  };

  return splitCatchAllRows(
    getTopLevelRows(categories).toSorted(
      (rowA, rowB) => getRank(rowB) - getRank(rowA),
    ),
    (row) => {
      const label = getAnalyticsCategoryLabel(row, categories.groupBy);
      const rate = describeOverallRate(row, minimumSample);
      const ofPeople = formatAnalyticsOfPeople(
        rate.isInProgress ? row.cohortSize : row.overallEligible,
        formatNumber,
      );

      return {
        key: row.key,
        label,
        segments: isDefined(rate.value)
          ? [
              {
                key: 'overall',
                label: t`Overall conversion`,
                value: rate.value,
              },
            ]
          : [],
        valueLabel: rate.label ?? undefined,
        isSmallSample: rate.isSmallSample || rate.isInProgress,
        tooltip: {
          title: label,
          rows: [
            {
              label: t`Overall conversion`,
              value: rate.label ?? t`Not enough data`,
            },
          ],
          note: !isDefined(rate.value)
            ? null
            : rate.isSmallSample
              ? t`Small sample, ${ofPeople}`
              : ofPeople,
        },
      };
    },
  );
};
