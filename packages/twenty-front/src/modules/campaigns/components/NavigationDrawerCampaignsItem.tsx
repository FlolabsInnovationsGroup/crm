import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { IconSend } from 'twenty-ui/icon';

import { CAMPAIGNS_PATH } from '@/campaigns/constants/CampaignsPath';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const NavigationDrawerCampaignsItem = () => {
  const location = useLocation();
  const canManageCampaigns = useHasPermissionFlag(PermissionFlagType.WORKSPACE);

  if (!canManageCampaigns) {
    return null;
  }

  return (
    <NavigationDrawerItem
      label={t`Campaigns`}
      Icon={IconSend}
      to={CAMPAIGNS_PATH}
      active={location.pathname.startsWith(CAMPAIGNS_PATH)}
    />
  );
};
