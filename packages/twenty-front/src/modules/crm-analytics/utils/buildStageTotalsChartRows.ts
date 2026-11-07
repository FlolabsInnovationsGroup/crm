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
    const notPastLimit = row.count - pastLimit;

    return {
      key: row.rowKey,
      label: getAnalyticsStageTotalLabel(row),
      segments: [
        {
          key: 'notPastLimit',
          label: t`Not past limit`,
          value: notPastLimit,
          color: ANALYTICS_CHART_COLOR.accent,
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
      ],
      tooltip: {
        title: getAnalyticsStageTotalLabel(row),
        rows: [
          // A stage with no limit, such as the final one, has nothing to split.
          ...(isDefined(row.pastLimitCount)
            ? [
                {
                  label: t`Not past limit`,
                  value: formatNumber(notPastLimit),
                  color: ANALYTICS_CHART_COLOR.accent,
                },
                {
                  label: t`Past limit`,
                  value: formatNumber(pastLimit),
                  color: ANALYTICS_CHART_COLOR.warning,
                },
              ]
            : [{ label: t`People`, value: formatNumber(row.count) }]),
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
