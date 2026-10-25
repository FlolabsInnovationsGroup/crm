import { styled } from '@linaria/react';
import { useCallback, useMemo } from 'react';

import { EmailComposerFields } from '@/activities/emails/components/EmailComposerFields';
import { useEmailComposerState } from '@/activities/emails/hooks/useEmailComposerState';
import { useAttachEmailFiles } from '@/activities/emails/hooks/useAttachEmailFiles';
import { type ReplyContextReady } from '@/activities/emails/hooks/useReplyContext';
import { type EmailReplyMode } from '@/activities/emails/types/EmailReplyMode';
import { type EmailDraftPrefill } from '@/activities/emails/types/EmailDraftPrefill';
import { EmailThreadComposerFooterEffect } from '@/page-layout/widgets/email-thread/components/EmailThreadComposerFooterEffect';
import { SIDE_PANEL_FOCUS_ID } from '@/side-panel/constants/SidePanelFocusId';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { type SidePanelFooterCommandMenuItem } from '@/ui/layout/side-panel/types/SidePanelFooterCommandMenuItem';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { isNonEmptyString } from '@sniptt/guards';
import {
  IconArrowBackUp,
  IconArrowBackUpDouble,
  IconPaperclip,
  IconSend,
  IconX,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledReplyBar = styled.button`
  align-items: center;
  all: unset;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.secondary};
  }
`;

const StyledReplyBarRow = styled.div`
  display: flex;

  & > * {
    flex: 1;
  }
`;

type EmailThreadComposerProps = {
  replyContext: ReplyContextReady;
  replyMode: EmailReplyMode;
  onReplyOpen: (mode: EmailReplyMode) => void;
  isInSidePanel: boolean;
  isComposerOpen: boolean;
  setIsComposerOpen: (open: boolean) => void;
  draftPrefill?: EmailDraftPrefill | null;
};

export const EmailThreadComposer = ({
  replyContext,
  replyMode,
  onReplyOpen,
  isInSidePanel,
  isComposerOpen,
  setIsComposerOpen,
  draftPrefill,
}: EmailThreadComposerProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const handleReplySent = useCallback(
    (messageThreadId: string | null) => {
      setIsComposerOpen(false);

      if (isDefined(messageThreadId)) {
        openRecordInSidePanel({
          recordId: messageThreadId,
          objectNameSingular: CoreObjectNameSingular.MessageThread,
        });
      }
    },
    [setIsComposerOpen, openRecordInSidePanel],
  );

  const composerState = useEmailComposerState({
    connectedAccountId: replyContext.connectedAccountId,
    draftPrefill,
    defaultTo: replyContext.to,
    defaultCc: replyMode === 'reply-all' ? replyContext.replyAllCc : '',
    defaultSubject: replyContext.subject,
    defaultInReplyTo: replyContext.inReplyTo,
    onSent: handleReplySent,
  });

  const { handleSend, canSend } = composerState;

  const { openAttachmentPicker, isUploadingAttachments } = useAttachEmailFiles({
    onFilesAttached: composerState.setFiles,
  });

  const canSendReply = canSend && !isUploadingAttachments;

  const canReplyAll = isNonEmptyString(replyContext.replyAllCc);

  const footerCommandMenuItems =
    useMemo((): SidePanelFooterCommandMenuItem[] => {
      if (!isComposerOpen) {
        const replyItem: SidePanelFooterCommandMenuItem = {
          id: 'reply',
          label: t`Reply`,
          Icon: IconArrowBackUp,
          isPrimaryCTA: true,
          onClick: () => onReplyOpen('reply'),
        };

        if (!canReplyAll) {
          return [replyItem];
        }

        return [
          {
            id: 'reply-all',
            label: t`Reply all`,
            Icon: IconArrowBackUpDouble,
            isPinned: true,
            onClick: () => onReplyOpen('reply-all'),
          },
          replyItem,
        ];
      }

      return [
        {
          id: 'cancel-reply',
          label: t`Cancel reply`,
          Icon: IconX,
          isPinned: false,
          onClick: () => setIsComposerOpen(false),
        },
        {
          id: 'attach-files',
          label: t`Attach files`,
          Icon: IconPaperclip,
          isPinned: false,
          onClick: openAttachmentPicker,
        },
        {
          id: 'send',
          label: t`Send`,
          Icon: IconSend,
          isPrimaryCTA: true,
          shortcut: ['Mod', 'Enter'],
          onClick: handleSend,
          disabled: !canSendReply,
        },
      ];
    }, [
      isComposerOpen,
      handleSend,
      canSendReply,
      canReplyAll,
      onReplyOpen,
      setIsComposerOpen,
      openAttachmentPicker,
    ]);

  const handleSendHotkey = useCallback(() => {
    if (isComposerOpen && canSendReply) {
      handleSend();
    }
  }, [isComposerOpen, canSendReply, handleSend]);

  useHotkeysOnFocusedElement({
    keys: ['ctrl+Enter,meta+Enter'],
    callback: handleSendHotkey,
    focusId: SIDE_PANEL_FOCUS_ID,
    dependencies: [handleSendHotkey],
  });

  return (
    <>
      {isInSidePanel && (
        <EmailThreadComposerFooterEffect
          footerCommandMenuItems={footerCommandMenuItems}
        />
      )}
      {isComposerOpen ? (
        <EmailComposerFields
          composerState={composerState}
          onAttachFiles={isInSidePanel ? undefined : openAttachmentPicker}
        />
      ) : (
        !isInSidePanel && (
          <StyledReplyBarRow>
            <StyledReplyBar onClick={() => onReplyOpen('reply')}>
              <IconArrowBackUp size={16} />
              {t`Reply...`}
            </StyledReplyBar>
            {canReplyAll && (
              <StyledReplyBar onClick={() => onReplyOpen('reply-all')}>
                <IconArrowBackUpDouble size={16} />
                {t`Reply all...`}
              </StyledReplyBar>
            )}
          </StyledReplyBarRow>
        )
      )}
    </>
  );
};
