import { styled } from '@linaria/react';
import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { IconTrash } from 'twenty-ui/icon';
import { Status } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { type ThemeColor, themeCssVariables } from 'twenty-ui/theme';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { SettingsDnsRecordsTable } from '@/settings/components/SettingsDnsRecordsTable';
import { REMOVE_SENDING_DOMAIN } from '@/settings/sending-domains/graphql/mutations/removeSendingDomain';
import { type SendingDomain } from '@/settings/sending-domains/types/SendingDomain';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';

const StyledTitle = styled.span`
  align-items: center;
  display: inline-flex;
  gap: ${themeCssVariables.spacing[2]};
`;

type SettingsSendingDomainSectionProps = {
  sendingDomain: SendingDomain;
  onRemoved: () => void;
};

export const SettingsSendingDomainSection = ({
  sendingDomain,
  onRemoved,
}: SettingsSendingDomainSectionProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openDialog } = useDialog();
  const removeDialogId = `remove-sending-domain-${sendingDomain.domain}`;
  const apolloCoreClient = useApolloCoreClient();
  const [removeSendingDomain, { loading: isRemoving }] = useMutation(
    REMOVE_SENDING_DOMAIN,
    { client: apolloCoreClient },
  );

  const statusDisplay: Record<
    SendingDomain['status'],
    { label: string; color: ThemeColor; description: string }
  > = {
    preparing: {
      label: t`Preparing`,
      color: 'gray',
      description: t`Creating the signing key. Check again in a few seconds.`,
    },
    pending: {
      label: t`Waiting for DNS`,
      color: 'orange',
      description: t`Add the records below at your DNS provider, then check again. DNS changes can take up to an hour.`,
    },
    verified: {
      label: t`Verified`,
      color: 'green',
      description: t`Ready. Signing starts within a few minutes; then any address on this domain can be the From address of a campaign.`,
    },
  };

  const { label, color, description } = statusDisplay[sendingDomain.status];

  const handleRemove = async () => {
    try {
      await removeSendingDomain({
        variables: { domain: sendingDomain.domain },
      });
      enqueueToast({
        status: 'success',
        children: t`${sendingDomain.domain} removed. Campaigns can no longer send from it.`,
      });
      onRemoved();
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  return (
    <Section.Root>
      <Section.Header
        title={
          <StyledTitle>
            {sendingDomain.domain}
            <Status color={color}>{label}</Status>
          </StyledTitle>
        }
        description={description}
        actions={
          !sendingDomain.isFixed && (
            <Button
              variant="outline"
              color="danger"
              size="sm"
              startIcon={<IconTrash />}
              onClick={() => openDialog(removeDialogId)}
              loading={isRemoving}
              disabled={isRemoving}
            >{t`Remove`}</Button>
          )
        }
      />
      <ConfirmationDialog
        dialogId={removeDialogId}
        title={t`Remove ${sendingDomain.domain}?`}
        subtitle={t`Campaigns stop sending from this domain. Its key is kept, so adding it back later works with the same DNS records.`}
        onConfirmClick={handleRemove}
        confirmButtonText={t`Remove`}
        confirmButtonColor="danger"
      />
      <SettingsDnsRecordsTable
        records={sendingDomain.records.map((record) => ({
          type: record.type,
          key: record.hostLabel,
          value: record.value,
          status: record.status === 'ok' ? t`Found` : t`Not found`,
          statusColor: record.status === 'ok' ? 'green' : 'red',
        }))}
      />
    </Section.Root>
  );
};
