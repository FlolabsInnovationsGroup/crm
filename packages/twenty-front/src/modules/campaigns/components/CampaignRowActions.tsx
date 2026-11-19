import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { emailSchema } from 'twenty-shared/utils';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconSend,
  IconTrash,
  IconX,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import {
  CANCEL_CAMPAIGN,
  DELETE_CAMPAIGN_DRAFT,
  PAUSE_CAMPAIGN,
  SEND_CAMPAIGN_TEST,
  START_CAMPAIGN,
} from '@/campaigns/graphql/mutations/campaignMutations';
import { currentUserState } from '@/auth/states/currentUserState';
import { useCampaignMutation } from '@/campaigns/hooks/useCampaignMutation';
import { type Campaign } from '@/campaigns/types/Campaign';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
`;

type CampaignRowActionsProps = {
  campaign: Campaign;
  onChanged: () => void;
};

export const CampaignRowActions = ({
  campaign,
  onChanged,
}: CampaignRowActionsProps) => {
  const { t } = useLingui();
  const { openDialog } = useDialog();
  const currentUser = useAtomStateValue(currentUserState);
  const startDialogId = `start-campaign-${campaign.id}`;
  const testDialogId = `test-campaign-${campaign.id}`;
  const variables = { campaignId: campaign.id };
  const [testEmail, setTestEmail] = useState('');
  const isTestEmailValid = emailSchema.safeParse(testEmail.trim()).success;

  const sendTest = useCampaignMutation(SEND_CAMPAIGN_TEST);
  const start = useCampaignMutation(START_CAMPAIGN);
  const pause = useCampaignMutation(PAUSE_CAMPAIGN);
  const cancel = useCampaignMutation(CANCEL_CAMPAIGN);
  const deleteDraft = useCampaignMutation(DELETE_CAMPAIGN_DRAFT);

  const runAndRefresh = async (
    action: ReturnType<typeof useCampaignMutation>,
    successMessage: string,
  ) => {
    if (await action.run(variables, successMessage)) {
      onChanged();
    }
  };

  const canStart = campaign.status === 'draft' || campaign.status === 'paused';

  return (
    <StyledActions>
      {campaign.status === 'draft' && (
        <Button
          size="sm"
          variant="ghost"
          startIcon={<IconSend />}
          loading={sendTest.loading}
          onClick={() => {
            setTestEmail(currentUser?.email ?? '');
            openDialog(testDialogId);
          }}
        >{t`Send test`}</Button>
      )}
      {canStart && (
        <Button
          size="sm"
          variant="soft"
          color="accent"
          startIcon={<IconPlayerPlay />}
          loading={start.loading}
          onClick={() => openDialog(startDialogId)}
        >
          {campaign.status === 'paused' ? t`Resume` : t`Start`}
        </Button>
      )}
      {campaign.status === 'running' && (
        <Button
          size="sm"
          variant="ghost"
          startIcon={<IconPlayerPause />}
          loading={pause.loading}
          onClick={() => runAndRefresh(pause, t`Campaign paused.`)}
        >{t`Pause`}</Button>
      )}
      {(campaign.status === 'running' || campaign.status === 'paused') && (
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          startIcon={<IconX />}
          loading={cancel.loading}
          onClick={() => runAndRefresh(cancel, t`Campaign cancelled.`)}
        >{t`Cancel`}</Button>
      )}
      {campaign.status === 'draft' && (
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          startIcon={<IconTrash />}
          loading={deleteDraft.loading}
          onClick={() => runAndRefresh(deleteDraft, t`Draft deleted.`)}
        >{t`Delete`}</Button>
      )}
      <ConfirmationDialog
        dialogId={testDialogId}
        title={t`Send a test of "${campaign.name}"`}
        subtitle={
          <SettingsTextInput
            instanceId={testDialogId}
            label={t`Send to`}
            value={testEmail}
            onChange={setTestEmail}
            fullWidth
          />
        }
        isConfirmButtonDisabled={!isTestEmailValid}
        onConfirmClick={() =>
          sendTest.run(
            { ...variables, email: testEmail.trim() },
            t`Test sent to ${testEmail.trim()}.`,
          )
        }
        confirmButtonText={t`Send test`}
        confirmButtonColor="accent"
      />
      <ConfirmationDialog
        dialogId={startDialogId}
        title={t`Send "${campaign.name}"?`}
        subtitle={t`It goes to every subscriber of ${campaign.listNames.join(', ')}. The daily sending limit spreads a large campaign over several days.`}
        onConfirmClick={() => runAndRefresh(start, t`Campaign started.`)}
        confirmButtonText={t`Send campaign`}
        confirmButtonColor="accent"
      />
    </StyledActions>
  );
};
