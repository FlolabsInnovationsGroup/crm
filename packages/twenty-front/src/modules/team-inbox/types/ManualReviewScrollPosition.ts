export type ManualReviewScrollAnchor = { threadId: string; offset: number };

export type ManualReviewScrollPosition = {
  scrollTop: number;
  anchor: ManualReviewScrollAnchor | null;
};
