import { gql } from '@apollo/client';

export const GET_INBOX_MAILBOXES = gql`
  query GetInboxMailboxes {
    getInboxMailboxes {
      id
      handle
    }
  }
`;
