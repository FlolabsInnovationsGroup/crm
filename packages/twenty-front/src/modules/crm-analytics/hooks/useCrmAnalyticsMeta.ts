import { GET_CRM_ANALYTICS_META } from '@/crm-analytics/graphql/getCrmAnalyticsMeta';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import { type AnalyticsMeta } from '@/crm-analytics/types/AnalyticsApi';

export const useCrmAnalyticsMeta = () => {
  const { payload, ...queryState } = useCrmAnalyticsQuery<AnalyticsMeta>({
    query: GET_CRM_ANALYTICS_META,
    rootField: 'getCrmAnalyticsMeta',
  });

  return { meta: payload, ...queryState };
};
