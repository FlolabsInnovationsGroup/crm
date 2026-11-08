import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_FUNNEL = gql`
  query GetCrmAnalyticsFunnel($filter: CrmAnalyticsFilterInput!) {
    getCrmAnalyticsFunnel(filter: $filter) {
      payload
    }
  }
`;
