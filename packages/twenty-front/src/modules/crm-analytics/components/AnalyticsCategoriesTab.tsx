import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { SegmentedControl } from 'twenty-ui/components/input';

import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import {
  AnalyticsNotice,
  AnalyticsSection,
  AnalyticsTabLayout,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_CATEGORIES } from '@/crm-analytics/graphql/getCrmAnalyticsCategories';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryGroupBy,
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsStageDefinition,
  type AnalyticsStatusFilter,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildCategoriesTakeaway } from '@/crm-analytics/utils/buildCategoriesTakeaway';

const getSectionTitle = (groupBy: AnalyticsCategoryGroupBy) =>
  groupBy === 'SOURCE' ? t`Sources` : t`Tracks and programs`;

const getSectionNote = (
  groupBy: AnalyticsCategoryGroupBy,
  status: AnalyticsStatusFilter,
) =>
  [
    groupBy === 'SOURCE'
      ? t`People by their current source. New applications by submission date, in the date filter or else the last 7 days. Rates by application date. A date filter leaves out imported people.`
      : t`People by their current positions, counted once in each. New applications by submission date, in the date filter or else the last 7 days. Rates by application date. A date filter leaves out imported people.`,
    status === 'ALL' ? null : t`Rates ignore the status filter.`,
    t`n/a means not enough data.`,
  ]
    .filter(isDefined)
    .join(' ');

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
  onResetFilter: () => void;
};

// Separate from the tab so a group whose field is missing never sends a query.
const AnalyticsCategoriesView = ({
  filter,
  groupBy,
  groupSwitch,
  stages,
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
    variables: { filter, groupBy },
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return (
      <AnalyticsSection title={getSectionTitle(groupBy)} action={groupSwitch}>
        <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />
      </AnalyticsSection>
    );
  }

  if (isFirstLoad) {
    return (
      <AnalyticsSection title={getSectionTitle(groupBy)} action={groupSwitch}>
        <AnalyticsSkeleton shape="table" rowCount={5} columnCount={6} />
      </AnalyticsSection>
    );
  }

  if (!isDefined(categories)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  if (categories.rows.every((row) => row.people === 0)) {
    return (
      <AnalyticsSection title={getSectionTitle(groupBy)} action={groupSwitch}>
        <AnalyticsStatePanel kind="EMPTY" onReset={onResetFilter} />
      </AnalyticsSection>
    );
  }

  return (
    <AnalyticsTabLayout
      takeaway={buildCategoriesTakeaway(categories)}
      isRefetching={isRefetching}
    >
      <AnalyticsSection
        title={getSectionTitle(categories.groupBy)}
        note={getSectionNote(categories.groupBy, filter.status)}
        action={groupSwitch}
      >
        <AnalyticsCategoryTable categories={categories} stages={stages} />
      </AnalyticsSection>
    </AnalyticsTabLayout>
  );
};

type AnalyticsCategoriesTabProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  onResetFilter: () => void;
};

export const AnalyticsCategoriesTab = ({
  filter,
  meta,
  onResetFilter,
}: AnalyticsCategoriesTabProps) => {
  const [groupBy, setGroupBy] =
    useState<AnalyticsCategoryGroupBy>('TRACK_PROGRAM');

  const groupSwitch = (
    <SegmentedControl<AnalyticsCategoryGroupBy>
      aria-label={t`Group by`}
      itemWidth="content"
      size="sm"
      value={groupBy}
      onValueChange={(nextGroupBy) => setGroupBy(nextGroupBy)}
      options={[
        { value: 'TRACK_PROGRAM', label: t`Track and program` },
        { value: 'SOURCE', label: t`Source` },
      ]}
    />
  );

  const fieldNotice = getFieldNotice(groupBy, meta.fields);

  if (isDefined(fieldNotice)) {
    return (
      <AnalyticsSection title={getSectionTitle(groupBy)} action={groupSwitch}>
        <AnalyticsNotice>{fieldNotice}</AnalyticsNotice>
      </AnalyticsSection>
    );
  }

  return (
    <AnalyticsCategoriesView
      filter={filter}
      groupBy={groupBy}
      groupSwitch={groupSwitch}
      stages={meta.stages}
      onResetFilter={onResetFilter}
    />
  );
};
