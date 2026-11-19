import { gql } from '@apollo/client';

export const GET_SENDING_DOMAINS = gql`
  query GetSendingDomains {
    getSendingDomains {
      isConfigured
      domains {
        domain
        status
        isFixed
        dnsProvider {
          name
          url
        }
        records {
          type
          name
          hostLabel
          value
          existingValue
          status
        }
      }
      senders {
        name
        email
        replyTo
        canReceiveReplies
      }
    }
  }
`;
