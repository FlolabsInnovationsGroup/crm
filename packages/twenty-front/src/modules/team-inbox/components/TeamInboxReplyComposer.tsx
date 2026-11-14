import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconFileText, IconPaperclip, IconSend } from 'twenty-ui/icon';

import { EmailAttachmentsField } from '@/activities/emails/components/EmailAttachmentsField';
import { EmailComposerFields } from '@/activities/emails/components/EmailComposerFields';
import { INLINE_EMAIL_BODY_EDITOR_PROFILE } from '@/activities/emails/editor/constants/InlineEmailBodyEditorProfile';
import { useAttachEmailFiles } from '@/activities/emails/hooks/useAttachEmailFiles';
import { useEmailComposerState } from '@/activities/emails/hooks/useEmailComposerState';
import { useUploadEmailImage } from '@/activities/emails/hooks/useUploadEmailImage';
import { type EmailDraftPrefill } from '@/activities/emails/types/EmailDraftPrefill';
import { type EmailReplyMode } from '@/activities/emails/types/EmailReplyMode';
import { type ReplyContextReady } from '@/activities/emails/types/ReplyContext';
import { fillEmailTemplateVariables } from '@/activities/emails/utils/fillEmailTemplateVariables';
import { getEmailTemplateBody } from '@/activities/emails/utils/getEmailTemplateBody';
import { FormAdvancedTextFieldInput } from '@/advanced-text-editor/components/FormAdvancedTextFieldInput';
import { TeamInboxAvatar } from '@/team-inbox/components/TeamInboxAvatar';
import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import {
  type InboxEmailTemplate,
  useInboxEmailTemplates,
} from '@/team-inbox/hooks/useInboxEmailTemplates';

const StyledComposer = styled.div`
  background: var(--fl-surface);
  border-radius: 16px;
  box-shadow:
    0 0 0 2px var(--fl-accent),
    var(--fl-shadow-composer);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 62%;
  min-height: 0;
`;

const StyledToRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px 0;
`;

const StyledToLabel = styled.span`
  color: var(--fl-muted);
  font-size: 13px;
`;

const StyledRecipient = styled.span`
  align-items: center;
  background: var(--fl-chip);
  border-radius: 14px;
  color: var(--fl-ink);
  display: inline-flex;
  font-size: 13px;
  font-weight: 500;
  gap: 6px;
  padding: 3px 10px 3px 3px;
`;

const StyledLinkButton = styled.button`
  background: none;
  border: none;
  color: var(--fl-faint);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 0;

  &:hover {
    color: var(--fl-ink-soft);
  }
`;

const StyledSpacer = styled.span`
  flex: 1;
`;

const StyledFrom = styled.span`
  color: var(--fl-faint);
  font-size: 12px;
`;

const StyledBody = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  font-size: 14px;
  line-height: 1.6;
  min-height: 92px;
  overflow-y: auto;
  padding: 8px 12px 6px;
`;

const StyledFullFields = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
`;

const StyledAttachments = styled.div`
  padding: 0 16px 4px;
`;

const StyledFooter = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
  padding: 10px 12px 12px;
`;

const StyledTemplateChip = styled.button`
  align-items: center;
  background: var(--fl-accent-soft);
  border: none;
  border-radius: 9px;
  color: var(--fl-accent-ink);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  max-width: 240px;
  padding: 8px 12px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledIconButton = styled.button`
  align-items: center;
  background: var(--fl-chip);
  border: none;
  border-radius: 9px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  display: flex;
  height: 36px;
  justify-content: center;
  width: 36px;
`;

const StyledHint = styled.span`
  color: var(--fl-faint);
  font-size: 12px;

  @container team-inbox (max-width: 1100px) {
    display: none;
  }
`;

const StyledSendButton = styled.button`
  align-items: center;
  background: var(--fl-accent);
  border: none;
  border-radius: 10px;
  color: var(--fl-on-accent);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  padding: 10px 20px;

  &:hover:not(:disabled) {
    background: var(--fl-accent-hover);
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

type RecipientName = { firstName: string; lastName: string };

type TeamInboxReplyComposerProps = {
  replyContext: ReplyContextReady;
  replyMode: EmailReplyMode;
  draftPrefill: EmailDraftPrefill | null;
  fromHandle: string | null;
  recipientName: RecipientName | null;
  initialTemplateId: string | null;
  onInitialTemplateApplied: () => void;
  onClose: () => void;
  onSent: () => void;
};

const getRecipientName = (
  recipientName: RecipientName | null,
  displayName: string | undefined,
): RecipientName => {
  if (isDefined(recipientName)) {
    return recipientName;
  }

  const [firstName = '', ...lastNameParts] = (displayName ?? '')
    .trim()
    .split(/\s+/);

  return { firstName, lastName: lastNameParts.join(' ') };
};

export const TeamInboxReplyComposer = ({
  replyContext,
  replyMode,
  draftPrefill,
  fromHandle,
  recipientName,
  initialTemplateId,
  onInitialTemplateApplied,
  onClose,
  onSent,
}: TeamInboxReplyComposerProps) => {
  const [isShowingAllFields, setIsShowingAllFields] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [appliedInitialTemplateId, setAppliedInitialTemplateId] = useState<
    string | null
  >(null);
  const templates = useInboxEmailTemplates();
  const { uploadEmailImage } = useUploadEmailImage();

  const composerState = useEmailComposerState({
    connectedAccountId: replyContext.connectedAccountId,
    draftPrefill,
    defaultTo: replyContext.to,
    defaultCc: replyMode === 'reply-all' ? replyContext.replyAllCc : '',
    defaultSubject: replyContext.subject,
    defaultInReplyTo: replyContext.inReplyTo,
    onSent,
  });

  const { openAttachmentPicker, isUploadingAttachments } = useAttachEmailFiles({
    onFilesAttached: composerState.setFiles,
  });

  const canSendReply = composerState.canSend && !isUploadingAttachments;

  const applyTemplate = (template: InboxEmailTemplate) => {
    const name = getRecipientName(
      recipientName,
      composerState.to[0]?.displayName,
    );

    setTemplateId(template.id);
    // A reply keeps its "Re:" subject; the template only fills the body.
    composerState.applyTemplate({
      subject: composerState.subject,
      body: fillEmailTemplateVariables(getEmailTemplateBody(template), name),
    });
  };

  // "Reply with template" opens the composer with the suggestion filled in,
  // once the templates have loaded.
  useEffect(() => {
    if (
      !isNonEmptyString(initialTemplateId) ||
      isDefined(draftPrefill) ||
      appliedInitialTemplateId === initialTemplateId
    ) {
      return;
    }

    const template = templates.find(({ id }) => id === initialTemplateId);

    if (isDefined(template)) {
      setAppliedInitialTemplateId(initialTemplateId);
      applyTemplate(template);
      onInitialTemplateApplied();
    }
    // applyTemplate is rebuilt every render; the ids decide when to run.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, initialTemplateId, appliedInitialTemplateId, draftPrefill]);

  // The full fields have their own Ctrl+Enter on the recipient inputs.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isShowingAllFields || event.defaultPrevented) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();

      if (canSendReply) {
        composerState.handleSend();
      }
    }
  };

  const selectedTemplate = templates.find(({ id }) => id === templateId);

  return (
    <StyledComposer onKeyDown={handleKeyDown}>
      {isShowingAllFields ? (
        <StyledFullFields>
          <EmailComposerFields
            composerState={composerState}
            onAttachFiles={openAttachmentPicker}
            isSendDisabled={!canSendReply}
          />
        </StyledFullFields>
      ) : (
        <>
          <StyledToRow>
            <StyledToLabel>{t`To`}</StyledToLabel>
            {composerState.to.map((recipient) => {
              const label = isNonEmptyString(recipient.displayName)
                ? recipient.displayName
                : recipient.address;

              return (
                <StyledRecipient
                  key={recipient.address}
                  title={recipient.address}
                >
                  <TeamInboxAvatar name={label} size={20} />
                  <span dir="auto">{label}</span>
                </StyledRecipient>
              );
            })}
            {composerState.cc.length > 0 && (
              <StyledToLabel>{t`Cc ${composerState.cc.length}`}</StyledToLabel>
            )}
            <StyledLinkButton
              type="button"
              onClick={() => {
                // Reseed the full editor with what was typed so far.
                composerState.applyTemplate({
                  subject: composerState.subject,
                  body: composerState.body,
                });
                setIsShowingAllFields(true);
              }}
            >
              {t`Cc/Bcc · Subject`}
            </StyledLinkButton>
            <StyledSpacer />
            {isNonEmptyString(fromHandle) && (
              <StyledFrom>{t`from ${fromHandle}`}</StyledFrom>
            )}
          </StyledToRow>
          <StyledBody>
            <FormAdvancedTextFieldInput
              key={composerState.contentVersion}
              defaultValue={composerState.initialBody}
              onChange={composerState.setBody}
              profile={INLINE_EMAIL_BODY_EDITOR_PROFILE}
              onImageUpload={uploadEmailImage}
            />
          </StyledBody>
          {composerState.files.length > 0 && (
            <StyledAttachments>
              <EmailAttachmentsField
                files={composerState.files}
                onChange={composerState.setFiles}
              />
            </StyledAttachments>
          )}
        </>
      )}
      <StyledFooter>
        {templates.length > 0 && !isShowingAllFields && (
          <TeamInboxMenu
            dropdownId="team-inbox-composer-template"
            placement="top-start"
            isSearchable
            searchPlaceholder={t`Search templates`}
            selectedValue={templateId}
            items={templates.map((template) => ({
              value: template.id,
              label: template.name ?? t`Untitled template`,
            }))}
            onSelect={(value) => {
              const template = templates.find(({ id }) => id === value);

              if (isDefined(template)) {
                applyTemplate(template);
              }
            }}
            trigger={
              <StyledTemplateChip type="button">
                <IconFileText size={15} />
                <span>{selectedTemplate?.name ?? t`Insert template`}</span>
              </StyledTemplateChip>
            }
          />
        )}
        {!isShowingAllFields && (
          <StyledIconButton
            type="button"
            aria-label={t`Attach files`}
            title={t`Attach files`}
            onClick={openAttachmentPicker}
          >
            <IconPaperclip size={16} />
          </StyledIconButton>
        )}
        <StyledSpacer />
        <StyledLinkButton type="button" onClick={onClose}>
          {t`Cancel`}
        </StyledLinkButton>
        <StyledHint>{t`Ctrl + Enter`}</StyledHint>
        <StyledSendButton
          type="button"
          disabled={!canSendReply || composerState.loading}
          onClick={composerState.handleSend}
        >
          {t`Send`}
          <IconSend size={15} />
        </StyledSendButton>
      </StyledFooter>
    </StyledComposer>
  );
};
