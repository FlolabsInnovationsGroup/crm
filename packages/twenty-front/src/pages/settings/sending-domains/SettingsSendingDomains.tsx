import { useLingui } from '@lingui/react/macro';
import { Section } from 'twenty-ui/components/layout';
import { IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsSendingDomainAddForm } from '@/settings/sending-domains/components/SettingsSendingDomainAddForm';
import { SettingsSendingDomainSection } from '@/settings/sending-domains/components/SettingsSendingDomainSection';
import { useSendingDomains } from '@/settings/sending-domains/hooks/useSendingDomains';

// dkim-manager creates a new domain's key within about ten seconds.
const REFETCH_AFTER_ADD_DELAY_IN_MILLISECONDS = 12000;

export const SettingsSendingDomains = () => {
  const { t } = useLingui();
  const { sendingDomainList, loading, error, refetch } = useSendingDomains();

  const handleRefetch = () => {
    refetch().catch(() => undefined);
  };

  const handleAdded = () => {
    handleRefetch();
    setTimeout(handleRefetch, REFETCH_AFTER_ADD_DELAY_IN_MILLISECONDS);
  };

  const isConfigured = sendingDomainList?.isConfigured === true;

  return (
    <SettingsPageLayout
      title={t`Sending domains`}
      links={[
        {
          children: t`Workspace`,
          href: getSettingsPath(SettingsPath.General),
        },
        { children: t`Sending domains` },
      ]}
      actionButton={
        isConfigured && (
          <Button
            variant="outline"
            startIcon={<IconRefresh />}
            onClick={handleRefetch}
            loading={loading}
            disabled={loading}
          >{t`Check DNS`}</Button>
        )
      }
    >
      <ToastOnQueryErrorEffect error={error} />
      <SettingsPageContainer>
        {sendingDomainList?.isConfigured === false && (
          <Section.Root>
            <Section.Header
              title={t`Not set up on this server`}
              description={t`The campaigns mail server is not connected to this CRM. Ask an administrator.`}
            />
          </Section.Root>
        )}
        {isConfigured && (
          <>
            <Section.Root>
              <Section.Header
                title={t`Add a domain`}
                description={t`Campaigns can send from any address on a verified domain. Use a subdomain such as news.example.com, so the main domain's mailboxes are never affected.`}
              />
              <SettingsSendingDomainAddForm onAdded={handleAdded} />
            </Section.Root>
            {sendingDomainList.domains.map((sendingDomain) => (
              <SettingsSendingDomainSection
                key={sendingDomain.domain}
                sendingDomain={sendingDomain}
                onRemoved={handleRefetch}
              />
            ))}
          </>
        )}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
