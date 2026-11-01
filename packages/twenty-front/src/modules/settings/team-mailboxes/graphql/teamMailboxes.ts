import { gql } from '@apollo/client';

export const GET_TEAM_MAILBOXES = gql`
  query TeamMailboxes {
    teamMailboxes {
      id
      handle
      provider
      ownerUserId
      sharedWithWorkspaceMemberIds
    }
  }
`;

export const SET_TEAM_MAILBOX_MEMBERS = gql`
  mutation SetTeamMailboxMembers(
    $connectedAccountId: UUID!
    $workspaceMemberIds: [UUID!]!
  ) {
    setTeamMailboxMembers(
      connectedAccountId: $connectedAccountId
      workspaceMemberIds: $workspaceMemberIds
    ) {
      id
      handle
      provider
      ownerUserId
      sharedWithWorkspaceMemberIds
    }
  }
`;
