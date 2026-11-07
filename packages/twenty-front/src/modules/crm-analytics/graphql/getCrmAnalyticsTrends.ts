import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_TRENDS = gql`
  query GetCrmAnalyticsTrends(
    $filter: CrmAnalyticsFilterInput!
    $metric: String!
    $stageKey: String
  ) {
    getCrmAnalyticsTrends(
      filter: $filter
      metric: $metric
      stageKey: $stageKey
    ) {
      payload
    }
  }
`;
