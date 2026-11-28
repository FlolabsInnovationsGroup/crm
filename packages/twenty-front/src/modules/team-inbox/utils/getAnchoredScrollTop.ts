import { type ManualReviewScrollAnchor } from '@/team-inbox/types/ManualReviewScrollPosition';

// The scrollTop that puts the anchor card back at its saved offset.
export const getAnchoredScrollTop = ({
  anchor,
  anchorTop,
  viewportTop,
  scrollTop,
}: {
  anchor: ManualReviewScrollAnchor;
  anchorTop: number;
  viewportTop: number;
  scrollTop: number;
}): number => Math.max(0, scrollTop + anchorTop - viewportTop - anchor.offset);
