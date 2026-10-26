import { t } from '@lingui/core/macro';
import { IconMail } from 'twenty-ui/icon';
import { useTheme } from 'twenty-ui/theme';

import { TeamInboxContent } from '@/team-inbox/components/TeamInboxContent';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

export const TeamInboxPage = () => {
  const theme = useTheme();

  return (
    <>
      <PageTitle title={t`Team inbox`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconMail
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Team inbox`}
          />
        }
      >
        <TeamInboxContent />
      </PageCardLayout>
    </>
  );
};
