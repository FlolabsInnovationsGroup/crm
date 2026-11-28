import { useMutation, useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import {
  GET_MANUAL_REVIEW_COUNT,
  GET_MANUAL_REVIEW_DONE_COUNT,
  SET_MANUAL_REVIEW_DONE,
} from '@/team-inbox/graphql/manualReview';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

const MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS = 60_000;

const MANUAL_REVIEW_COUNT_QUERIES = [
  'GetManualReviewCount',
  'GetManualReviewDoneCount',
];

export const useManualReview = (doneSince: string) => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();

  const { data } = useQuery<{ getManualReviewCount: number }>(
    GET_MANUAL_REVIEW_COUNT,
    {
      client: apolloCoreClient,
      pollInterval: MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS,
    },
  );

  const { data: doneData } = useQuery<{ getManualReviewDoneCount: number }>(
    GET_MANUAL_REVIEW_DONE_COUNT,
    {
      client: apolloCoreClient,
      variables: { since: doneSince },
      pollInterval: MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS,
    },
  );

  const [setManualReviewDoneMutation] = useMutation(SET_MANUAL_REVIEW_DONE, {
    client: apolloCoreClient,
    refetchQueries: [
      'GetManualReviewCount',
      'GetManualReviewDoneCount',
      'GetInboxThreads',
    ],
  });

  const setDone = async (
    messageThreadId: string,
    isDone: boolean,
    refetchQueries?: string[],
  ) => {
    try {
      await setManualReviewDoneMutation({
        variables: { messageThreadId, isDone },
        ...(isDefined(refetchQueries) ? { refetchQueries } : {}),
      });

      return true;
    } catch {
      enqueueToast({
        status: 'error',
        children: isDone
          ? t`Could not mark this reply as done. Please try again.`
          : t`Could not undo. Please try again.`,
      });

      return false;
    }
  };

  const markDone = (messageThreadId: string) => setDone(messageThreadId, true);

  const undoDone = (messageThreadId: string) => setDone(messageThreadId, false);

  const refetchManualReviewCounts = () =>
    apolloCoreClient.refetchQueries({ include: MANUAL_REVIEW_COUNT_QUERIES });

  // The Needs review list reloads itself, so only the counts refetch, once.
  const setDoneWithoutListRefetch = async (
    messageThreadIds: string[],
    isDone: boolean,
  ) => {
    for (const messageThreadId of messageThreadIds) {
      if (!(await setDone(messageThreadId, isDone, []))) {
        return false;
      }
    }

    return true;
  };

  const findApplicantThreadId = async (applicantEmail: string) => {
    const { data: threadData } = await apolloCoreClient.query<{
      getInboxThreads: TimelineThreadsWithTotal;
    }>({
      query: GET_INBOX_THREADS,
      variables: {
        page: 1,
        pageSize: 1,
        direction: 'INCOMING',
        searchTerm: applicantEmail,
      },
      fetchPolicy: 'network-only',
    });

    const thread = threadData?.getInboxThreads.timelineThreads[0];

    if (!isDefined(thread)) {
      enqueueToast({
        status: 'error',
        children: t`No email from ${applicantEmail} in the inbox.`,
      });

      return null;
    }

    return thread.id;
  };

  return {
    manualReviewCount: data?.getManualReviewCount ?? 0,
    isManualReviewCountLoaded: isDefined(data),
    doneSinceCount: doneData?.getManualReviewDoneCount ?? 0,
    markDone,
    undoDone,
    setDoneWithoutListRefetch,
    refetchManualReviewCounts,
    findApplicantThreadId,
  };
};
