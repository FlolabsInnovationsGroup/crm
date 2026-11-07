import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { type AnalyticsChartTooltipRow } from '@/crm-analytics/charts/AnalyticsChartTooltip';
import { type AnalyticsHorizontalBarRow } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { type AnalyticsStageTotalRow } from '@/crm-analytics/types/AnalyticsApi';
import { getAnalyticsStageTotalLabel } from '@/crm-analytics/utils/getAnalyticsStageTotalLabel';

type BuildStageTotalsChartRowsArgs = {
  rows: AnalyticsStageTotalRow[];
  formatNumber: (value: number) => string;
};

export const buildStageTotalsChartRows = ({
  rows,
  formatNumber,
}: BuildStageTotalsChartRowsArgs) => {
  const buildInactiveTooltipRows = (
    inactive: number,
  ): AnalyticsChartTooltipRow[] =>
    inactive > 0
      ? [
          {
            label: t`Inactive`,
            value: formatNumber(inactive),
            color: ANALYTICS_CHART_COLOR.neutral,
          },
        ]
      : [];

  const buildNestedTooltipRows = (
    parentStageKey: string,
  ): AnalyticsChartTooltipRow[] =>
    rows
      .filter(
        (row) =>
          row.rowKind === 'NESTED' && row.parentStageKey === parentStageKey,
      )
      .map((row) => ({ label: row.label, value: formatNumber(row.count) }));

  const buildMainRow = (
    row: AnalyticsStageTotalRow,
  ): AnalyticsHorizontalBarRow => {
    const pastLimit = Math.min(row.pastLimitCount ?? 0, row.count);
    // A response from an older server has no inactive count.
    const inactive = Math.min(row.inactiveCount ?? 0, row.count - pastLimit);
    const withinLimit = row.count - pastLimit - inactive;

    return {
      key: row.rowKey,
      label: getAnalyticsStageTotalLabel(row),
      segments: [
        // The legend reads across rows, so a stage with no limit must not join Within limit.
        isDefined(row.pastLimitCount)
          ? {
              key: 'withinLimit',
              label: t`Within limit`,
              value: withinLimit,
              color: ANALYTICS_CHART_COLOR.accent,
            }
          : {
              key: 'people',
              label: t`People`,
              value: withinLimit,
              color: ANALYTICS_CHART_COLOR.accentStrong,
            },
        ...(pastLimit > 0
          ? [
              {
                key: 'pastLimit',
                label: t`Past limit`,
                value: pastLimit,
                color: ANALYTICS_CHART_COLOR.warning,
              },
            ]
          : []),
        ...(inactive > 0
          ? [
              {
                key: 'inactive',
                label: t`Inactive`,
                value: inactive,
                color: ANALYTICS_CHART_COLOR.neutral,
              },
            ]
          : []),
      ],
      tooltip: {
        title: getAnalyticsStageTotalLabel(row),
        rows: [
          // A stage with no limit, such as the final one, has nothing to split.
          ...(isDefined(row.pastLimitCount)
            ? [
                {
                  label: t`Within limit`,
                  value: formatNumber(withinLimit),
                  color: ANALYTICS_CHART_COLOR.accent,
                },
                {
                  label: t`Past limit`,
                  value: formatNumber(pastLimit),
                  color: ANALYTICS_CHART_COLOR.warning,
                },
              ]
            : [{ label: t`People`, value: formatNumber(row.count) }]),
          ...buildInactiveTooltipRows(inactive),
          ...buildNestedTooltipRows(row.rowKey),
        ],
      },
    };
  };

  const buildOtherRow = (
    row: AnalyticsStageTotalRow,
  ): AnalyticsHorizontalBarRow => ({
    key: row.rowKey,
    label: getAnalyticsStageTotalLabel(row),
    segments: [
      { key: 'outside', label: t`Outside the main steps`, value: row.count },
    ],
    tooltip: {
      title: getAnalyticsStageTotalLabel(row),
      rows: [
        { label: t`People`, value: formatNumber(row.count) },
        ...buildInactiveTooltipRows(Math.min(row.inactiveCount ?? 0, row.count)),
        ...buildNestedTooltipRows(row.rowKey),
      ],
    },
  });

  return {
    mainRows: rows
      .filter(({ rowKind }) => rowKind === 'MAIN')
      .map(buildMainRow),
    otherRows: rows
      .filter(
        ({ rowKind, count }) =>
          rowKind !== 'MAIN' && rowKind !== 'NESTED' && count > 0,
      )
      .map(buildOtherRow),
  };
};
