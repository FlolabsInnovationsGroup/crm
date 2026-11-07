import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_SERIES = gql`
  query GetCrmAnalyticsSeries(
    $filter: CrmAnalyticsFilterInput!
    $requests: [CrmAnalyticsSeriesRequestInput!]!
  ) {
    getCrmAnalyticsSeries(filter: $filter, requests: $requests) {
      payload
    }
  }
`;
