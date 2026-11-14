export type TeamInboxDirection = 'ALL' | 'INCOMING' | 'OUTGOING';

export type TeamInboxFilter = {
  direction: TeamInboxDirection;
  unreadOnly: boolean;
  manualReview: boolean;
  closedOnly: boolean;
  manualReviewDoneSince: string | null;
  messageChannelId: string | null;
  searchTerm: string;
};
