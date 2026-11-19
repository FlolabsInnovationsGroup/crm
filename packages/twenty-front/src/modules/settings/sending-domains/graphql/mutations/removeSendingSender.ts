import { gql } from '@apollo/client';

export const REMOVE_SENDING_SENDER = gql`
  mutation RemoveSendingSender($email: String!) {
    removeSendingSender(email: $email)
  }
`;
