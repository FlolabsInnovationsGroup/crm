import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { SegmentedControl } from 'twenty-ui/components/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsCategoryCharts } from '@/crm-analytics/components/AnalyticsCategoryCharts';
import { AnalyticsNotice } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_CATEGORIES } from '@/crm-analytics/graphql/getCrmAnalyticsCategories';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryGroupBy,
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';

const StyledLayout = styled.div<{ isRefetching: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  opacity: ${({ isRefetching }) => (isRefetching ? 0.6 : 1)};
`;

const getFieldNotice = (
  groupBy: AnalyticsCategoryGroupBy,
  fields: AnalyticsMeta['fields'],
) => {
  if (groupBy === 'SOURCE') {
    return fields.applicantSource === 'OK'
      ? null
      : t`The source field on People is missing or has the wrong type, so sources cannot be shown.`;
  }

  return fields.positionsAppliedFor === 'OK'
    ? null
    : t`The positions field on People is missing or has the wrong type, so tracks and programs cannot be shown.`;
};

type AnalyticsCategoriesViewProps = {
  filter: AnalyticsFilter;
  groupBy: AnalyticsCategoryGroupBy;
  groupSwitch: ReactNode;
  stages: AnalyticsStageDefinition[];
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter: () => void;
};

// Separate from the tab so a group whose field is missing never sends a query.
const AnalyticsCategoriesView = ({
  filter,
  groupBy,
  groupSwitch,
  stages,
  onFilterChange,
  onResetFilter,
}: AnalyticsCategoriesViewProps) => {
  const {
    payload: categories,
    isFirstLoad,
    isRefetching,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsCategories>({
    query: GET_CRM_ANALYTICS_CATEGORIES,
    rootField: 'getCrmAnalyticsCategories',
    // The server ignores period here, so the Trends selector must not miss this cache.
    variables: { filter: { ...filter, period: 'WEEK' }, groupBy },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return (
      <StyledLayout isRefetching={false}>
        {groupSwitch}
        <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />
      </StyledLayout>
    );
  }

  const loadingView = (
    <StyledLayout isRefetching={false}>
      {groupSwitch}
      <AnalyticsChartGrid>
        <AnalyticsChartCard title={t`How many people in each?`} isLoading />
        <AnalyticsChartCard title={t`Which converts best?`} isLoading />
      </AnalyticsChartGrid>
    </StyledLayout>
  );

  if (isFirstLoad) {
    return loadingView;
  }

  if (!isDefined(categories)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  // People are limited by creation date and applications are not, so a filter can leave only applications.
  const isEmpty = categories.rows.every(
    (row) => row.people === 0 && (row.newApplications ?? 0) === 0,
  );

  if (isEmpty) {
    // The payload is still the old filter's, so it says nothing yet about this one.
    if (isRefetching) {
      return loadingView;
    }

    return (
      <StyledLayout isRefetching={false}>
        {groupSwitch}
        <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />
      </StyledLayout>
    );
  }

  return (
    <StyledLayout aria-busy={isRefetching} isRefetching={isRefetching}>
      {groupSwitch}
      <AnalyticsCategoryCharts
        categories={categories}
        filter={filter}
        stages={stages}
        onFilterChange={onFilterChange}
      />
    </StyledLayout>
  );
};

type AnalyticsCategoriesTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter: () => void;
};

export const AnalyticsCategoriesTab = ({
  filter,
  meta,
  onFilterChange,
  onResetFilter,
}: AnalyticsCategoriesTabProps) => {
  const [groupBy, setGroupBy] =
    useState<AnalyticsCategoryGroupBy>('TRACK_PROGRAM');

  const groupSwitch = (
    <div>
      <SegmentedControl<AnalyticsCategoryGroupBy>
        aria-label={t`Group by`}
        itemWidth="content"
        size="sm"
        value={groupBy}
        onValueChange={(nextGroupBy) => setGroupBy(nextGroupBy)}
        options={[
          { value: 'TRACK_PROGRAM', label: t`Tracks and programs` },
          { value: 'SOURCE', label: t`Sources` },
        ]}
      />
    </div>
  );

  const fieldNotice = getFieldNotice(groupBy, meta.fields);

  if (isDefined(fieldNotice)) {
    return (
      <StyledLayout isRefetching={false}>
        {groupSwitch}
        <AnalyticsNotice>{fieldNotice}</AnalyticsNotice>
      </StyledLayout>
    );
  }

  return (
    <AnalyticsCategoriesView
      filter={filter}
      groupBy={groupBy}
      groupSwitch={groupSwitch}
      stages={meta.stages}
      onFilterChange={onFilterChange}
      onResetFilter={onResetFilter}
    />
  );
};
