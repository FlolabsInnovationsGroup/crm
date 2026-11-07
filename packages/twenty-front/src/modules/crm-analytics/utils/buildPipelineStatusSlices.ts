import { t } from '@lingui/core/macro';

import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { type AnalyticsDonutSlice } from '@/crm-analytics/charts/AnalyticsDonutChart';
import {
  type AnalyticsStageDefinition,
  type AnalyticsStageTotalRow,
} from '@/crm-analytics/types/AnalyticsApi';

type BuildPipelineStatusSlicesArgs = {
  rows: AnalyticsStageTotalRow[];
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'isSuccess'>[];
};

export const buildPipelineStatusSlices = ({
  rows,
  stages,
}: BuildPipelineStatusSlicesArgs): AnalyticsDonutSlice[] => {
  const isSuccessRow = ({ rowKey }: AnalyticsStageTotalRow) =>
    stages.some(({ stageKey, isSuccess }) => isSuccess && stageKey === rowKey);

  const sumRows = (isCounted: (row: AnalyticsStageTotalRow) => boolean) =>
    rows.reduce(
      (total, row) => (isCounted(row) ? total + row.count : total),
      0,
    );

  const slices: AnalyticsDonutSlice[] = [
    {
      key: 'active',
      label: t`Active`,
      // Same rule as the active people figure: an other stage is still active.
      value: sumRows(
        (row) =>
          (row.rowKind === 'MAIN' && !isSuccessRow(row)) ||
          row.rowKind === 'OTHER',
      ),
      color: ANALYTICS_CHART_COLOR.accent,
    },
    {
      key: 'signed',
      label: t`Signed`,
      value: sumRows((row) => row.rowKind === 'MAIN' && isSuccessRow(row)),
      color: ANALYTICS_CHART_COLOR.accentStrong,
    },
    {
      key: 'left',
      label: t`Left`,
      value: sumRows((row) => row.rowKind === 'EXIT'),
      color: ANALYTICS_CHART_COLOR.neutralStrong,
    },
    {
      key: 'notMapped',
      label: t`Not mapped or no stage`,
      value: sumRows(
        (row) => row.rowKind === 'UNMAPPED' || row.rowKind === 'NO_STAGE',
      ),
      color: ANALYTICS_CHART_COLOR.neutralSoft,
    },
  ];

  return slices.filter(({ value }) => value > 0);
};
