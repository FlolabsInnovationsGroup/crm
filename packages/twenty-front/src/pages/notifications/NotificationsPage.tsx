import { t } from '@lingui/core/macro';
import { IconBell } from 'twenty-ui/icon';
import { useTheme } from 'twenty-ui/theme';

import { NotificationsList } from '@/notifications/components/NotificationsList';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

export const NotificationsPage = () => {
  const theme = useTheme();

  return (
    <>
      <PageTitle title={t`Notifications`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconBell
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Notifications`}
          />
        }
      >
        <NotificationsList />
      </PageCardLayout>
    </>
  );
};
