import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconMail } from 'twenty-ui/icon';

import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

export const NavigationDrawerTeamInboxItem = () => {
  const location = useLocation();
  const { unreadCount } = useTeamInboxReadState();

  return (
    <NavigationDrawerItem
      label={t`Team inbox`}
      Icon={IconMail}
      to={AppPath.TeamInbox}
      secondaryLabel={unreadCount > 0 ? `${unreadCount}` : undefined}
      isUnread={unreadCount > 0}
      active={location.pathname.startsWith(AppPath.TeamInbox)}
    />
  );
};
