import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsColumnChart } from '@/crm-analytics/charts/AnalyticsColumnChart';
import { getAnalyticsOrdinalColor } from '@/crm-analytics/charts/getAnalyticsOrdinalColor';
import { AnalyticsSeriesTable } from '@/crm-analytics/components/AnalyticsSeriesTable';
import { useCrmAnalyticsSeries } from '@/crm-analytics/hooks/useCrmAnalyticsSeries';
import {
  type AnalyticsFilter,
  type AnalyticsSeries,
  type AnalyticsSeriesRequest,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { getAnalyticsBucketDescription } from '@/crm-analytics/utils/getAnalyticsBucketDescription';
import {
  getAnalyticsSeriesNoValueText,
  getAnalyticsSeriesUnavailableText,
} from '@/crm-analytics/utils/getAnalyticsSeriesEmptyText';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const STAGE_REQUESTS: AnalyticsSeriesRequest[] = [
  { metric: 'STAGE_COUNT', stageKey: null, groupBy: 'STAGE' },
];

const EXIT_STAGE_COLORS = [
  ANALYTICS_CHART_COLOR.neutralStrong,
  ANALYTICS_CHART_COLOR.neutral,
  ANALYTICS_CHART_COLOR.neutralSoft,
];

const buildStageColors = (
  lines: AnalyticsSeries[],
  stages: AnalyticsStageDefinition[],
) => {
  const isExit = ({ groupKey }: AnalyticsSeries) =>
    stages.find((stage) => stage.stageKey === groupKey)?.kind === 'EXIT';

  const mainLines = lines.filter((line) => !isExit(line));
  const exitLines = lines.filter(isExit);

  // One hue climbs through the pipeline, so exits stay gray however many there are.
  return new Map([
    ...mainLines.map((line, index): [AnalyticsSeries, string] => [
      line,
      getAnalyticsOrdinalColor(index, mainLines.length),
    ]),
    ...exitLines.map((line, index): [AnalyticsSeries, string] => [
      line,
      EXIT_STAGE_COLORS[index % EXIT_STAGE_COLORS.length],
    ]),
  ]);
};

type AnalyticsTrendStageChartProps = {
  filter: AnalyticsFilter;
  stages: AnalyticsStageDefinition[];
};

export const AnalyticsTrendStageChart = ({
  filter,
  stages,
}: AnalyticsTrendStageChartProps) => {
  const { formatNumber } = useNumberFormat();

  const {
    payload: bundle,
    isFirstLoad,
    isRefetching,
    error,
    retry,
  } = useCrmAnalyticsSeries({ filter, requests: STAGE_REQUESTS });

  const lines = bundle?.series ?? [];
  // While a new period loads the old buckets stay on screen, so they keep their own labels.
  const period = bundle?.period ?? filter.period;

  const unavailableReason = lines.find((line) =>
    isDefined(line.unavailableReason),
  )?.unavailableReason;
  const hasValue = lines.some(({ points }) =>
    points.some(({ value }) => isDefined(value)),
  );

  const getEmptyMessage = () => {
    if (isDefined(unavailableReason)) {
      return getAnalyticsSeriesUnavailableText(unavailableReason);
    }

    return isDefined(bundle)
      ? getAnalyticsSeriesNoValueText('STAGE_COUNT', period, bundle)
      : undefined;
  };

  const getLineLabel = ({ groupKey, groupLabel }: AnalyticsSeries) =>
    groupLabel ?? groupKey ?? '';

  const stageColors = buildStageColors(lines, stages);

  const columns = (lines[0]?.points ?? []).map(
    ({ bucketStart, isPartial }, bucketIndex) => {
      // Days with no stored count stay unknown: a dash, never a column of zeros.
      const segments = lines.flatMap((line) => {
        const value = line.points[bucketIndex]?.value;

        return isDefined(value)
          ? [
              {
                key: line.groupKey ?? '',
                label: getLineLabel(line),
                value,
                color: stageColors.get(line),
              },
            ]
          : [];
      });
      const total = segments.reduce((sum, { value }) => sum + value, 0);

      return {
        key: bucketStart,
        label: formatAnalyticsBucketLabel({
          bucketStart,
          period,
          isCompact: true,
        }),
        segments,
        tooltip: {
          title: getAnalyticsBucketDescription(bucketStart, period),
          rows: [
            ...segments.map(({ label, value, color }) => ({
              label,
              value: formatNumber(value),
              color,
            })),
            ...(segments.length > 0
              ? [
                  {
                    label: t`Total in these stages`,
                    value: formatNumber(total),
                  },
                ]
              : []),
          ],
          note:
            segments.length === 0
              ? t`No daily count stored`
              : isPartial
                ? t`So far, still in progress`
                : null,
        },
      };
    },
  );

  return (
    <AnalyticsChartCard
      title={t`People in each stage over time`}
      note={t`People in each stage, from the last daily count in each period. Dates only choose the periods shown, not when people were created. Main stages climb from light to dark, and exits are gray. A dash means no count is stored for that period. People in other stages, not mapped or with no stage are not shown, so a column can be lower than Total contacts.`}
      isLoading={isFirstLoad}
      isRefetching={isRefetching}
      error={error}
      onRetry={retry}
      isEmpty={!hasValue}
      emptyMessage={getEmptyMessage()}
      numbers={
        isDefined(bundle) ? (
          <AnalyticsSeriesTable
            aria-label={t`People in each stage over time`}
            columns={lines.map((line) => ({
              key: line.groupKey ?? '',
              label: getLineLabel(line),
              points: line.points,
            }))}
            metric="STAGE_COUNT"
            period={period}
            minimumSample={bundle.minimumSample}
          />
        ) : undefined
      }
    >
      <AnalyticsColumnChart
        ariaLabel={t`People in each stage over time`}
        columns={columns}
        isTimeAxis
      />
    </AnalyticsChartCard>
  );
};
