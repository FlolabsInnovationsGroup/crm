import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconSend } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { EmailComposerFields } from '@/activities/emails/components/EmailComposerFields';
import { useAttachEmailFiles } from '@/activities/emails/hooks/useAttachEmailFiles';
import { useEmailComposerState } from '@/activities/emails/hooks/useEmailComposerState';
import { type ReplyContextReady } from '@/activities/emails/hooks/useReplyContext';
import { type EmailDraftPrefill } from '@/activities/emails/types/EmailDraftPrefill';
import { type EmailReplyMode } from '@/activities/emails/types/EmailReplyMode';

const StyledContainer = styled.div`
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.xl};
  box-shadow:
    0 0 0 2px ${themeCssVariables.color.turquoise},
    ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  max-height: 60%;
  min-height: 0;
  overflow-y: auto;
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

type TeamInboxReplyComposerProps = {
  replyContext: ReplyContextReady;
  replyMode: EmailReplyMode;
  draftPrefill: EmailDraftPrefill | null;
  onClose: () => void;
  onSent: () => void;
};

export const TeamInboxReplyComposer = ({
  replyContext,
  replyMode,
  draftPrefill,
  onClose,
  onSent,
}: TeamInboxReplyComposerProps) => {
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

  return (
    <StyledContainer>
      <EmailComposerFields
        composerState={composerState}
        onAttachFiles={openAttachmentPicker}
        isSendDisabled={!canSendReply}
      />
      <StyledActions>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t`Cancel`}
        </Button>
        <Button
          variant="solid"
          color="accent"
          size="md"
          startIcon={<IconSend />}
          disabled={!canSendReply}
          onClick={composerState.handleSend}
        >
          {t`Send`}
        </Button>
      </StyledActions>
    </StyledContainer>
  );
};
