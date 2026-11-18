import { gql } from '@apollo/client';

export const GET_SENDING_DOMAINS = gql`
  query GetSendingDomains {
    getSendingDomains {
      isConfigured
      domains {
        domain
        status
        isFixed
        records {
          type
          name
          hostLabel
          value
          status
        }
      }
    }
  }
`;
