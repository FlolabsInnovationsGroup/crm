import { useMutation, useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import {
  GET_MANUAL_REVIEW_COUNT,
  SET_MANUAL_REVIEW_DONE,
} from '@/team-inbox/graphql/manualReview';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

const MANUAL_REVIEW_COUNT_POLL_INTERVAL_MS = 60_000;

export const useManualReview = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
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

  const markDone = (messageThreadId: string) =>
    setManualReviewDoneMutation({
      variables: { messageThreadId, isDone: true },
    });

  const openApplicantThread = async (applicantEmail: string) => {
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

      return;
    }

    openRecordInSidePanel({
      recordId: thread.id,
      objectNameSingular: CoreObjectNameSingular.MessageThread,
    });
  };

  return {
    manualReviewCount: data?.getManualReviewCount ?? 0,
    markDone,
    openApplicantThread,
  };
};
