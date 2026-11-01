import { gql } from '@apollo/client';

export const GET_MY_SENDER_CONNECTED_ACCOUNTS = gql`
  query MySenderConnectedAccounts {
    mySenderConnectedAccounts {
      id
      handle
      handleAliases
      provider
      messageChannelIds
      connectionParameters {
        IMAP {
          host
          port
        }
        SMTP {
          host
          port
        }
      }
    }
  }
`;
