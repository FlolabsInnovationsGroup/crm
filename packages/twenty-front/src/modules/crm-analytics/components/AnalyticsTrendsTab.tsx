import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import {
  AnalyticsSection,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { AnalyticsTrendChart } from '@/crm-analytics/components/AnalyticsTrendChart';
import {
  AnalyticsTrendTable,
  formatAnalyticsBucketLabel,
} from '@/crm-analytics/components/AnalyticsTrendTable';
import { GET_CRM_ANALYTICS_TRENDS } from '@/crm-analytics/graphql/getCrmAnalyticsTrends';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsPeriod,
  type AnalyticsStageDefinition,
  type AnalyticsTrendMetric,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildTrendsTakeaway } from '@/crm-analytics/utils/buildTrendsTakeaway';
import { getAnalyticsWindowLength } from '@/crm-analytics/utils/getAnalyticsWindowLength';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { Select } from '@/ui/input/components/Select';

const TREND_METRICS: AnalyticsTrendMetric[] = [
  'NEW_APPLICATIONS',
  'TOTAL_CONTACTS',
  'ACTIVE_PEOPLE',
  'STAGE_COUNT',
  'OVERALL_CONVERSION',
  'DROP_OFF',
  'MEDIAN_DAYS',
];

const StyledControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledControl = styled.div`
  width: 184px;
`;

const StyledNotice = styled.p`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding: ${themeCssVariables.spacing[4]};
`;

const getMetricLabel = (metric: AnalyticsTrendMetric) => {
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
      return t`Drop-off`;
    case 'MEDIAN_DAYS':
      return t`Median days in stage`;
  }
};

const getMetricNote = (metric: AnalyticsTrendMetric) => {
  switch (metric) {
    case 'NEW_APPLICATIONS':
      return t`Applications, by submission date. Imported applications have no known date and are left out.`;
    case 'TOTAL_CONTACTS':
      return t`People, from the last daily count in each period.`;
    case 'ACTIVE_PEOPLE':
      return t`People not signed or exited, from the last daily count in each period.`;
    case 'STAGE_COUNT':
      return t`People in this stage, from the last daily count in each period.`;
    case 'OVERALL_CONVERSION':
    case 'DROP_OFF':
      return t`People, by application date. A period appears once its people have passed the window, so the line stops before recent periods.`;
    case 'MEDIAN_DAYS':
      return t`Completed stays, by the date the stay ended. Open stays are not counted.`;
  }
};

const getStageOptions = (
  metric: AnalyticsTrendMetric,
  stages: AnalyticsStageDefinition[],
): { value: string | null; label: string }[] => {
  const toOption = (stage: AnalyticsStageDefinition) => ({
    value: stage.stageKey,
    label: stage.label,
  });

  switch (metric) {
    case 'STAGE_COUNT':
      return stages.map(toOption);
    case 'DROP_OFF':
      return stages
        .filter((stage) => isDefined(stage.windowDays))
        .map(toOption);
    case 'MEDIAN_DAYS':
      return [
        { value: null, label: t`All stages` },
        ...stages.filter((stage) => isDefined(stage.rank)).map(toOption),
      ];
    default:
      return [];
  }
};

const getStageMetricLabel = (
  metric: AnalyticsTrendMetric,
  stageLabel: string,
) => {
  switch (metric) {
    case 'STAGE_COUNT':
      return t`People in ${stageLabel}`;
    case 'DROP_OFF':
      return t`Drop-off from ${stageLabel}`;
    case 'MEDIAN_DAYS':
      return t`Median days in ${stageLabel}`;
    default:
      return getMetricLabel(metric);
  }
};

const getTitleByPeriod = (metricLabel: string, period: AnalyticsPeriod) => {
  switch (period) {
    case 'DAY':
      return t`${metricLabel} by day`;
    case 'WEEK':
      return t`${metricLabel} by week`;
    case 'MONTH':
      return t`${metricLabel} by month`;
  }
};

const getTrendTitle = (trends: AnalyticsTrends, meta: AnalyticsMeta) => {
  const stageLabel = meta.stages.find(
    (stage) => stage.stageKey === trends.stageKey,
  )?.label;

  return getTitleByPeriod(
    isDefined(stageLabel)
      ? getStageMetricLabel(trends.metric, stageLabel)
      : getMetricLabel(trends.metric),
    trends.period,
  );
};

const getTrendNote = (trends: AnalyticsTrends) => {
  const windowLength = getAnalyticsWindowLength(
    trends.series.length,
    trends.period,
  );

  return [
    getMetricNote(trends.metric),
    trends.series.some((point) => isDefined(point.previousValue))
      ? t`Each period is compared with the one ${windowLength} earlier.`
      : null,
    trends.series.at(-1)?.isPartial === true
      ? t`The latest period is still in progress.`
      : null,
  ]
    .filter(isDefined)
    .join(' ');
};

const hasTrendValue = (trends: AnalyticsTrends) =>
  !isDefined(trends.unavailableReason) &&
  trends.series.some(
    (point) => isDefined(point.value) || isDefined(point.previousValue),
  );

const hasNothingToShow = (trends: AnalyticsTrends) =>
  !isDefined(trends.unavailableReason) &&
  !hasTrendValue(trends) &&
  trends.cohorts.length === 0 &&
  trends.movement.rows.every(
    (row) =>
      row.enteredInPeriod === 0 && row.leftInPeriod === 0 && row.countNow === 0,
  );

type AnalyticsTrendsTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onResetFilter: () => void;
};

export const AnalyticsTrendsTab = ({
  filter,
  meta,
  onResetFilter,
}: AnalyticsTrendsTabProps) => {
  const { formatNumber } = useNumberFormat();

  const [metric, setMetric] = useState<AnalyticsTrendMetric>(
    meta.fields.hasFormSubmissionObject ? 'NEW_APPLICATIONS' : 'TOTAL_CONTACTS',
  );
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);

  const stageOptions = getStageOptions(metric, meta.stages);

  // A stage picked for one metric may not exist on the next, so fall back to the metric's first.
  const stageKey = stageOptions.some(({ value }) => value === selectedStageKey)
    ? selectedStageKey
    : (stageOptions[0]?.value ?? null);

  const {
    payload: trends,
    isFirstLoad,
    isRefetching,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsTrends>({
    query: GET_CRM_ANALYTICS_TRENDS,
    rootField: 'getCrmAnalyticsTrends',
    variables: { filter, metric, stageKey },
  });

  const controls = (
    <StyledControls>
      <StyledControl role="group" aria-label={t`Metric`}>
        <Select<AnalyticsTrendMetric>
          dropdownId="crm-analytics-trend-metric"
          selectSizeVariant="small"
          fullWidth
          value={metric}
          options={TREND_METRICS.map((trendMetric) => ({
            value: trendMetric,
            label: getMetricLabel(trendMetric),
          }))}
          onChange={setMetric}
        />
      </StyledControl>
      {stageOptions.length > 0 && (
        <StyledControl role="group" aria-label={t`Stage`}>
          <Select<string | null>
            dropdownId="crm-analytics-trend-stage"
            selectSizeVariant="small"
            fullWidth
            value={stageKey}
            options={stageOptions}
            onChange={setSelectedStageKey}
          />
        </StyledControl>
      )}
    </StyledControls>
  );

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  // The controls stay up so a metric that fails can be swapped for one that works.
  if (isDefined(error)) {
    return (
      <AnalyticsSection title={getMetricLabel(metric)} action={controls}>
        <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />
      </AnalyticsSection>
    );
  }

  if (isFirstLoad) {
    return (
      <AnalyticsSection title={getMetricLabel(metric)} action={controls}>
        <AnalyticsSkeleton shape="chart" />
        <AnalyticsSkeleton shape="table" rowCount={6} columnCount={4} />
      </AnalyticsSection>
    );
  }

  if (!isDefined(trends)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  if (hasNothingToShow(trends)) {
    return (
      <AnalyticsSection title={getMetricLabel(metric)} action={controls}>
        <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />
      </AnalyticsSection>
    );
  }

  const trendTitle = getTrendTitle(trends, meta);

  const movementFrom = formatAnalyticsBucketLabel({
    bucketStart: trends.movement.from,
    period: 'DAY',
  });
  const movementTo = formatAnalyticsBucketLabel({
    bucketStart: trends.movement.to,
    period: 'DAY',
  });

  return (
    <AnalyticsTabLayout
      takeaway={buildTrendsTakeaway({ trends, formatNumber })}
      isRefetching={isRefetching}
    >
      <AnalyticsSection
        title={trendTitle}
        note={getTrendNote(trends)}
        action={controls}
      >
        <AnalyticsTrendChart title={trendTitle} trends={trends} />
        {hasTrendValue(trends) && (
          <AnalyticsTrendTable
            points={trends.series}
            metric={trends.metric}
            period={trends.period}
            minimumSample={trends.minimumSample}
          />
        )}
      </AnalyticsSection>
      <AnalyticsSection
        title={
          trends.period === 'MONTH'
            ? t`Conversion by application month`
            : t`Conversion by application week`
        }
        note={t`People, by application date. Each cell is the share who reached the next stage within its window, with n people counted. Muted means still inside the window or a small sample.`}
      >
        {trends.cohorts.length > 0 ? (
          <AnalyticsCohortTable
            rows={trends.cohorts}
            stages={meta.stages}
            period={trends.period}
            minimumSample={trends.minimumSample}
          />
        ) : (
          <StyledNotice>
            {trends.period === 'DAY'
              ? t`Conversion is grouped by week or month. Choose one in the Period filter.`
              : t`No one has applied in this range since tracking started.`}
          </StyledNotice>
        )}
      </AnalyticsSection>
      <AnalyticsSection
        title={t`Stage movement`}
        note={t`People who entered or left each stage from ${movementFrom} to ${movementTo}, by the date they moved. Now is the current count.`}
      >
        <AnalyticsMovementTable rows={trends.movement.rows} />
      </AnalyticsSection>
    </AnalyticsTabLayout>
  );
};
