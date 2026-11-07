import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsFiguresRow } from '@/crm-analytics/components/AnalyticsFiguresRow';
import {
  AnalyticsSection,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStageTotalsTable } from '@/crm-analytics/components/AnalyticsStageTotalsTable';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { AnalyticsStuckTable } from '@/crm-analytics/components/AnalyticsStuckTable';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsOverview,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildOverviewTakeaway } from '@/crm-analytics/utils/buildOverviewTakeaway';
import { countAnalyticsUnmappedPeople } from '@/crm-analytics/utils/countAnalyticsUnmappedPeople';
import { hasActiveAnalyticsFilter } from '@/crm-analytics/utils/hasActiveAnalyticsFilter';
import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledViews = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[5]};
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
`;

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
  onResetFilter: () => void;
};

export const AnalyticsOverviewTab = ({
  filter,
  meta,
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
        <StyledViews>
          <AnalyticsSkeleton shape="table" />
          <AnalyticsSkeleton shape="table" columnCount={4} />
        </StyledViews>
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
      <AnalyticsFiguresRow
        figures={getFiguresWithTrackedPrevious(overview)}
        hasLimits={overview.stuck.hasLimits}
        showSignedFigure={meta.showSignedFigure}
        hasActiveFilter={hasActiveAnalyticsFilter(filter)}
        unmappedPeople={countAnalyticsUnmappedPeople(overview.stageTotals)}
      />
      <StyledViews>
        <AnalyticsSection
          title={t`Where people are now`}
          note={t`People by current stage. A date filter uses the date they were created.`}
        >
          <AnalyticsStageTotalsTable rows={overview.stageTotals} />
        </AnalyticsSection>
        <AnalyticsSection
          title={t`People to follow up`}
          note={t`Active people past their stage limit. Inactive imported people are counted, not listed.`}
        >
          <AnalyticsStuckTable stuck={overview.stuck} />
        </AnalyticsSection>
      </StyledViews>
    </AnalyticsTabLayout>
  );
};
