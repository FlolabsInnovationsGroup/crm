// Members (by workspace member id) allowed to send from a mailbox they do
// not own, keyed by connected account id.
export type TeamMailboxShares = Record<string, string[]>;

export const getTeamMailboxMemberIds = (
  shares: TeamMailboxShares | null | undefined,
  connectedAccountId: string,
): string[] => shares?.[connectedAccountId] ?? [];

export const setTeamMailboxMemberIds = (
  shares: TeamMailboxShares | null | undefined,
  connectedAccountId: string,
  workspaceMemberIds: string[],
): TeamMailboxShares => {
  const { [connectedAccountId]: _previous, ...otherShares } = shares ?? {};
  const uniqueIds = [...new Set(workspaceMemberIds)];

  return uniqueIds.length > 0
    ? { ...otherShares, [connectedAccountId]: uniqueIds }
    : otherShares;
};

export const getConnectedAccountIdsSharedWith = (
  shares: TeamMailboxShares | null | undefined,
  workspaceMemberId: string,
): string[] =>
  Object.entries(shares ?? {})
    .filter(([, memberIds]) => memberIds.includes(workspaceMemberId))
    .map(([connectedAccountId]) => connectedAccountId);
