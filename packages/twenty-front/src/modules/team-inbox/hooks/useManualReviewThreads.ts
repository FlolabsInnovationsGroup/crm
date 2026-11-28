import { type ErrorLike } from '@apollo/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { MANUAL_REVIEW_MAX_THREADS } from '@/team-inbox/constants/ManualReviewMaxThreads';
import { MANUAL_REVIEW_PAGE_SIZE } from '@/team-inbox/constants/ManualReviewPageSize';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import { manualReviewThreadsFamilyState } from '@/team-inbox/states/manualReviewThreadsFamilyState';
import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';
import { appendUniqueThreads } from '@/team-inbox/utils/appendUniqueThreads';
import { useAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyState';

type GetInboxThreadsResult = {
  getInboxThreads: {
    totalNumberOfThreads: number;
    timelineThreads: InboxThread[];
  };
};

const OPEN_ITEMS_KEY = 'OPEN';

// Every page, one after another, so the whole list is on screen and the
// oldest card can be reached. A refresh keeps the last full list showing
// until the new one is complete, so the list never shrinks to one page.
export const useManualReviewThreads = ({
  doneSince,
  sortDirection,
  skip,
}: {
  doneSince: string | null;
  sortDirection: ManualReviewSortDirection;
  skip: boolean;
}) => {
  const apolloCoreClient = useApolloCoreClient();
  const [snapshot, setSnapshot] = useAtomFamilyState(
    manualReviewThreadsFamilyState,
    doneSince ?? OPEN_ITEMS_KEY,
  );
  const [error, setError] = useState<ErrorLike | undefined>(undefined);
  // Lets a newer load discard an older one still in flight; nothing renders
  // from it.
  // oxlint-disable-next-line twenty/no-state-useref
  const latestLoadIdRef = useRef(0);

  const reload = useCallback(async () => {
    const loadId = latestLoadIdRef.current + 1;

    latestLoadIdRef.current = loadId;

    try {
      let threads: InboxThread[] = [];
      let totalNumberOfThreads = 0;

      for (
        let page = 1;
        page <= MANUAL_REVIEW_MAX_THREADS / MANUAL_REVIEW_PAGE_SIZE;
        page++
      ) {
        const { data } = await apolloCoreClient.query<GetInboxThreadsResult>({
          query: GET_INBOX_THREADS,
          variables: {
            page,
            pageSize: MANUAL_REVIEW_PAGE_SIZE,
            manualReview: true,
            manualReviewDoneSince: doneSince,
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- A sort argument, not text.
            sortDirection: sortDirection === 'OLDEST_FIRST' ? 'ASC' : 'DESC',
          },
          fetchPolicy: 'network-only',
        });

        if (latestLoadIdRef.current !== loadId) {
          return;
        }

        const pageThreads = data?.getInboxThreads.timelineThreads ?? [];

        totalNumberOfThreads = data?.getInboxThreads.totalNumberOfThreads ?? 0;
        threads = appendUniqueThreads(threads, pageThreads);

        const isLastPage =
          pageThreads.length < MANUAL_REVIEW_PAGE_SIZE ||
          threads.length >= totalNumberOfThreads;
        const partialSnapshot = {
          threads,
          totalNumberOfThreads,
          sortDirection,
          isComplete: false,
        };

        if (isLastPage) {
          break;
        }

        // Only a first load fills in page by page; a refresh swaps at the end.
        setSnapshot((previous) =>
          isDefined(previous) && previous.isComplete
            ? previous
            : partialSnapshot,
        );
      }

      setSnapshot({
        threads: threads.slice(0, MANUAL_REVIEW_MAX_THREADS),
        totalNumberOfThreads,
        sortDirection,
        isComplete: true,
      });
      setError(undefined);
    } catch (loadError) {
      if (latestLoadIdRef.current === loadId) {
        setError(
          loadError instanceof Error ? loadError : new Error(String(loadError)),
        );
      }
    }
  }, [apolloCoreClient, doneSince, sortDirection, setSnapshot]);

  useEffect(() => {
    if (skip) {
      return;
    }

    reload();

    // Leaving the tab or changing the filter drops the pages still to come.
    return () => {
      latestLoadIdRef.current += 1;
    };
  }, [reload, skip]);

  // A load already in flight may predate the Done, so it is dropped; the
  // caller reloads afterwards.
  const removeThreads = (threadIds: string[]) => {
    latestLoadIdRef.current += 1;
    setSnapshot((previous) => {
      if (!isDefined(previous)) {
        return previous;
      }

      const remainingThreads = previous.threads.filter(
        ({ id }) => !threadIds.includes(id),
      );

      return {
        ...previous,
        threads: remainingThreads,
        totalNumberOfThreads:
          previous.totalNumberOfThreads -
          (previous.threads.length - remainingThreads.length),
      };
    });
  };

  // The other order's full list is the same set, so it shows while this
  // order loads; a capped list is not, so it waits.
  const isSnapshotUsable =
    isDefined(snapshot) &&
    (snapshot.sortDirection === sortDirection ||
      (snapshot.isComplete &&
        snapshot.threads.length >= snapshot.totalNumberOfThreads));
  const shownSnapshot = isSnapshotUsable ? snapshot : null;

  return {
    threads: shownSnapshot?.threads ?? [],
    totalNumberOfThreads: shownSnapshot?.totalNumberOfThreads ?? 0,
    isComplete: shownSnapshot?.isComplete === true,
    isTruncated:
      shownSnapshot?.isComplete === true &&
      shownSnapshot.threads.length < shownSnapshot.totalNumberOfThreads,
    isFirstLoad: !isDefined(shownSnapshot) && !isDefined(error),
    error,
    reload,
    removeThreads,
  };
};
