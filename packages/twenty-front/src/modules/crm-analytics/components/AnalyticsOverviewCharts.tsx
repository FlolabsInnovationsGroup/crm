import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsDonutChart } from '@/crm-analytics/charts/AnalyticsDonutChart';
import { AnalyticsHorizontalBarChart } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { AnalyticsLineChart } from '@/crm-analytics/charts/AnalyticsLineChart';
import { AnalyticsFiguresRow } from '@/crm-analytics/components/AnalyticsFiguresRow';
import { AnalyticsOverviewCategoryCard } from '@/crm-analytics/components/AnalyticsOverviewCategoryCard';
import { AnalyticsOverviewFollowUpCard } from '@/crm-analytics/components/AnalyticsOverviewFollowUpCard';
import { AnalyticsStageTotalsTable } from '@/crm-analytics/components/AnalyticsStageTotalsTable';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import { useCrmAnalyticsSeries } from '@/crm-analytics/hooks/useCrmAnalyticsSeries';
import {
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsMeta,
  type AnalyticsOverview,
  type AnalyticsSeriesRequest,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsSparkline } from '@/crm-analytics/utils/buildAnalyticsSparkline';
import { buildOverallConversionAnswer } from '@/crm-analytics/utils/buildOverallConversionAnswer';
import { buildPipelineStatusSlices } from '@/crm-analytics/utils/buildPipelineStatusSlices';
import { buildStageTotalsChartRows } from '@/crm-analytics/utils/buildStageTotalsChartRows';
import { buildWeeklyLineChartBuckets } from '@/crm-analytics/utils/buildWeeklyLineChartBuckets';
import { countAnalyticsUnmappedPeople } from '@/crm-analytics/utils/countAnalyticsUnmappedPeople';
import { hasActiveAnalyticsFilter } from '@/crm-analytics/utils/hasActiveAnalyticsFilter';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const OVERVIEW_SERIES_REQUESTS: AnalyticsSeriesRequest[] = [
  { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'NONE' },
  { metric: 'ACTIVE_PEOPLE', stageKey: null, groupBy: 'NONE' },
  { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'NONE' },
  { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'NONE' },
];

type AnalyticsOverviewChartsProps = {
  overview: AnalyticsOverview;
  figures: AnalyticsOverview['figures'];
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
};

// Sits behind the tab's guards, so a forbidden or empty page sends none of these queries.
export const AnalyticsOverviewCharts = ({
  overview,
  figures,
  filter,
  meta,
  onFilterChange,
}: AnalyticsOverviewChartsProps) => {
  const { formatNumber } = useNumberFormat();

  const { payload: funnel, error: funnelError } =
    useCrmAnalyticsQuery<AnalyticsFunnel>({
      query: GET_CRM_ANALYTICS_FUNNEL,
      rootField: 'getCrmAnalyticsFunnel',
      variables: { filter: { ...filter, status: 'ALL' } },
    });

  // The period selector lives on Trends only, so it must not change this tab out of sight.
  const {
    payload: seriesBundle,
    isFirstLoad: isSeriesFirstLoad,
    error: seriesError,
    retry: retrySeries,
  } = useCrmAnalyticsSeries({
    filter: { ...filter, period: 'WEEK' },
    requests: OVERVIEW_SERIES_REQUESTS,
  });

  const findSeries = (metric: AnalyticsTrendMetric) =>
    seriesBundle?.series.find((series) => series.metric === metric);

  const readSparkline = (metric: AnalyticsTrendMetric, label: string) =>
    buildAnalyticsSparkline({
      points: findSeries(metric)?.points ?? [],
      metric,
      label,
      minimumSample: seriesBundle?.minimumSample ?? 0,
      formatNumber,
    });

  const newApplicationsSeries = findSeries('NEW_APPLICATIONS');
  const newApplicationsPoints = newApplicationsSeries?.points ?? [];
  const hasPreviousApplications = newApplicationsPoints.some((point) =>
    isDefined(point.previousValue),
  );

  const { mainRows, otherRows } = buildStageTotalsChartRows({
    rows: overview.stageTotals,
    formatNumber,
  });

  const handleTrackSelect = (trackKey: string) =>
    onFilterChange?.({
      ...filter,
      trackKey: filter.trackKey === trackKey ? null : trackKey,
      programKey: null,
    });

  const handleSourceSelect = (sourceKey: string) =>
    onFilterChange?.({
      ...filter,
      sourceKey: filter.sourceKey === sourceKey ? null : sourceKey,
    });

  return (
    <>
      <AnalyticsFiguresRow
        figures={figures}
        hasLimits={overview.stuck.hasLimits}
        showSignedFigure={meta.showSignedFigure}
        hasActiveFilter={hasActiveAnalyticsFilter(filter)}
        unmappedPeople={countAnalyticsUnmappedPeople(overview.stageTotals)}
        overallConversion={
          isDefined(funnel)
            ? buildOverallConversionAnswer({ funnel, formatNumber })
            : null
        }
        hasOverallConversionError={isDefined(funnelError)}
        isStatusFiltered={filter.status !== 'ALL'}
        sparklines={{
          activePeople: readSparkline('ACTIVE_PEOPLE', t`Active people`),
          newApplications: readSparkline(
            'NEW_APPLICATIONS',
            t`New applications`,
          ),
          overallConversion: readSparkline(
            'OVERALL_CONVERSION',
            t`Overall conversion`,
          ),
          totalContacts: readSparkline('TOTAL_CONTACTS', t`Total contacts`),
        }}
      />
      <AnalyticsChartGrid>
        <AnalyticsChartCard
          title={t`Where is everyone now?`}
          note={t`People by current stage. A date filter uses the date they were created.`}
          numbers={<AnalyticsStageTotalsTable rows={overview.stageTotals} />}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`People in each stage, past the stage limit or not`}
            rows={mainRows}
            dividedRows={otherRows}
            dividerLabel={t`Outside the main steps`}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Pipeline status`}
          note={t`Everyone in view, by what their current stage means. Not mapped means the stage is not in the analytics setup yet.`}
        >
          <AnalyticsDonutChart
            ariaLabel={t`People who are active, signed, left, or not mapped`}
            slices={buildPipelineStatusSlices({
              rows: overview.stageTotals,
              stages: meta.stages,
            })}
            totalLabel={t`people`}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`New applications over time`}
          note={t`Applications by the week they were submitted. Imported applications have no known date and are not shown.`}
          isLoading={isSeriesFirstLoad}
          error={seriesError}
          onRetry={retrySeries}
          isEmpty={
            newApplicationsSeries?.unavailableReason === 'NO_SUBMISSION_OBJECT'
          }
          emptyMessage={t`This workspace has no application forms.`}
          isFullWidth
        >
          <AnalyticsLineChart
            ariaLabel={t`New applications by week`}
            buckets={buildWeeklyLineChartBuckets(newApplicationsPoints)}
            series={[
              {
                key: 'newApplications',
                label: t`New applications`,
                values: newApplicationsPoints.map(({ value }) => value),
              },
            ]}
            previousValues={
              hasPreviousApplications
                ? newApplicationsPoints.map(({ previousValue }) => previousValue)
                : undefined
            }
            previousLabel={t`Previous period`}
            hasArea
          />
        </AnalyticsChartCard>
        {meta.fields.positionsAppliedFor === 'OK' ? (
          <AnalyticsOverviewCategoryCard
            filter={filter}
            groupBy="TRACK_PROGRAM"
            onSelect={isDefined(onFilterChange) ? handleTrackSelect : undefined}
          />
        ) : (
          <AnalyticsChartCard
            title={t`People by track`}
            isEmpty
            emptyMessage={t`The positions field on People is missing or has the wrong type, so tracks cannot be shown.`}
          />
        )}
        {meta.fields.applicantSource === 'OK' ? (
          <AnalyticsOverviewCategoryCard
            filter={filter}
            groupBy="SOURCE"
            onSelect={
              isDefined(onFilterChange) ? handleSourceSelect : undefined
            }
          />
        ) : (
          <AnalyticsChartCard
            title={t`Top sources`}
            isEmpty
            emptyMessage={t`The source field on People is missing or has the wrong type, so sources cannot be shown.`}
          />
        )}
        <AnalyticsOverviewFollowUpCard stuck={overview.stuck} />
      </AnalyticsChartGrid>
    </>
  );
};
