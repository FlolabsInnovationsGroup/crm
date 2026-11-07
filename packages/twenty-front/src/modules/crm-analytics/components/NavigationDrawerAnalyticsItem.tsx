import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { IconLayoutDashboard } from 'twenty-ui/icon';

import { CRM_ANALYTICS_PATH } from '@/crm-analytics/constants/CrmAnalyticsPath';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const NavigationDrawerAnalyticsItem = () => {
  const location = useLocation();
  const canViewAnalytics = useHasPermissionFlag(PermissionFlagType.EXPORT_CSV);

  if (!canViewAnalytics) {
    return null;
  }

  return (
    <NavigationDrawerItem
      label={t`Analytics`}
      Icon={IconLayoutDashboard}
      to={CRM_ANALYTICS_PATH}
      active={location.pathname.startsWith(CRM_ANALYTICS_PATH)}
    />
  );
};
