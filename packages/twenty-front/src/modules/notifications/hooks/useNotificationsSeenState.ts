import { useMutation, useQuery } from '@apollo/client/react';

import {
  GET_NOTIFICATIONS_SEEN_STATE,
  MARK_NOTIFICATIONS_SEEN,
} from '@/notifications/graphql/notificationsSeenState';

type NotificationsSeenState = {
  seenAt: string | null;
  previousSeenAt: string | null;
};

const EMPTY_STATE: NotificationsSeenState = {
  seenAt: null,
  previousSeenAt: null,
};

// Stored per user on the server, so it follows them across devices.
export const useNotificationsSeenState = () => {
  const { data } = useQuery<{
    getNotificationsSeenState: NotificationsSeenState;
  }>(GET_NOTIFICATIONS_SEEN_STATE);

  const [markNotificationsSeen] = useMutation<{
    markNotificationsSeen: NotificationsSeenState;
  }>(MARK_NOTIFICATIONS_SEEN, {
    update: (cache, { data: result }) => {
      if (result === null || result === undefined) {
        return;
      }

      cache.writeQuery({
        query: GET_NOTIFICATIONS_SEEN_STATE,
        data: { getNotificationsSeenState: result.markNotificationsSeen },
      });
    },
  });

  return {
    notificationsSeen: data?.getNotificationsSeenState ?? EMPTY_STATE,
    markNotificationsSeen,
  };
};
