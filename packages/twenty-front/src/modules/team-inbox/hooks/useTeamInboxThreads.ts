import { useQuery } from '@apollo/client/react';
import { useState } from 'react';

import { TIMELINE_THREADS_DEFAULT_PAGE_SIZE } from '@/activities/emails/constants/Messaging';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import { type TeamInboxFilter } from '@/team-inbox/types/TeamInboxFilter';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

type GetInboxThreadsResult = {
  getInboxThreads: TimelineThreadsWithTotal;
};

export const useTeamInboxThreads = (filter: TeamInboxFilter) => {
  const apolloCoreClient = useApolloCoreClient();
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const variables = {
    page: 1,
    pageSize: TIMELINE_THREADS_DEFAULT_PAGE_SIZE,
    direction: filter.direction === 'ALL' ? null : filter.direction,
    messageChannelId: filter.messageChannelId,
    searchTerm: filter.searchTerm.trim() === '' ? null : filter.searchTerm,
    unreadOnly: filter.unreadOnly ? true : null,
  };

  const { data, loading, error, fetchMore, refetch } =
    useQuery<GetInboxThreadsResult>(GET_INBOX_THREADS, {
      client: apolloCoreClient,
      variables,
      fetchPolicy: 'cache-and-network',
    });

  const threads = data?.getInboxThreads.timelineThreads ?? [];
  const totalNumberOfThreads = data?.getInboxThreads.totalNumberOfThreads ?? 0;
  const hasMore = threads.length < totalNumberOfThreads;

  const fetchMoreThreads = async () => {
    if (!hasMore || isFetchingMore || loading) {
      return;
    }

    setIsFetchingMore(true);

    try {
      await fetchMore({
        variables: {
          ...variables,
          page:
            Math.floor(threads.length / TIMELINE_THREADS_DEFAULT_PAGE_SIZE) + 1,
        },
        updateQuery: (previous, { fetchMoreResult }) => ({
          getInboxThreads: {
            ...previous.getInboxThreads,
            timelineThreads: [
              ...previous.getInboxThreads.timelineThreads,
              ...(fetchMoreResult?.getInboxThreads.timelineThreads ?? []),
            ],
          },
        }),
      });
    } finally {
      setIsFetchingMore(false);
    }
  };

  return {
    threads,
    totalNumberOfThreads,
    isFirstLoad: loading && data === undefined,
    isFetchingMore,
    error,
    fetchMoreThreads,
    refetch,
  };
};
