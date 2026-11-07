import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_REPORT = gql`
  query GetCrmAnalyticsReport($periodType: String!, $periodStart: String!) {
    getCrmAnalyticsReport(periodType: $periodType, periodStart: $periodStart) {
      payload
    }
  }
`;
