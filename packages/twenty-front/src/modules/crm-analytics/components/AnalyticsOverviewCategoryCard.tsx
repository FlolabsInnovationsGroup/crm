import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsHorizontalBarChart } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { GET_CRM_ANALYTICS_CATEGORIES } from '@/crm-analytics/graphql/getCrmAnalyticsCategories';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryGroupBy,
  type AnalyticsFilter,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildCategoryBarRows } from '@/crm-analytics/utils/buildCategoryBarRows';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const MAXIMUM_SOURCE_ROWS = 5;

type AnalyticsOverviewCategoryCardProps = {
  filter: AnalyticsFilter;
  groupBy: AnalyticsCategoryGroupBy;
  onSelect?: (key: string) => void;
};

// Separate from the tab so a group whose field is missing never sends a query.
export const AnalyticsOverviewCategoryCard = ({
  filter,
  groupBy,
  onSelect,
}: AnalyticsOverviewCategoryCardProps) => {
  const { formatNumber } = useNumberFormat();

  const {
    payload: categories,
    isFirstLoad,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsCategories>({
    query: GET_CRM_ANALYTICS_CATEGORIES,
    rootField: 'getCrmAnalyticsCategories',
    variables: { filter, groupBy },
  });

  const isSource = groupBy === 'SOURCE';
  const title = isSource ? t`Top sources` : t`People by track`;

  const peopleInSeveral = formatAnalyticsPeopleCount(
    categories?.peopleInSeveralTracks ?? 0,
    formatNumber,
  );

  const getNote = () => {
    if (isSource) {
      return t`People by their current source. Click a source to filter the page.`;
    }

    return (categories?.peopleInSeveralTracks ?? 0) > 0
      ? t`People by their current positions. ${peopleInSeveral} in several tracks count once in each, so the bars add up to more than the total. Click a track to filter the page.`
      : t`People by their current positions. Click a track to filter the page.`;
  };

  const { mainRows, catchAllRows } = isDefined(categories)
    ? buildCategoryBarRows({
        categories,
        maximumRows: isSource ? MAXIMUM_SOURCE_ROWS : undefined,
        formatNumber,
      })
    : { mainRows: [], catchAllRows: [] };

  const hasPeople = [...mainRows, ...catchAllRows].some(({ segments }) =>
    segments.some(({ value }) => value > 0),
  );

  return (
    <AnalyticsChartCard
      title={title}
      note={getNote()}
      isLoading={isFirstLoad}
      error={error}
      onRetry={retry}
      isEmpty={!hasPeople}
      emptyMessage={
        isSource
          ? t`No one in this view has a source.`
          : t`No one in this view has a track.`
      }
    >
      <AnalyticsHorizontalBarChart
        ariaLabel={title}
        rows={mainRows}
        dividedRows={catchAllRows}
        dividerLabel={t`No value or not mapped`}
        onRowClick={onSelect}
      />
    </AnalyticsChartCard>
  );
};
