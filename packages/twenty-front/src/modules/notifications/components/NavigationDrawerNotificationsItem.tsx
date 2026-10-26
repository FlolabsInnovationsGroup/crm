import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconBell } from 'twenty-ui/icon';

import { NotificationDesktopAlertEffect } from '@/notifications/components/NotificationDesktopAlertEffect';
import { useNotificationFeed } from '@/notifications/hooks/useNotificationFeed';
import { notificationsSeenState } from '@/notifications/states/notificationsSeenState';
import { isNotificationUnread } from '@/notifications/utils/buildNotificationItems';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useNavigateApp } from '~/hooks/useNavigateApp';

export const NavigationDrawerNotificationsItem = () => {
  const location = useLocation();
  const navigate = useNavigateApp();
  const items = useNotificationFeed();
  const [notificationsSeen, setNotificationsSeen] = useAtomState(
    notificationsSeenState,
  );

  const now = new Date();
  const unreadCount = items.filter((item) =>
    isNotificationUnread(item, notificationsSeen.seenAt, now),
  ).length;

  const handleClick = () => {
    setNotificationsSeen({
      seenAt: new Date().toISOString(),
      previousSeenAt: notificationsSeen.seenAt,
    });
    navigate(AppPath.Notifications);
  };

  return (
    <>
      <NotificationDesktopAlertEffect items={items} />
      <NavigationDrawerItem
        label={t`Notifications`}
        Icon={IconBell}
        onClick={handleClick}
        secondaryLabel={unreadCount > 0 ? `${unreadCount}` : undefined}
        isUnread={unreadCount > 0}
        active={location.pathname.startsWith(AppPath.Notifications)}
      />
    </>
  );
};
