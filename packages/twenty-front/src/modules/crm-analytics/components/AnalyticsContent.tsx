import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { InlineBanner } from 'twenty-ui/components/feedback';
import { IconAlertTriangle } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsCategoriesTab } from '@/crm-analytics/components/AnalyticsCategoriesTab';
import { AnalyticsFilterBar } from '@/crm-analytics/components/AnalyticsFilterBar';
import { AnalyticsFunnelTab } from '@/crm-analytics/components/AnalyticsFunnelTab';
import { AnalyticsOverviewTab } from '@/crm-analytics/components/AnalyticsOverviewTab';
import { AnalyticsReportsTab } from '@/crm-analytics/components/AnalyticsReportsTab';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { AnalyticsTrendsTab } from '@/crm-analytics/components/AnalyticsTrendsTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { CRM_ANALYTICS_TAB_LIST_INSTANCE_ID } from '@/crm-analytics/constants/CrmAnalyticsTabListInstanceId';
import { useCrmAnalyticsMeta } from '@/crm-analytics/hooks/useCrmAnalyticsMeta';
import { TabList } from '@/ui/layout/tab-list/components/TabList';
import { TabListRoot } from '@/ui/layout/tab-list/components/TabListRoot';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const StyledBanners = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]} 0;
`;

const StyledTabList = styled(TabList)`
  padding: 0 ${themeCssVariables.spacing[4]};
`;

const StyledBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledLoading = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
`;

export const AnalyticsContent = () => {
  const { meta, isFirstLoad, isForbidden, error, retry } =
    useCrmAnalyticsMeta();
  const [filter, setFilter] = useState(CRM_ANALYTICS_DEFAULT_FILTER);
  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    CRM_ANALYTICS_TAB_LIST_INSTANCE_ID,
  );

  if (isFirstLoad) {
    return (
      <StyledBody>
        <StyledLoading>
          <AnalyticsSkeleton shape="figures" />
          <AnalyticsSkeleton shape="table" />
        </StyledLoading>
      </StyledBody>
    );
  }

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error) && !isDefined(meta)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (!isDefined(meta) || meta.state === 'DISABLED') {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  if (meta.state === 'NO_STAGE_FIELD') {
    return <AnalyticsStatePanel kind="NO_STAGE_FIELD" />;
  }

  if (meta.state === 'NEVER_SYNCED') {
    return <AnalyticsStatePanel kind="NEVER_SYNCED" />;
  }

  const resetFilter = () =>
    setFilter({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      period: filter.period,
    });

  const isStageRecordingOff = !meta.fields.isStageAuditLogged;
  const hasBanner =
    meta.sync.isStale || isStageRecordingOff || meta.isProvisional;

  return (
    <StyledContainer>
      {hasBanner && (
        <StyledBanners>
          {meta.sync.isStale && (
            <InlineBanner
              status="warning"
              variant="soft"
              embedded
              icon={<IconAlertTriangle aria-hidden="true" />}
            >
              {t`No successful sync in the last hour. Numbers may be out of date.`}
            </InlineBanner>
          )}
          {isStageRecordingOff && (
            <InlineBanner
              status="warning"
              variant="soft"
              embedded
              icon={<IconAlertTriangle aria-hidden="true" />}
            >
              {t`Stage changes are not being recorded on the timeline.`}
            </InlineBanner>
          )}
          {meta.isProvisional && (
            <InlineBanner status="neutral" variant="soft" embedded>
              {t`Definitions are provisional until recruiting confirms them.`}
            </InlineBanner>
          )}
        </StyledBanners>
      )}
      <TabListRoot componentInstanceId={CRM_ANALYTICS_TAB_LIST_INSTANCE_ID}>
        <StyledTabList
          aria-label={t`Analytics views`}
          componentInstanceId={CRM_ANALYTICS_TAB_LIST_INSTANCE_ID}
          tabs={[
            { id: 'overview', title: t`Overview` },
            { id: 'funnel', title: t`Funnel` },
            { id: 'categories', title: t`Categories` },
            { id: 'trends', title: t`Trends` },
            { id: 'reports', title: t`Reports` },
          ]}
        />
        {activeTabId !== 'reports' && (
          <AnalyticsFilterBar
            filter={filter}
            meta={meta}
            isPeriodEnabled={activeTabId === 'trends'}
            onChange={setFilter}
            onReset={resetFilter}
          />
        )}
        <StyledBody>
          {activeTabId === 'overview' && (
            <AnalyticsOverviewTab
              filter={filter}
              meta={meta}
              onResetFilter={resetFilter}
            />
          )}
          {activeTabId === 'funnel' && (
            <AnalyticsFunnelTab
              filter={filter}
              meta={meta}
              onResetFilter={resetFilter}
            />
          )}
          {activeTabId === 'categories' && (
            <AnalyticsCategoriesTab
              filter={filter}
              meta={meta}
              onResetFilter={resetFilter}
            />
          )}
          {activeTabId === 'trends' && (
            <AnalyticsTrendsTab
              filter={filter}
              meta={meta}
              onResetFilter={resetFilter}
            />
          )}
          {activeTabId === 'reports' && <AnalyticsReportsTab meta={meta} />}
        </StyledBody>
      </TabListRoot>
    </StyledContainer>
  );
};
