import { GET_CRM_ANALYTICS_SERIES } from '@/crm-analytics/graphql/getCrmAnalyticsSeries';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsSeriesBundle,
  type AnalyticsSeriesRequest,
} from '@/crm-analytics/types/AnalyticsApi';

type UseCrmAnalyticsSeriesArgs = {
  filter: AnalyticsFilter;
  requests: AnalyticsSeriesRequest[];
};

// One round trip for every line on a tab, so a tab never sends one heavy query per chart.
export const useCrmAnalyticsSeries = ({
  filter,
  requests,
}: UseCrmAnalyticsSeriesArgs) =>
  useCrmAnalyticsQuery<AnalyticsSeriesBundle>({
    query: GET_CRM_ANALYTICS_SERIES,
    rootField: 'getCrmAnalyticsSeries',
    variables: { filter, requests },
  });
