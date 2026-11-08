import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_REPORTS = gql`
  query GetCrmAnalyticsReports {
    getCrmAnalyticsReports {
      payload
    }
  }
`;
