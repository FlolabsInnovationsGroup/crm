import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { IconMail } from 'twenty-ui/icon';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

export const NavigationDrawerTeamInboxItem = () => {
  const location = useLocation();

  return (
    <NavigationDrawerItem
      label={t`Team inbox`}
      Icon={IconMail}
      to={AppPath.TeamInbox}
      active={location.pathname.startsWith(AppPath.TeamInbox)}
    />
  );
};
