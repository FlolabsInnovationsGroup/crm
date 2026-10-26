import { gql } from '@apollo/client';

export const GET_NOTIFICATIONS_SEEN_STATE = gql`
  query GetNotificationsSeenState {
    getNotificationsSeenState {
      seenAt
      previousSeenAt
    }
  }
`;

export const MARK_NOTIFICATIONS_SEEN = gql`
  mutation MarkNotificationsSeen {
    markNotificationsSeen {
      seenAt
      previousSeenAt
    }
  }
`;
