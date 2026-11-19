import { styled } from '@linaria/react';
import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { IconPlus, IconTrash } from 'twenty-ui/icon';
import { Status } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { ADD_SENDING_SENDER } from '@/settings/sending-domains/graphql/mutations/addSendingSender';
import { REMOVE_SENDING_SENDER } from '@/settings/sending-domains/graphql/mutations/removeSendingSender';
import { type SendingSender } from '@/settings/sending-domains/types/SendingDomain';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

const StyledForm = styled.div`
  align-items: flex-end;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 1fr 1fr 1fr auto;
`;

const StyledSenderRow = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} 0;
`;

const StyledSenderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSecondary = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

type SettingsSendingSendersSectionProps = {
  senders: SendingSender[];
  onChanged: () => void;
};

export const SettingsSendingSendersSection = ({
  senders,
  onChanged,
}: SettingsSendingSendersSectionProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const apolloCoreClient = useApolloCoreClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [addSendingSender, { loading: isAdding }] = useMutation(
    ADD_SENDING_SENDER,
    { client: apolloCoreClient },
  );
  const [removeSendingSender, { loading: isRemoving }] = useMutation(
    REMOVE_SENDING_SENDER,
    { client: apolloCoreClient },
  );

  const isComplete = [name, email, replyTo].every((value) =>
    isNonEmptyString(value.trim()),
  );

  const handleAdd = async () => {
    if (!isComplete || isAdding) {
      return;
    }

    try {
      await addSendingSender({
        variables: { input: { name, email, replyTo } },
      });
      setName('');
      setEmail('');
      setReplyTo('');
      onChanged();
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const handleRemove = async (senderEmail: string) => {
    try {
      await removeSendingSender({ variables: { email: senderEmail } });
      onChanged();
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  return (
    <Section.Root>
      <Section.Header
        title={t`Senders`}
        description={t`Saved senders appear in the campaign form. Replies go to the reply-to mailbox, so pick one somebody reads.`}
      />
      <StyledForm>
        <SettingsTextInput
          instanceId="settings-sending-sender-name"
          label={t`Sender name`}
          value={name}
          onChange={setName}
          fullWidth
        />
        <SettingsTextInput
          instanceId="settings-sending-sender-email"
          label={t`Sender address`}
          value={email}
          onChange={setEmail}
          fullWidth
        />
        <SettingsTextInput
          instanceId="settings-sending-sender-reply-to"
          label={t`Reply-to mailbox`}
          value={replyTo}
          onChange={setReplyTo}
          onInputEnter={handleAdd}
          fullWidth
        />
        <Button
          startIcon={<IconPlus />}
          onClick={handleAdd}
          loading={isAdding}
          disabled={!isComplete || isAdding}
        >{t`Add sender`}</Button>
      </StyledForm>
      {senders.map((sender) => (
        <StyledSenderRow key={sender.email}>
          <StyledSenderText>
            <span>{t`${sender.name} <${sender.email}>`}</span>
            <StyledSecondary>{t`Replies go to ${sender.replyTo}`}</StyledSecondary>
          </StyledSenderText>
          {!sender.canReceiveReplies && (
            <Status color="orange">{t`Reply-to cannot receive mail`}</Status>
          )}
          <Button
            variant="ghost"
            color="danger"
            size="sm"
            startIcon={<IconTrash />}
            onClick={() => handleRemove(sender.email)}
            disabled={isRemoving}
          >{t`Remove`}</Button>
        </StyledSenderRow>
      ))}
    </Section.Root>
  );
};
