import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { SegmentedControl } from 'twenty-ui/components/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsDivergingBarChart } from '@/crm-analytics/charts/AnalyticsDivergingBarChart';
import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import { AnalyticsNote } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { AnalyticsTrendCohortHeatmap } from '@/crm-analytics/components/AnalyticsTrendCohortHeatmap';
import { AnalyticsTrendSmallChart } from '@/crm-analytics/components/AnalyticsTrendSmallChart';
import { AnalyticsTrendStageChart } from '@/crm-analytics/components/AnalyticsTrendStageChart';
import { AnalyticsTrendTrackCharts } from '@/crm-analytics/components/AnalyticsTrendTrackCharts';
import { GET_CRM_ANALYTICS_TRENDS } from '@/crm-analytics/graphql/getCrmAnalyticsTrends';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import { useCrmAnalyticsSeries } from '@/crm-analytics/hooks/useCrmAnalyticsSeries';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsPeriod,
  type AnalyticsSeries,
  type AnalyticsSeriesRequest,
  type AnalyticsTrendMetric,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';

const SMALL_CHART_METRICS: AnalyticsTrendMetric[] = [
  'NEW_APPLICATIONS',
  'TOTAL_CONTACTS',
  'ACTIVE_PEOPLE',
  'OVERALL_CONVERSION',
  'DROP_OFF',
  'MEDIAN_DAYS',
];

const SMALL_CHART_REQUESTS: AnalyticsSeriesRequest[] = SMALL_CHART_METRICS.map(
  (metric) => ({ metric, stageKey: null, groupBy: 'NONE' }),
);

const StyledLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledSmallCharts = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
`;

const getSmallChartTitle = (
  metric: AnalyticsTrendMetric,
  dropOffStageLabel: string | undefined,
) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`New applications`;
    case 'TOTAL_CONTACTS':
      return t`Total contacts`;
    case 'ACTIVE_PEOPLE':
      return t`Active people`;
    case 'STAGE_COUNT':
      return t`People in a stage`;
    case 'OVERALL_CONVERSION':
      return t`Overall conversion`;
    case 'DROP_OFF':
      return isDefined(dropOffStageLabel)
        ? t`Drop-off from ${dropOffStageLabel}`
        : t`Drop-off rate`;
    case 'MEDIAN_DAYS':
      return t`Median days in a stage`;
  }
};

const getSmallChartNote = (metric: AnalyticsTrendMetric) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`Applications, by submission date. Imported applications have no known date and are left out.`;
    case 'TOTAL_CONTACTS':
      return t`People, from the last daily count in each period. Dates only choose the periods shown, not when people were created.`;
    case 'ACTIVE_PEOPLE':
      return t`People in a mapped stage who have not signed or exited, from the last daily count in each period. Dates only choose the periods shown, not when people were created.`;
    case 'STAGE_COUNT':
      return t`People in this stage, from the last daily count in each period. Dates only choose the periods shown, not when people were created.`;
    case 'OVERALL_CONVERSION':
      return t`People, by application date. A period has a rate only once all its people have had enough time to reach the end, so the line stops before recent periods.`;
    case 'DROP_OFF':
      return t`The share of people who did not move on from this stage in time, by application date. A period has a rate only once all its people have had enough time.`;
    case 'MEDIAN_DAYS':
      return t`Completed stays in every stage, by the date the stay ended. Open stays are not counted.`;
  }
};

const getDateWideningNote = (
  period: AnalyticsPeriod,
  { dateFrom, dateTo }: AnalyticsFilter,
) => {
  if (!isDefined(dateFrom) && !isDefined(dateTo)) {
    return null;
  }

  switch (period) {
    case 'DAY':
      return null;
    case 'WEEK':
      return t`Dates widen to whole weeks on the charts. Moves use the exact dates.`;
    case 'MONTH':
      return t`Dates widen to whole months on the charts. Moves use the exact dates.`;
  }
};

const getPeriodStart = (date: Temporal.PlainDate, period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return date;
    case 'WEEK':
      return date.subtract({ days: date.dayOfWeek - 1 });
    case 'MONTH':
      return date.with({ day: 1 });
  }
};

// A long range keeps only its latest buckets, so the lines can start after the chosen date.
const getCutRangeNote = (
  series: AnalyticsSeries[],
  { dateFrom, period }: AnalyticsFilter,
) => {
  const points = series.find((line) => line.points.length > 0)?.points ?? [];
  const firstBucketStart = points[0]?.bucketStart;

  if (!isDefined(dateFrom) || !isDefined(firstBucketStart)) {
    return null;
  }

  const requestedStart = getPeriodStart(
    Temporal.PlainDate.from(dateFrom),
    period,
  );

  if (
    Temporal.PlainDate.compare(firstBucketStart.slice(0, 10), requestedStart) <=
    0
  ) {
    return null;
  }

  const periodCount = points.length;

  return t`Showing the latest ${periodCount} periods.`;
};

type AnalyticsTrendsTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter: () => void;
};

export const AnalyticsTrendsTab = ({
  filter,
  meta,
  onFilterChange,
  onResetFilter,
}: AnalyticsTrendsTabProps) => {
  // Status is hidden on this tab, so a value picked on another tab must not reach these numbers.
  const trendsFilter: AnalyticsFilter = { ...filter, status: 'ALL' };
  const { period } = trendsFilter;

  // Overall conversion gets the longest default window, the only one reaching groups old enough to finish.
  const {
    payload: trends,
    isFirstLoad: isTrendsFirstLoad,
    isRefetching: isTrendsRefetching,
    isForbidden,
    error: trendsError,
    retry: retryTrends,
  } = useCrmAnalyticsQuery<AnalyticsTrends>({
    query: GET_CRM_ANALYTICS_TRENDS,
    rootField: 'getCrmAnalyticsTrends',
    variables: {
      filter: trendsFilter,
      metric: 'OVERALL_CONVERSION',
      stageKey: null,
    },
  });

  const {
    payload: smallChartBundle,
    isFirstLoad: isSmallChartsFirstLoad,
    isRefetching: isSmallChartsRefetching,
    error: smallChartsError,
    retry: retrySmallCharts,
  } = useCrmAnalyticsSeries({
    filter: trendsFilter,
    requests: SMALL_CHART_REQUESTS,
  });

  const periodSelector = (
    <SegmentedControl<AnalyticsPeriod>
      aria-label={t`Period`}
      itemWidth="content"
      size="sm"
      value={period}
      onValueChange={(nextPeriod) =>
        onFilterChange?.({ ...filter, period: nextPeriod })
      }
      options={[
        { value: 'DAY', label: t`By day` },
        { value: 'WEEK', label: t`By week` },
        { value: 'MONTH', label: t`By month` },
      ]}
    />
  );

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (trends === null) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  const smallChartSeries = smallChartBundle?.series ?? [];

  // While a new period loads the old buckets stay on screen, so they keep their own labels.
  const smallChartPeriod = smallChartBundle?.period ?? period;
  const cohortPeriod = trends?.period ?? period;

  const handleTrackSelect = (trackKey: string) =>
    onFilterChange?.({
      ...filter,
      trackKey: filter.trackKey === trackKey ? null : trackKey,
      programKey: null,
    });

  // The retained payloads belong to the last filter until both queries settle without an error.
  const isNothingToShow =
    !isDefined(trendsError) &&
    !isDefined(smallChartsError) &&
    !isTrendsRefetching &&
    !isSmallChartsRefetching &&
    isDefined(trends) &&
    isDefined(smallChartBundle) &&
    trends.cohorts.length === 0 &&
    trends.movement.rows.every(
      (row) =>
        row.enteredInPeriod === 0 &&
        row.leftInPeriod === 0 &&
        row.countNow === 0,
    ) &&
    smallChartSeries.every(({ points }) =>
      points.every(
        (point) => !isDefined(point.value) && !isDefined(point.previousValue),
      ),
    );

  if (isNothingToShow) {
    return (
      <StyledLayout>
        <StyledToolbar>{periodSelector}</StyledToolbar>
        <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />
      </StyledLayout>
    );
  }

  // Each card dims for its own query, because the track and stage charts run theirs separately.
  const isRefetching = isTrendsRefetching || isSmallChartsRefetching;

  // Retained buckets from the last filter would read as a cut range.
  const isSmallChartSeriesCurrent =
    !isSmallChartsRefetching && !isDefined(smallChartsError);

  const toolbarNote = [
    getDateWideningNote(period, trendsFilter),
    isSmallChartSeriesCurrent
      ? getCutRangeNote(smallChartSeries, trendsFilter)
      : null,
  ]
    .filter(isDefined)
    .join(' ');

  const entryStageLabel = meta.stages.find((stage) => stage.rank === 0)?.label;

  const getDropOffStageLabel = () => {
    const dropOffStageKey = smallChartSeries.find(
      (series) => series.metric === 'DROP_OFF',
    )?.stageKey;

    return (
      meta.stages.find((stage) => stage.stageKey === dropOffStageKey)?.label ??
      entryStageLabel
    );
  };

  const movementRows = trends?.movement.rows ?? [];
  const hasMovement = movementRows.some(
    (row) => row.enteredInPeriod > 0 || row.leftInPeriod > 0,
  );

  const getMovementNote = () => {
    if (!isDefined(trends)) {
      return undefined;
    }

    const movementFrom = formatAnalyticsBucketLabel({
      bucketStart: trends.movement.from,
      period: 'DAY',
    });
    const movementTo = formatAnalyticsBucketLabel({
      bucketStart: trends.movement.to,
      period: 'DAY',
    });

    return t`Moves into or out of each stage from ${movementFrom} to ${movementTo}, by the date of the move. One person can move more than once.`;
  };

  const cohortRows = trends?.cohorts ?? [];

  return (
    <StyledLayout aria-busy={isRefetching}>
      <StyledToolbar>
        {periodSelector}
        {toolbarNote.length > 0 && <AnalyticsNote>{toolbarNote}</AnalyticsNote>}
      </StyledToolbar>
      <StyledSmallCharts>
        {SMALL_CHART_METRICS.map((metric) => (
          <AnalyticsTrendSmallChart
            key={metric}
            title={getSmallChartTitle(metric, getDropOffStageLabel())}
            note={getSmallChartNote(metric)}
            metric={metric}
            period={smallChartPeriod}
            base={smallChartBundle ?? undefined}
            series={smallChartSeries.find((series) => series.metric === metric)}
            isLoading={isSmallChartsFirstLoad}
            isRefetching={isSmallChartsRefetching}
            error={smallChartsError}
            onRetry={retrySmallCharts}
          />
        ))}
      </StyledSmallCharts>
      <AnalyticsChartGrid>
        <AnalyticsTrendTrackCharts
          filter={trendsFilter}
          meta={meta}
          onTrackSelect={
            isDefined(onFilterChange) ? handleTrackSelect : undefined
          }
        />
        <AnalyticsTrendStageChart filter={trendsFilter} stages={meta.stages} />
        <AnalyticsChartCard
          title={t`What moved this period?`}
          note={getMovementNote()}
          isLoading={isTrendsFirstLoad}
          isRefetching={isTrendsRefetching}
          error={trendsError}
          onRetry={retryTrends}
          isEmpty={!hasMovement}
          emptyMessage={t`No one changed stage in this period.`}
          numbers={<AnalyticsMovementTable rows={movementRows} />}
        >
          <AnalyticsDivergingBarChart
            ariaLabel={t`Moves into and out of each stage this period`}
            rows={movementRows.map((row) => ({
              key: row.stageKey,
              label: row.label,
              rightValue: row.enteredInPeriod,
              leftValue: row.leftInPeriod,
            }))}
            rightLabel={t`Entered`}
            leftLabel={t`Moved out`}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Are newer groups converting better?`}
          note={t`Each row is the people who applied in that period. Each cell is the share who reached the next stage in time. Lighter with stripes says so far, lighter alone is a small group, and a dash means not enough data.`}
          isFullWidth
          isLoading={isTrendsFirstLoad}
          isRefetching={isTrendsRefetching}
          error={trendsError}
          onRetry={retryTrends}
          isEmpty={cohortRows.length === 0}
          emptyMessage={
            cohortPeriod === 'DAY'
              ? t`Groups of applicants are compared by week or month. Choose By week or By month.`
              : t`No one has applied in this range since tracking started.`
          }
          numbers={
            isDefined(trends) ? (
              <AnalyticsCohortTable
                rows={cohortRows}
                stages={meta.stages}
                period={cohortPeriod}
                minimumSample={trends.minimumSample}
              />
            ) : undefined
          }
        >
          <AnalyticsTrendCohortHeatmap
            rows={cohortRows}
            stages={meta.stages}
            period={cohortPeriod}
            minimumSample={trends?.minimumSample ?? 0}
          />
        </AnalyticsChartCard>
      </AnalyticsChartGrid>
    </StyledLayout>
  );
};
