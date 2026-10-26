export type TeamInboxDirection = 'ALL' | 'INCOMING' | 'OUTGOING';

export type TeamInboxFilter = {
  direction: TeamInboxDirection;
  messageChannelId: string | null;
  searchTerm: string;
};
