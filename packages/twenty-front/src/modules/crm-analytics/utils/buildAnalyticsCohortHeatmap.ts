import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  type AnalyticsHeatmapColumn,
  type AnalyticsHeatmapRow,
} from '@/crm-analytics/charts/AnalyticsHeatmap';
import {
  type AnalyticsCohortRow,
  type AnalyticsFunnelRow,
  type AnalyticsPeriod,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsRateHeatmapCell } from '@/crm-analytics/utils/buildAnalyticsRateHeatmapCell';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';

const OVERALL_COLUMN_KEY = 'OVERALL';

type BuildAnalyticsCohortHeatmapArgs = {
  cohorts: AnalyticsCohortRow[];
  stages: Pick<AnalyticsFunnelRow, 'stageKey' | 'label'>[];
  period: AnalyticsPeriod;
  minimumSample: number;
  formatNumber: (value: number) => string;
};

const getStepColumnLabel = (
  stageKey: string,
  stages: BuildAnalyticsCohortHeatmapArgs['stages'],
) => {
  const stageIndex = stages.findIndex((stage) => stage.stageKey === stageKey);
  const stageLabel = stages[stageIndex]?.label ?? stageKey;
  const nextLabel = stages[stageIndex + 1]?.label;

  return isDefined(nextLabel)
    ? t`${stageLabel} to ${nextLabel}`
    : t`${stageLabel} to next`;
};

export const buildAnalyticsCohortHeatmap = ({
  cohorts,
  stages,
  period,
  minimumSample,
  formatNumber,
}: BuildAnalyticsCohortHeatmapArgs) => {
  const stepStageKeys = [
    ...new Set(
      cohorts.flatMap((row) => row.cells.map((cell) => cell.stageKey)),
    ),
  ];

  const overallLabel = t`Overall`;

  const columns: AnalyticsHeatmapColumn[] = [
    ...stepStageKeys.map((stageKey) => ({
      key: stageKey,
      label: getStepColumnLabel(stageKey, stages),
    })),
    { key: OVERALL_COLUMN_KEY, label: overallLabel },
  ];

  const rows: AnalyticsHeatmapRow[] = cohorts
    .toSorted((rowA, rowB) => rowB.bucketStart.localeCompare(rowA.bucketStart))
    .map((row) => {
      const bucketLabel = formatAnalyticsBucketLabel({
        bucketStart: row.bucketStart,
        period,
      });
      const title =
        period === 'MONTH'
          ? t`People who applied in ${bucketLabel}`
          : t`People who applied in the week of ${bucketLabel}`;

      return {
        key: row.bucketStart,
        label: bucketLabel,
        cells: [
          ...stepStageKeys.map((stageKey) => {
            const cell = row.cells.find(
              (rowCell) => rowCell.stageKey === stageKey,
            );

            // A cell still inside its window only has a so far value, even when some people have passed it.
            return buildAnalyticsRateHeatmapCell({
              columnKey: stageKey,
              title,
              rateLabel: getStepColumnLabel(stageKey, stages),
              rate: cell?.isMature === true ? cell.rate : null,
              soFarRate: cell?.soFarRate,
              count: cell?.eligible ?? 0,
              soFarCount: cell?.entered,
              minimumSample,
              formatNumber,
            });
          }),
          buildAnalyticsRateHeatmapCell({
            columnKey: OVERALL_COLUMN_KEY,
            title,
            rateLabel: overallLabel,
            rate: row.overallRate,
            soFarRate: row.overallSoFarRate,
            count: row.size,
            soFarCount: row.size,
            minimumSample,
            formatNumber,
          }),
        ],
      };
    });

  return { columns, rows };
};
