import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { Section } from 'twenty-ui/components/layout';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { CREATE_CAMPAIGN } from '@/campaigns/graphql/mutations/campaignMutations';
import { useCampaignMutation } from '@/campaigns/hooks/useCampaignMutation';
import { type CampaignsOverview } from '@/campaigns/types/Campaign';
import { useSendingDomains } from '@/settings/sending-domains/hooks/useSendingDomains';
import { Select } from '@/ui/input/components/Select';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledRow = styled.div`
  align-items: flex-end;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 1fr 1fr;
`;

const StyledAddressRow = styled.div`
  align-items: flex-end;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 1fr auto 1fr;
`;

const StyledAt = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  padding-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledButtons = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

type CampaignCreateFormProps = {
  overview: CampaignsOverview;
  onCreated: () => void;
  onCancel: () => void;
};

export const CampaignCreateForm = ({
  overview,
  onCreated,
  onCancel,
}: CampaignCreateFormProps) => {
  const { t } = useLingui();
  const createCampaign = useCampaignMutation(CREATE_CAMPAIGN);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromLocalPart, setFromLocalPart] = useState('news');
  const [fromDomain, setFromDomain] = useState(overview.fromDomains[0] ?? '');
  const [audienceId, setAudienceId] = useState<number | null>(
    overview.audiences[0]?.id ?? null,
  );
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const { sendingDomainList } = useSendingDomains();
  const senders = (sendingDomainList?.senders ?? []).filter((sender) =>
    overview.fromDomains.includes(sender.email.split('@')[1]),
  );

  const handleSenderChange = (senderEmail: string) => {
    const sender = senders.find(({ email }) => email === senderEmail);

    if (!sender) {
      return;
    }

    const [localPart, domain] = sender.email.split('@');

    setFromName(sender.name);
    setFromLocalPart(localPart);
    setFromDomain(domain);
    setReplyTo(sender.replyTo);
  };

  const isComplete =
    [name, subject, fromName, fromLocalPart, fromDomain, body].every((value) =>
      isNonEmptyString(value.trim()),
    ) && audienceId !== null;

  const handleCreate = async () => {
    if (!isComplete || audienceId === null) {
      return;
    }

    const isCreated = await createCampaign.run(
      {
        input: {
          name,
          subject,
          fromName,
          fromLocalPart,
          fromDomain,
          replyTo: isNonEmptyString(replyTo.trim()) ? replyTo.trim() : null,
          audienceIds: [audienceId],
          body,
        },
      },
      t`Draft saved. Send yourself a test before starting it.`,
    );

    if (isCreated) {
      onCreated();
    }
  };

  return (
    <Section.Root>
      <Section.Header
        title={t`New campaign`}
        description={t`Saved as a draft. Nothing is sent until you press Start.`}
      />
      <StyledForm>
        <StyledRow>
          <SettingsTextInput
            instanceId="campaign-name"
            label={t`Name (for your team)`}
            value={name}
            onChange={setName}
            fullWidth
          />
          <SettingsTextInput
            instanceId="campaign-subject"
            label={t`Subject`}
            value={subject}
            onChange={setSubject}
            fullWidth
          />
        </StyledRow>
        {senders.length > 0 && (
          <Select
            dropdownId="campaign-sender"
            label={t`Saved sender`}
            fullWidth
            value={
              senders.find(
                (sender) => sender.email === `${fromLocalPart}@${fromDomain}`,
              )?.email
            }
            onChange={handleSenderChange}
            options={senders.map((sender) => ({
              label: t`${sender.name} <${sender.email}>`,
              value: sender.email,
            }))}
          />
        )}
        <StyledRow>
          <SettingsTextInput
            instanceId="campaign-from-name"
            label={t`Sender name`}
            value={fromName}
            onChange={setFromName}
            fullWidth
          />
          <Select
            dropdownId="campaign-audience"
            label={t`Audience`}
            fullWidth
            value={audienceId ?? undefined}
            onChange={setAudienceId}
            options={overview.audiences.map((audience) => ({
              label: t`${audience.name} (${audience.subscriberCount})`,
              value: audience.id,
            }))}
          />
        </StyledRow>
        <StyledAddressRow>
          <SettingsTextInput
            instanceId="campaign-from-local-part"
            label={t`Sender address`}
            value={fromLocalPart}
            onChange={setFromLocalPart}
            fullWidth
          />
          <StyledAt>@</StyledAt>
          <Select
            dropdownId="campaign-from-domain"
            fullWidth
            value={fromDomain}
            onChange={setFromDomain}
            options={overview.fromDomains.map((domain) => ({
              label: domain,
              value: domain,
            }))}
          />
        </StyledAddressRow>
        <SettingsTextInput
          instanceId="campaign-reply-to"
          label={t`Reply-to mailbox (where replies go)`}
          value={replyTo}
          onChange={setReplyTo}
          fullWidth
        />
        <TextArea
          textAreaId="campaign-body"
          label={t`Content (Markdown: # heading, **bold**, [link](https://…))`}
          value={body}
          onChange={setBody}
          minRows={10}
        />
        <StyledButtons>
          <Button variant="ghost" onClick={onCancel}>{t`Cancel`}</Button>
          <Button
            variant="solid"
            color="accent"
            onClick={handleCreate}
            loading={createCampaign.loading}
            disabled={!isComplete || createCampaign.loading}
          >{t`Save draft`}</Button>
        </StyledButtons>
      </StyledForm>
    </Section.Root>
  );
};
