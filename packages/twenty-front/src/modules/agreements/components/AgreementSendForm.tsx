import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { IconSignature } from 'twenty-ui/icon';
import { Button, Checkbox } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { AgreementPersonPicker } from '@/agreements/components/AgreementPersonPicker';
import { AgreementPreview } from '@/agreements/components/AgreementPreview';
import { SEND_AGREEMENT } from '@/agreements/graphql/agreementMutations';
import { useAgreementTemplates } from '@/agreements/hooks/useAgreementData';
import { useAgreementMutation } from '@/agreements/hooks/useAgreementMutation';
import { type AgreementPerson } from '@/agreements/types/Agreement';
import { getAgreementPersonLabel } from '@/agreements/utils/getAgreementPersonLabel';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';

const MAX_DOCUMENTS = 5;
const SEND_DIALOG_ID = 'send-agreement';

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledTemplates = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTemplate = styled.label`
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledButtons = styled.div`
  display: flex;
  justify-content: flex-end;
`;

type AgreementSendFormProps = {
  initialPerson: AgreementPerson | null;
  onSent: () => void;
};

export const AgreementSendForm = ({
  initialPerson,
  onSent,
}: AgreementSendFormProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openDialog } = useDialog();
  const { templates, loading: templatesLoading } = useAgreementTemplates();
  const sendAgreement = useAgreementMutation<{
    sendAgreement: { emailSent: boolean; emailError: string | null };
  }>(SEND_AGREEMENT);

  const [chosenPerson, setChosenPerson] = useState<AgreementPerson | null>(
    null,
  );
  const [isPersonCleared, setIsPersonCleared] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[]>([]);

  const person = chosenPerson ?? (isPersonCleared ? null : initialPerson);
  const email = person?.emails?.primaryEmail ?? '';
  const personLabel = getAgreementPersonLabel(person);
  const canSend =
    person !== null && isNonEmptyString(email) && templateIds.length > 0;

  const handlePersonChange = (nextPerson: AgreementPerson | null) => {
    setChosenPerson(nextPerson);
    setIsPersonCleared(nextPerson === null);
  };

  const handleTemplateToggle = (templateId: string, isChecked: boolean) => {
    setTemplateIds((current) =>
      isChecked
        ? [...current.filter((id) => id !== templateId), templateId].slice(
            0,
            MAX_DOCUMENTS,
          )
        : current.filter((id) => id !== templateId),
    );
  };

  const handleSend = async () => {
    if (person === null) {
      return;
    }

    const result = await sendAgreement.run({
      personId: person.id,
      templateIds,
    });

    if (result === null) {
      return;
    }

    if (result.sendAgreement.emailSent) {
      enqueueToast({
        status: 'success',
        children: t`Sent to ${email}. You will see the status below.`,
      });
    } else {
      const emailError = result.sendAgreement.emailError ?? '';

      enqueueToast({
        status: 'warning',
        children: t`The agreement is ready, but the email to ${email} failed: ${emailError}. Use "Resend email" below.`,
      });
    }

    setTemplateIds([]);
    handlePersonChange(null);
    onSent();
  };

  return (
    <Section.Root>
      <Section.Header
        title={t`Send an agreement`}
        description={t`The intern signs first, then FloLabs. Both signing links are emailed from hr@, and the signed files are saved on the person.`}
      />
      <StyledForm>
        <AgreementPersonPicker person={person} onChange={handlePersonChange} />
        {person !== null && !isNonEmptyString(email) && (
          <StyledHint>{t`This person has no email address yet.`}</StyledHint>
        )}
        <StyledTemplates>
          <span>{t`Documents (up to ${MAX_DOCUMENTS}, signed together)`}</span>
          {templatesLoading && templates.length === 0 && (
            <StyledHint>{t`Loading templates…`}</StyledHint>
          )}
          {!templatesLoading && templates.length === 0 && (
            <StyledHint>{t`No templates in use yet. Add them under Agreement templates.`}</StyledHint>
          )}
          {templates.map((template) => (
            <StyledTemplate key={template.id}>
              <Checkbox
                aria-label={template.name ?? t`Untitled template`}
                checked={templateIds.includes(template.id)}
                onCheckedChange={(isChecked) =>
                  handleTemplateToggle(template.id, isChecked)
                }
              />
              <span>{template.name ?? t`Untitled template`}</span>
            </StyledTemplate>
          ))}
        </StyledTemplates>
        {person !== null &&
          templateIds.map((templateId) => (
            <AgreementPreview
              key={`${person.id}-${templateId}`}
              templateId={templateId}
              personId={person.id}
            />
          ))}
        <StyledButtons>
          <Button
            variant="solid"
            color="accent"
            size="sm"
            startIcon={<IconSignature />}
            disabled={!canSend}
            loading={sendAgreement.loading}
            onClick={() => openDialog(SEND_DIALOG_ID)}
          >{t`Send for signature`}</Button>
        </StyledButtons>
      </StyledForm>
      <ConfirmationDialog
        dialogId={SEND_DIALOG_ID}
        title={t`Send to ${personLabel}?`}
        subtitle={t`${email} gets a signing link by email now. Check the previews first: the text cannot be changed once sent.`}
        onConfirmClick={handleSend}
        confirmButtonText={t`Send for signature`}
        confirmButtonColor="accent"
      />
    </Section.Root>
  );
};
