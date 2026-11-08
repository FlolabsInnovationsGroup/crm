import { i18n } from '@lingui/core';
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

const SMALL_SAMPLE_RANK_SHIFT = 2;
const IN_PROGRESS_RATE_RANK = -3;
const UNKNOWN_RATE_RANK = -4;

type FormatNumber = (value: number) => string;

export type AnalyticsCategoryBarRows = {
  rows: AnalyticsHorizontalBarRow[];
  // People with no value or an unmapped one, kept under a line so they never rank against real groups.
  dividedRows: AnalyticsHorizontalBarRow[];
};

// A report has no filter, so its charts always draw the top level.
const formatShortDate = (value: string) =>
  i18n.date(new Date(`${value.slice(0, 10)}T00:00:00.000Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const getNewApplicationsLabel = ({
  newApplicationsFrom,
  newApplicationsTo,
}: AnalyticsCategories) => {
  if (!isDefined(newApplicationsFrom) || !isDefined(newApplicationsTo)) {
    return t`New applications`;
  }

  const from = formatShortDate(newApplicationsFrom);
  const to = formatShortDate(newApplicationsTo);

  return t`New applications, ${from} to ${to}`;
};

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
                    label: getNewApplicationsLabel(categories),
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

  // Firm rates lead so a tiny group cannot top the chart. A so far rate is not a finished one, and unknown goes last.
  const getRank = (row: AnalyticsCategoryRow) => {
    const rate = describeOverallRate(row, minimumSample);

    if (rate.isInProgress) {
      return IN_PROGRESS_RATE_RANK;
    }

    if (!isDefined(rate.value)) {
      return UNKNOWN_RATE_RANK;
    }

    return rate.isSmallSample
      ? rate.value - SMALL_SAMPLE_RANK_SHIFT
      : rate.value;
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
