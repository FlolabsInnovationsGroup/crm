import { type ConnectedAccount } from '@/accounts/types/ConnectedAccount';

// A mailbox the current member may send from: their own, or one an admin
// shared with them.
export type SenderConnectedAccount = Pick<
  ConnectedAccount,
  'id' | 'handle' | 'handleAliases' | 'provider' | 'connectionParameters'
> & {
  messageChannelIds: string[];
};
