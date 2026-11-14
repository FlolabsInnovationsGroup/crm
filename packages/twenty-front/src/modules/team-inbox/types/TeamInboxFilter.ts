export type TeamInboxDirection = 'ALL' | 'INCOMING' | 'OUTGOING';

export type TeamInboxFilter = {
  direction: TeamInboxDirection;
  unreadOnly: boolean;
  manualReview: boolean;
  messageChannelId: string | null;
  searchTerm: string;
};
