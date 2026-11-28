import { gql } from '@apollo/client';

export const GET_TEAM_MAILBOX_SIGNATURE = gql`
  query TeamMailboxSignature($connectedAccountId: UUID!) {
    teamMailboxSignature(connectedAccountId: $connectedAccountId)
  }
`;

export const SET_TEAM_MAILBOX_SIGNATURE = gql`
  mutation SetTeamMailboxSignature(
    $connectedAccountId: UUID!
    $signature: String!
  ) {
    setTeamMailboxSignature(
      connectedAccountId: $connectedAccountId
      signature: $signature
    )
  }
`;
