import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';
import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export type ManualReviewThreadsSnapshot = {
  threads: InboxThread[];
  totalNumberOfThreads: number;
  sortDirection: ManualReviewSortDirection;
  isComplete: boolean;
};

// Kept outside the page so coming back shows the full list at once.
export const manualReviewThreadsFamilyState = createAtomFamilyState<
  ManualReviewThreadsSnapshot | null,
  string
>({
  key: 'manualReviewThreadsFamilyState',
  defaultValue: null,
});
