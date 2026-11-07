import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsFunnelCharts } from '@/crm-analytics/components/AnalyticsFunnelCharts';
import { AnalyticsTabLayout } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsMeta,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelTakeaway } from '@/crm-analytics/utils/buildFunnelTakeaway';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';
import { hasActiveAnalyticsFilter } from '@/crm-analytics/utils/hasActiveAnalyticsFilter';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

type AnalyticsFunnelTabProps = {
  filter: AnalyticsFilter;
  meta: Pick<AnalyticsMeta, 'stages'>;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter: () => void;
};

export const AnalyticsFunnelTab = ({
  filter,
  meta,
  onResetFilter,
}: AnalyticsFunnelTabProps) => {
  const { formatNumber } = useNumberFormat();

  // Status is disabled on this tab, so a value picked on another tab must not reach the rates.
  const funnelFilter: AnalyticsFilter = { ...filter, status: 'ALL' };

  const {
    payload: funnel,
    isFirstLoad,
    isRefetching,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsFunnel>({
    query: GET_CRM_ANALYTICS_FUNNEL,
    rootField: 'getCrmAnalyticsFunnel',
    variables: { filter: funnelFilter },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (isFirstLoad) {
    return (
      <AnalyticsChartGrid>
        <AnalyticsSkeleton shape="chart" />
        <AnalyticsSkeleton shape="chart" />
      </AnalyticsChartGrid>
    );
  }

  if (!isDefined(funnel)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  const hasActiveFilter = hasActiveAnalyticsFilter(funnelFilter);

  // The server always lists every stage, so an empty view shows as an empty cohort. A filter
  // can match only imported people, who are never in a cohort, so this cannot say nobody matched.
  if (funnel.cohortSize === 0 && hasActiveFilter) {
    return <AnalyticsStatePanel kind="EMPTY_FUNNEL" onReset={onResetFilter} />;
  }

  // Four charts of nothing say less than the launch message and the ledger's own notice.
  if (funnel.cohortSize === 0) {
    return (
      <AnalyticsTabLayout
        takeaway={buildFunnelTakeaway({ funnel, formatNumber })}
        isRefetching={isRefetching}
      >
        <AnalyticsStageLedger funnel={funnel} />
      </AnalyticsTabLayout>
    );
  }

  const cohortPeople = formatAnalyticsPeopleCount(
    funnel.cohortSize,
    formatNumber,
  );
  const trackingStartedOn = i18n.date(new Date(funnel.trackingStartedAt), {
    dateStyle: 'medium',
    timeZone: funnel.reportingTimeZone,
  });
  const cohortSentence = hasActiveFilter
    ? t`Based on ${cohortPeople} matching these filters.`
    : t`Based on ${cohortPeople} who applied since tracking started on ${trackingStartedOn}.`;

  // A measured rate already reads on its answer card, so the line only says who is counted.
  const isOverallMeasured =
    isDefined(funnel.overall.rate) && !funnel.overall.isUnderMinimum;

  return (
    <AnalyticsTabLayout
      takeaway={
        isOverallMeasured
          ? cohortSentence
          : buildFunnelTakeaway({ funnel, formatNumber })
      }
      isRefetching={isRefetching}
    >
      <AnalyticsFunnelCharts funnel={funnel} stages={meta.stages} />
    </AnalyticsTabLayout>
  );
};
