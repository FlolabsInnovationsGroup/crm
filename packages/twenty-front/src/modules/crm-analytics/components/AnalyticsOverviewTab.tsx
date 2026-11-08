import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsOverviewCharts } from '@/crm-analytics/components/AnalyticsOverviewCharts';
import {
  AnalyticsNotice,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
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

const StyledStack = styled.div`
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
    // The server ignores period here, so the Trends selector must not miss this cache.
    variables: { filter: { ...filter, period: 'WEEK' } },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  const loadingView = (
    <StyledStack>
      <AnalyticsSkeleton shape="figures" />
      <AnalyticsChartGrid>
        <AnalyticsSkeleton shape="chart" />
        <AnalyticsSkeleton shape="chart" />
      </AnalyticsChartGrid>
    </StyledStack>
  );

  if (isFirstLoad) {
    return loadingView;
  }

  if (!isDefined(overview)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  const importedExcludedByDate = formatNumber(overview.importedExcludedByDate);
  const importedNotice =
    overview.importedExcludedByDate > 0
      ? t`${importedExcludedByDate} imported people have no known application date and are not shown.`
      : null;

  // People are limited by creation date and applications are not, so a filter can leave only applications.
  if (
    overview.figures.totalContacts === 0 &&
    (overview.figures.newApplications ?? 0) === 0
  ) {
    // The payload is still the old filter's, so it says nothing yet about this one.
    if (isRefetching) {
      return loadingView;
    }

    return (
      <StyledStack>
        {isDefined(importedNotice) && (
          <AnalyticsNotice>{importedNotice}</AnalyticsNotice>
        )}
        <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />
      </StyledStack>
    );
  }

  return (
    <AnalyticsTabLayout
      takeaway={buildOverviewTakeaway({ overview, formatNumber })}
      notices={isDefined(importedNotice) ? [importedNotice] : []}
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
