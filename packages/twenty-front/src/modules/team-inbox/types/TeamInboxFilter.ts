export type TeamInboxDirection = 'ALL' | 'INCOMING' | 'OUTGOING';

export type TeamInboxFilter = {
  direction: TeamInboxDirection;
  unreadOnly: boolean;
  messageChannelId: string | null;
  searchTerm: string;
};
