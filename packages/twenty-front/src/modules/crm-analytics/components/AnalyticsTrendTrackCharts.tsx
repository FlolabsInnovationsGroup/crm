import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ANALYTICS_CHART_CATEGORICAL_COLORS } from '@/crm-analytics/charts/AnalyticsChartCategoricalColors';
import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { ANALYTICS_CHART_COLOR } from '@/crm-analytics/charts/AnalyticsChartColor';
import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsSeriesTable } from '@/crm-analytics/components/AnalyticsSeriesTable';
import { useCrmAnalyticsSeries } from '@/crm-analytics/hooks/useCrmAnalyticsSeries';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsSeriesRequest,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsSeriesBuckets } from '@/crm-analytics/utils/buildAnalyticsSeriesBuckets';
import { buildAnalyticsSeriesSample } from '@/crm-analytics/utils/buildAnalyticsSeriesSample';
import { getAnalyticsProgramFilterLabel } from '@/crm-analytics/utils/getAnalyticsFilterLabels';
import { isAnalyticsRateMetric } from '@/crm-analytics/utils/isAnalyticsRateMetric';
import { formatAnalyticsTrendValue } from '@/crm-analytics/utils/formatAnalyticsTrendValue';
import {
  getAnalyticsSeriesNoValueText,
  getAnalyticsSeriesUnavailableText,
} from '@/crm-analytics/utils/getAnalyticsSeriesEmptyText';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const TRACK_LINE_REQUESTS: AnalyticsSeriesRequest[] = [
  { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'TRACK' },
  { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'TRACK' },
];

const getCardTitle = (metric: AnalyticsTrendMetric) =>
  isAnalyticsRateMetric(metric)
    ? t`Overall conversion by track`
    : t`New applications by track`;

const getCardNote = (metric: AnalyticsTrendMetric) =>
  isAnalyticsRateMetric(metric)
    ? t`People, by application date and current positions, so a person with several positions counts in each track. The line stops before recent periods, because newer applicants have not had enough time yet.`
    : t`Applications, by submission date and the person's current positions, so a person with several positions counts in each track. Imported applications have no known date and are left out.`;

type AnalyticsTrendTrackChartsProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onTrackSelect?: (trackKey: string) => void;
};

// Separate from the tab so a missing positions field never sends this query.
const AnalyticsTrendTrackLines = ({
  filter,
  meta,
  onTrackSelect,
}: AnalyticsTrendTrackChartsProps) => {
  const { formatNumber } = useNumberFormat();

  const {
    payload: bundle,
    isFirstLoad,
    isRefetching,
    error,
    retry,
  } = useCrmAnalyticsSeries({ filter, requests: TRACK_LINE_REQUESTS });

  // While a new period loads the old buckets stay on screen, so they keep their own labels.
  const period = bundle?.period ?? filter.period;

  const renderCard = ({ metric }: AnalyticsSeriesRequest) => {
    const lines = (bundle?.series ?? []).filter(
      (series) => series.metric === metric,
    );
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
        ? getAnalyticsSeriesNoValueText(metric, period, bundle)
        : undefined;
    };

    const getLineKey = (groupKey: string | null) => groupKey ?? 'all';
    // Under a program filter the one line counts only that program, not its whole track.
    const getLineLabel = (groupLabel: string | null) =>
      isDefined(filter.programKey) && lines.length === 1
        ? getAnalyticsProgramFilterLabel(filter.programKey, meta)
        : (groupLabel ?? t`All`);

    return (
      <AnalyticsChartCard
        key={metric}
        title={getCardTitle(metric)}
        note={getCardNote(metric)}
        isLoading={isFirstLoad}
        isRefetching={isRefetching}
        error={error}
        onRetry={retry}
        isEmpty={!hasValue}
        emptyMessage={getEmptyMessage()}
        numbers={
          isDefined(bundle) ? (
            <AnalyticsSeriesTable
              aria-label={getCardTitle(metric)}
              columns={lines.map(({ groupKey, groupLabel, points }) => ({
                key: getLineKey(groupKey),
                label: getLineLabel(groupLabel),
                points,
              }))}
              metric={metric}
              period={period}
              minimumSample={bundle.minimumSample}
            />
          ) : undefined
        }
      >
        <AnalyticsLineChart
          ariaLabel={getCardTitle(metric)}
          buckets={buildAnalyticsSeriesBuckets({
            points: lines[0]?.points ?? [],
            period,
            formatNumber,
          })}
          series={lines.map(({ groupKey, groupLabel, points }) => {
            const trackIndex = meta.tracks.findIndex(
              (track) => track.key === groupKey,
            );

            return {
              key: getLineKey(groupKey),
              label: getLineLabel(groupLabel),
              values: points.map(({ value }) => value),
              // By the track's place in meta, so a track keeps its color when filtered.
              color:
                ANALYTICS_CHART_CATEGORICAL_COLORS[trackIndex] ??
                ANALYTICS_CHART_COLOR.neutral,
              ...buildAnalyticsSeriesSample({
                points,
                metric,
                minimumSample: bundle?.minimumSample ?? 0,
                formatNumber,
              }),
            };
          })}
          formatValue={(value) =>
            formatAnalyticsTrendValue(value, metric, formatNumber)
          }
          isRate={isAnalyticsRateMetric(metric)}
          onSeriesClick={onTrackSelect}
        />
      </AnalyticsChartCard>
    );
  };

  return <>{TRACK_LINE_REQUESTS.map(renderCard)}</>;
};

export const AnalyticsTrendTrackCharts = ({
  filter,
  meta,
  onTrackSelect,
}: AnalyticsTrendTrackChartsProps) => {
  if (meta.fields.positionsAppliedFor !== 'OK') {
    return (
      <>
        {TRACK_LINE_REQUESTS.map(({ metric }) => (
          <AnalyticsChartCard
            key={metric}
            title={getCardTitle(metric)}
            isEmpty
            emptyMessage={t`The positions field on People is missing or has the wrong type, so tracks cannot be shown.`}
          />
        ))}
      </>
    );
  }

  return (
    <AnalyticsTrendTrackLines
      filter={filter}
      meta={meta}
      onTrackSelect={onTrackSelect}
    />
  );
};
