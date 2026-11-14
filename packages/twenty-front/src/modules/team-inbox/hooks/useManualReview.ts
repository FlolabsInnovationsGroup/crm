import { useMutation, useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import {
  GET_MANUAL_REVIEW_COUNT,
  SET_MANUAL_REVIEW_DONE,
} from '@/team-inbox/graphql/manualReview';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

const MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS = 60_000;

export const useManualReview = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();

  const { data } = useQuery<{ getManualReviewCount: number }>(
    GET_MANUAL_REVIEW_COUNT,
    {
      client: apolloCoreClient,
      pollInterval: MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS,
    },
  );

  const [setManualReviewDoneMutation] = useMutation(SET_MANUAL_REVIEW_DONE, {
    client: apolloCoreClient,
    refetchQueries: ['GetManualReviewCount', 'GetInboxThreads'],
  });

  const markDone = async (messageThreadId: string) => {
    try {
      await setManualReviewDoneMutation({
        variables: { messageThreadId, isDone: true },
      });

      return true;
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Could not mark this reply as done. Please try again.`,
      });

      return false;
    }
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
    markDone,
    findApplicantThreadId,
  };
};
