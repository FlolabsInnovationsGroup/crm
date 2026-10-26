export type InboxThreadDirection = 'INCOMING' | 'OUTGOING';

// FloLabs team inbox: threads from every mailbox instead of one record's.
export type InboxThreadFilter = {
  direction?: InboxThreadDirection;
  messageChannelId?: string;
  searchTerm?: string;
};
