import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsHeatmap } from '@/crm-analytics/charts/AnalyticsHeatmap';
import {
  type AnalyticsCohortRow,
  type AnalyticsPeriod,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsRateHeatmapCell } from '@/crm-analytics/utils/buildAnalyticsRateHeatmapCell';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const OVERALL_COLUMN_KEY = 'OVERALL';

type AnalyticsTrendCohortHeatmapProps = {
  rows: AnalyticsCohortRow[];
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'label'>[];
  period: AnalyticsPeriod;
  minimumSample: number;
};

export const AnalyticsTrendCohortHeatmap = ({
  rows,
  stages,
  period,
  minimumSample,
}: AnalyticsTrendCohortHeatmapProps) => {
  const { formatNumber } = useNumberFormat();

  const stageKeys = [
    ...new Set(rows.flatMap((row) => row.cells.map((cell) => cell.stageKey))),
  ];

  const stepColumns = stageKeys.map((stageKey) => {
    const stageLabel =
      stages.find((stage) => stage.stageKey === stageKey)?.label ?? stageKey;

    return { key: stageKey, label: t`${stageLabel} to next` };
  });

  const newestFirstRows = rows.toSorted((firstRow, secondRow) =>
    secondRow.bucketStart.localeCompare(firstRow.bucketStart),
  );

  return (
    <AnalyticsHeatmap
      ariaLabel={t`Conversion at every step for people who applied in each period`}
      rowHeaderLabel={
        period === 'MONTH'
          ? t`People who applied in`
          : t`People who applied in the week of`
      }
      columns={[...stepColumns, { key: OVERALL_COLUMN_KEY, label: t`Overall` }]}
      rows={newestFirstRows.map((row) => {
        const label = formatAnalyticsBucketLabel({
          bucketStart: row.bucketStart,
          period,
        });
        const appliedText =
          period === 'MONTH'
            ? t`People who applied in ${label}`
            : t`People who applied in the week of ${label}`;

        return {
          key: row.bucketStart,
          label,
          cells: [
            ...stepColumns.map(({ key, label: columnLabel }) => {
              const cell = row.cells.find(
                (candidate) => candidate.stageKey === key,
              );

              // A cell still inside its window only has a so far value, even when some have passed it.
              return buildAnalyticsRateHeatmapCell({
                columnKey: key,
                title: t`${appliedText}, ${columnLabel}`,
                rateLabel: t`Moved on`,
                rate:
                  isDefined(cell) && cell.isMature && cell.eligible > 0
                    ? cell.rate
                    : null,
                soFarRate: cell?.soFarRate,
                count: cell?.eligible ?? 0,
                soFarCount: cell?.entered,
                minimumSample,
                formatNumber,
              });
            }),
            buildAnalyticsRateHeatmapCell({
              columnKey: OVERALL_COLUMN_KEY,
              title: t`${appliedText}, overall`,
              rateLabel: t`Overall conversion`,
              rate: row.overallRate,
              soFarRate: row.overallSoFarRate,
              count: row.size,
              soFarCount: row.size,
              minimumSample,
              formatNumber,
            }),
          ],
        };
      })}
    />
  );
};
