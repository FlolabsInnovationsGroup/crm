import { useQuery } from '@apollo/client/react';

import { GET_TEAM_MAILBOX_SIGNATURE } from '@/settings/team-mailboxes/graphql/teamMailboxSignature';

export const useTeamMailboxSignature = (connectedAccountId: string) => {
  const { data, loading, error } = useQuery<{
    teamMailboxSignature: string | null;
  }>(GET_TEAM_MAILBOX_SIGNATURE, { variables: { connectedAccountId } });

  return {
    signature: data?.teamMailboxSignature ?? null,
    // A failed lookup must not keep the composer waiting.
    isSignatureLoading: loading && !error,
  };
};
