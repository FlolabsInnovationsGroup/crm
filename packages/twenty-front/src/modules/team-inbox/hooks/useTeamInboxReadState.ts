import { useMutation, useQuery } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  GET_INBOX_UNREAD_COUNT,
  MARK_ALL_INBOX_THREADS_READ,
  MARK_INBOX_THREAD_UNREAD,
  MARK_INBOX_THREADS_READ,
} from '@/team-inbox/graphql/teamInboxReadState';

const INBOX_UNREAD_COUNT_POLL_INTERVAL_MS = 60_000;

export const useTeamInboxReadState = () => {
  const apolloCoreClient = useApolloCoreClient();

  const { data } = useQuery<{ getInboxUnreadCount: number }>(
    GET_INBOX_UNREAD_COUNT,
    {
      client: apolloCoreClient,
      pollInterval: INBOX_UNREAD_COUNT_POLL_INTERVAL_MS,
    },
  );

  const refetchQueries = ['GetInboxUnreadCount'];
  const [markThreadsReadMutation] = useMutation(MARK_INBOX_THREADS_READ, {
    client: apolloCoreClient,
    refetchQueries,
  });
  const [markThreadUnreadMutation] = useMutation(MARK_INBOX_THREAD_UNREAD, {
    client: apolloCoreClient,
    refetchQueries,
  });
  const [markAllReadMutation] = useMutation(MARK_ALL_INBOX_THREADS_READ, {
    client: apolloCoreClient,
    refetchQueries: [...refetchQueries, 'GetInboxThreads'],
  });

  const setThreadRead = (threadId: string, read: boolean) =>
    apolloCoreClient.cache.modify({
      id: apolloCoreClient.cache.identify({
        __typename: 'TimelineThread',
        id: threadId,
      }),
      fields: { read: () => read },
    });

  const markThreadRead = (threadId: string) => {
    setThreadRead(threadId, true);
    void markThreadsReadMutation({ variables: { messageThreadIds: [threadId] } });
  };

  const markThreadUnread = (threadId: string) => {
    setThreadRead(threadId, false);
    void markThreadUnreadMutation({ variables: { messageThreadId: threadId } });
  };

  const markAllRead = () => void markAllReadMutation();

  return {
    unreadCount: data?.getInboxUnreadCount ?? 0,
    markThreadRead,
    markThreadUnread,
    markAllRead,
  };
};
