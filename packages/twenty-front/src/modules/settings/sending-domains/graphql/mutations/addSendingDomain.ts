import { gql } from '@apollo/client';

export const ADD_SENDING_DOMAIN = gql`
  mutation AddSendingDomain($domain: String!) {
    addSendingDomain(domain: $domain) {
      domain
      status
    }
  }
`;
