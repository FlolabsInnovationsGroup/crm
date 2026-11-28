import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';

import { GET_TEAM_MAILBOX_SIGNATURE } from '@/settings/team-mailboxes/graphql/teamMailboxSignature';

export const useTeamMailboxSignature = (
  connectedAccountId: string | null | undefined,
) => {
  const { data, loading, error } = useQuery<{
    teamMailboxSignature: string | null;
  }>(GET_TEAM_MAILBOX_SIGNATURE, {
    variables: { connectedAccountId },
    skip: !isNonEmptyString(connectedAccountId),
  });

  return {
    signature: data?.teamMailboxSignature ?? null,
    // A failed lookup must not keep the composer waiting.
    isSignatureLoading: loading && !error,
  };
};
