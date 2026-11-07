import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsOverviewCharts } from '@/crm-analytics/components/AnalyticsOverviewCharts';
import { AnalyticsTabLayout } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsOverview,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildOverviewTakeaway } from '@/crm-analytics/utils/buildOverviewTakeaway';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledLoading = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
`;

// The server counts the same span before the range even when it reaches back before tracking.
const getFiguresWithTrackedPrevious = (overview: AnalyticsOverview) => {
  const { figures } = overview;

  const rangeStart = Temporal.PlainDate.from(figures.newApplicationsFrom);
  const dayCount =
    rangeStart.until(figures.newApplicationsTo, { largestUnit: 'days' }).days +
    1;
  const previousStart = rangeStart.subtract({ days: dayCount }).toString();

  return isAnalyticsPeriodFullyTracked(previousStart, overview)
    ? figures
    : { ...figures, newApplicationsPrevious: null };
};

type AnalyticsOverviewTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter: () => void;
};

export const AnalyticsOverviewTab = ({
  filter,
  meta,
  onFilterChange,
  onResetFilter,
}: AnalyticsOverviewTabProps) => {
  const { formatNumber } = useNumberFormat();

  const {
    payload: overview,
    isFirstLoad,
    isRefetching,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsOverview>({
    query: GET_CRM_ANALYTICS_OVERVIEW,
    rootField: 'getCrmAnalyticsOverview',
    variables: { filter },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (isFirstLoad) {
    return (
      <StyledLoading>
        <AnalyticsSkeleton shape="figures" />
        <AnalyticsChartGrid>
          <AnalyticsSkeleton shape="chart" />
          <AnalyticsSkeleton shape="chart" />
        </AnalyticsChartGrid>
      </StyledLoading>
    );
  }

  if (!isDefined(overview)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  if (overview.figures.totalContacts === 0) {
    return <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />;
  }

  const importedExcludedByDate = formatNumber(overview.importedExcludedByDate);

  return (
    <AnalyticsTabLayout
      takeaway={buildOverviewTakeaway({ overview, formatNumber })}
      notices={
        overview.importedExcludedByDate > 0
          ? [
              t`${importedExcludedByDate} imported people have no known application date and are not shown.`,
            ]
          : []
      }
      isRefetching={isRefetching}
    >
      <AnalyticsOverviewCharts
        isOverviewRefetching={isRefetching}
        overview={overview}
        figures={getFiguresWithTrackedPrevious(overview)}
        filter={filter}
        meta={meta}
        onFilterChange={onFilterChange}
      />
    </AnalyticsTabLayout>
  );
};
