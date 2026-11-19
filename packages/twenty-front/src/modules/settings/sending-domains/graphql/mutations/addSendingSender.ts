import { gql } from '@apollo/client';

export const ADD_SENDING_SENDER = gql`
  mutation AddSendingSender($input: AddSendingSenderInput!) {
    addSendingSender(input: $input) {
      email
    }
  }
`;
