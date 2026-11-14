import { gql } from '@apollo/client';

export const SET_INBOX_THREAD_CLOSED = gql`
  mutation SetInboxThreadClosed($messageThreadId: UUID!, $isClosed: Boolean!) {
    setInboxThreadClosed(messageThreadId: $messageThreadId, isClosed: $isClosed)
  }
`;
