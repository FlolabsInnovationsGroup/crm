import { type TeamInboxReadState } from 'src/engine/core-modules/messaging/utils/team-inbox-read-state.util';

export type InboxThreadDirection = 'INCOMING' | 'OUTGOING';

// FloLabs team inbox: threads from every mailbox instead of one record's.
export type InboxThreadFilter = {
  direction?: InboxThreadDirection;
  messageChannelId?: string;
  searchTerm?: string;
  unreadFor?: TeamInboxReadState;
};
