import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { notificationKnownItemIdsState } from '@/notifications/states/notificationKnownItemIdsState';
import { type NotificationItem } from '@/notifications/types/NotificationItem';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

type NotificationDesktopAlertEffectProps = {
  items: NotificationItem[];
};

// The first load only records what already exists, so opening the app does
// not replay old items as alerts.
export const NotificationDesktopAlertEffect = ({
  items,
}: NotificationDesktopAlertEffectProps) => {
  const [notificationKnownItemIds, setNotificationKnownItemIds] = useAtomState(
    notificationKnownItemIdsState,
  );

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    if (!isDefined(notificationKnownItemIds)) {
      setNotificationKnownItemIds(items.map((item) => item.id));

      return;
    }

    const newItems = items.filter(
      (item) => !notificationKnownItemIds.includes(item.id),
    );

    if (newItems.length === 0) {
      return;
    }

    setNotificationKnownItemIds([
      ...notificationKnownItemIds,
      ...newItems.map((item) => item.id),
    ]);

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    newItems.slice(0, 3).forEach((item) => {
      new Notification(item.title, { body: item.subtitle, tag: item.id });
    });
  }, [items, notificationKnownItemIds, setNotificationKnownItemIds]);

  return null;
};
