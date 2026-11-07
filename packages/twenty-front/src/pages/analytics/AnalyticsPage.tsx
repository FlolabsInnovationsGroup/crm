import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { IconLayoutDashboard } from 'twenty-ui/icon';
import { useTheme } from 'twenty-ui/theme';

import { AnalyticsContent } from '@/crm-analytics/components/AnalyticsContent';
import { AnalyticsSyncLine } from '@/crm-analytics/components/AnalyticsSyncLine';
import { useCrmAnalyticsMeta } from '@/crm-analytics/hooks/useCrmAnalyticsMeta';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

export const AnalyticsPage = () => {
  const theme = useTheme();
  const { meta } = useCrmAnalyticsMeta();

  const hasSyncLine =
    isDefined(meta) &&
    (meta.state === 'READY' || meta.state === 'NEVER_SYNCED');

  return (
    <>
      <PageTitle title={t`Analytics`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconLayoutDashboard
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Analytics`}
            actionButton={
              hasSyncLine ? <AnalyticsSyncLine sync={meta.sync} /> : undefined
            }
          />
        }
      >
        <AnalyticsContent />
      </PageCardLayout>
    </>
  );
};
