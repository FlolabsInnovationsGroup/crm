import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  AnalyticsSection,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
  type AnalyticsMeta,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelTakeaway } from '@/crm-analytics/utils/buildFunnelTakeaway';
import { hasActiveAnalyticsFilter } from '@/crm-analytics/utils/hasActiveAnalyticsFilter';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const getLedgerNote = (rows: AnalyticsFunnelRow[]) => {
  const stepWindows = new Set(
    rows.map((row) => row.windowDays).filter(isDefined),
  );

  if (stepWindows.size !== 1) {
    return t`People, by application date. To next counts only people past the window of each stage; too recent means still inside it.`;
  }

  const [stepWindowDays] = stepWindows;

  return t`People, by application date. To next counts only people past the ${stepWindowDays}-day window; too recent means still inside it.`;
};

type AnalyticsFunnelTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onResetFilter: () => void;
};

export const AnalyticsFunnelTab = ({
  filter,
  onResetFilter,
}: AnalyticsFunnelTabProps) => {
  const { formatNumber } = useNumberFormat();

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
    variables: { filter },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (isFirstLoad) {
    return <AnalyticsSkeleton shape="table" rowCount={9} columnCount={7} />;
  }

  if (!isDefined(funnel)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  // The server always lists every stage, so an empty view shows as an empty cohort.
  if (funnel.cohortSize === 0 && hasActiveAnalyticsFilter(filter)) {
    return <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />;
  }

  return (
    <AnalyticsTabLayout
      takeaway={buildFunnelTakeaway({ funnel, formatNumber })}
      isRefetching={isRefetching}
    >
      <AnalyticsSection
        title={t`Stage by stage`}
        note={getLedgerNote(funnel.rows)}
      >
        <AnalyticsStageLedger funnel={funnel} />
      </AnalyticsSection>
    </AnalyticsTabLayout>
  );
};
