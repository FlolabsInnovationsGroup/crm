import { type ManualReviewScrollPosition } from '@/team-inbox/types/ManualReviewScrollPosition';

// Keyed by view (filter, sort and layout). A plain map, not an atom: it is
// written on every scroll and nothing renders from it.
export const manualReviewScrollPositionsState = new Map<
  string,
  ManualReviewScrollPosition
>();
