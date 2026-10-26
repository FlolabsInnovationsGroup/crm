import { gql } from '@apollo/client';

export const GET_INBOX_UNREAD_COUNT = gql`
  query GetInboxUnreadCount {
    getInboxUnreadCount
  }
`;

export const MARK_INBOX_THREADS_READ = gql`
  mutation MarkInboxThreadsRead($messageThreadIds: [UUID!]!) {
    markInboxThreadsRead(messageThreadIds: $messageThreadIds)
  }
`;

export const MARK_INBOX_THREAD_UNREAD = gql`
  mutation MarkInboxThreadUnread($messageThreadId: UUID!) {
    markInboxThreadUnread(messageThreadId: $messageThreadId)
  }
`;

export const MARK_ALL_INBOX_THREADS_READ = gql`
  mutation MarkAllInboxThreadsRead {
    markAllInboxThreadsRead
  }
`;
