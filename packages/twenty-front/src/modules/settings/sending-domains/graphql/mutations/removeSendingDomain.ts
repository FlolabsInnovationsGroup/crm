import { gql } from '@apollo/client';

export const REMOVE_SENDING_DOMAIN = gql`
  mutation RemoveSendingDomain($domain: String!) {
    removeSendingDomain(domain: $domain)
  }
`;
