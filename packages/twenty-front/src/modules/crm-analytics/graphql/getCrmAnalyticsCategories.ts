import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_CATEGORIES = gql`
  query GetCrmAnalyticsCategories(
    $filter: CrmAnalyticsFilterInput!
    $groupBy: String!
  ) {
    getCrmAnalyticsCategories(filter: $filter, groupBy: $groupBy) {
      payload
    }
  }
`;
