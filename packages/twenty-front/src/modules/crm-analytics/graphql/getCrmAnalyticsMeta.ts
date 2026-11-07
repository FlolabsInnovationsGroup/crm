import { gql } from '@apollo/client';

export const GET_CRM_ANALYTICS_META = gql`
  query GetCrmAnalyticsMeta {
    getCrmAnalyticsMeta {
      payload
    }
  }
`;
