import { useQuery } from '@apollo/client/react';
import { type ConnectedAccountProvider } from 'twenty-shared/types';

import { GET_MY_SENDER_CONNECTED_ACCOUNTS } from '@/accounts/graphql/queries/getMySenderConnectedAccounts';
import { type SenderConnectedAccount } from '@/accounts/types/SenderConnectedAccount';

export const useReplyConnectedAccount = (messageChannelId: string | null) => {
  const { data, loading } = useQuery<{
    mySenderConnectedAccounts: SenderConnectedAccount[];
  }>(GET_MY_SENDER_CONNECTED_ACCOUNTS);

  const replyConnectedAccount =
    data?.mySenderConnectedAccounts.find(
      (connectedAccount) =>
        messageChannelId !== null &&
        connectedAccount.messageChannelIds.includes(messageChannelId),
    ) ?? null;

  return {
    connectedAccountId: replyConnectedAccount?.id ?? null,
    connectedAccountHandle: replyConnectedAccount?.handle ?? null,
    connectedAccountProvider:
      (replyConnectedAccount?.provider as ConnectedAccountProvider) ?? null,
    loading,
  };
};
