import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_OVERVIEW = gql`
  query GetCrmAnalyticsOverview($filter: CrmAnalyticsFilterInput!) {
    getCrmAnalyticsOverview(filter: $filter) {
      payload
    }
  }
`;
