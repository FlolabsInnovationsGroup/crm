import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components/layout';
import { IconPlus, IconSend } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { CampaignCreateForm } from '@/campaigns/components/CampaignCreateForm';
import { CampaignsTable } from '@/campaigns/components/CampaignsTable';
import { useCampaignsOverview } from '@/campaigns/hooks/useCampaignsOverview';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[6]};
`;

export const CampaignsPage = () => {
  const theme = useTheme();
  const { overview, loading, error, refetch } = useCampaignsOverview();
  const [isCreating, setIsCreating] = useState(false);

  const handleRefetch = () => {
    refetch().catch(() => undefined);
  };

  const handleCreated = () => {
    setIsCreating(false);
    handleRefetch();
  };

  const canCreate =
    overview?.isConfigured === true &&
    overview.fromDomains.length > 0 &&
    overview.audiences.length > 0;

  return (
    <>
      <PageTitle title={t`Campaigns`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconSend
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Campaigns`}
            actionButton={
              canCreate && !isCreating ? (
                <Button
                  variant="solid"
                  color="accent"
                  size="sm"
                  startIcon={<IconPlus />}
                  onClick={() => setIsCreating(true)}
                >{t`New campaign`}</Button>
              ) : undefined
            }
          />
        }
      >
        <ToastOnQueryErrorEffect error={error} />
        <StyledContent>
          {loading && overview === undefined && (
            <span>{t`Loading campaigns…`}</span>
          )}
          {overview?.isConfigured === false && (
            <Section.Root>
              <Section.Header
                title={t`Campaigns are not set up`}
                description={t`The campaign server is not connected to this CRM. Ask an administrator.`}
              />
            </Section.Root>
          )}
          {overview?.isConfigured === true &&
            overview.fromDomains.length === 0 && (
              <Section.Root>
                <Section.Header
                  title={t`No verified sending domain yet`}
                  description={t`Add one in Settings > Sending domains, then come back.`}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      href={getSettingsPath(SettingsPath.SendingDomains)}
                    >{t`Sending domains`}</Button>
                  }
                />
              </Section.Root>
            )}
          {isCreating && overview?.isConfigured === true && (
            <CampaignCreateForm
              overview={overview}
              onCreated={handleCreated}
              onCancel={() => setIsCreating(false)}
            />
          )}
          {overview?.isConfigured === true && (
            <Section.Root>
              <Section.Header
                title={t`All campaigns`}
                description={t`Newest first. Numbers refresh when you reopen this page.`}
              />
              {overview.campaigns.length > 0 ? (
                <CampaignsTable
                  campaigns={overview.campaigns}
                  onChanged={handleRefetch}
                />
              ) : (
                <span>{t`No campaigns yet.`}</span>
              )}
            </Section.Root>
          )}
        </StyledContent>
      </PageCardLayout>
    </>
  );
};
