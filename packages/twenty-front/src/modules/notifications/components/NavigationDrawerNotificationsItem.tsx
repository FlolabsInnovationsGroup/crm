import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconBell } from 'twenty-ui/icon';

import { NotificationDesktopAlertEffect } from '@/notifications/components/NotificationDesktopAlertEffect';
import { useNotificationFeed } from '@/notifications/hooks/useNotificationFeed';
import { useNotificationsSeenState } from '@/notifications/hooks/useNotificationsSeenState';
import { isNotificationUnread } from '@/notifications/utils/buildNotificationItems';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useNavigateApp } from '~/hooks/useNavigateApp';

export const NavigationDrawerNotificationsItem = () => {
  const location = useLocation();
  const navigate = useNavigateApp();
  const items = useNotificationFeed();
  const { notificationsSeen, markNotificationsSeen } =
    useNotificationsSeenState();

  const now = new Date();
  const unreadCount = items.filter((item) =>
    isNotificationUnread(item, notificationsSeen.seenAt, now),
  ).length;

  const handleClick = () => {
    markNotificationsSeen();
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
