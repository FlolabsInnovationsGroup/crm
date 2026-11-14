import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import {
  IconArrowBackUp,
  IconArrowBackUpDouble,
  IconCheck,
  IconDotsVertical,
  IconRestore,
} from 'twenty-ui/icon';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { EmailLoader } from '@/activities/emails/components/EmailLoader';
import { useEmailThread } from '@/activities/emails/hooks/useEmailThread';
import { useReplyContext } from '@/activities/emails/hooks/useReplyContext';
import { type EmailDraftPrefill } from '@/activities/emails/types/EmailDraftPrefill';
import { type EmailReplyMode } from '@/activities/emails/types/EmailReplyMode';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';
import { getEmailDraftPrefillFromMessage } from '@/activities/emails/utils/getEmailDraftPrefillFromMessage';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxContactPane } from '@/team-inbox/components/TeamInboxContactPane';
import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import { TeamInboxMessageBubble } from '@/team-inbox/components/TeamInboxMessageBubble';
import { TeamInboxReplyComposer } from '@/team-inbox/components/TeamInboxReplyComposer';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { getConversationContact } from '@/team-inbox/utils/getConversationContact';
import { formatToHumanReadableDate } from '~/utils/date-utils';

// Threads longer than this open on their latest messages, like a chat.
const VISIBLE_MESSAGE_COUNT = 2;
const COLLAPSE_FROM_MESSAGE_COUNT = 4;

const StyledContainer = styled.section`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
  padding: 16px 18px 16px 16px;
`;

const StyledBackButton = styled.button`
  align-self: flex-start;
  background: var(--fl-chip);
  border: none;
  border-radius: 9px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  display: none;
  font-family: inherit;
  font-size: 13px;
  padding: 7px 12px;

  @container team-inbox (max-width: 700px) {
    display: block;
  }
`;

const StyledHeader = styled.header`
  align-items: center;
  background: var(--fl-surface);
  border-radius: 14px;
  box-shadow: var(--fl-shadow-card);
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 16px 20px;
`;

const StyledHeading = styled.div`
  flex: 1;
  min-width: 200px;
`;

const StyledSubject = styled.h2`
  color: var(--fl-ink);
  font-family: var(--fl-font-display);
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  overflow-wrap: anywhere;
`;

const StyledSubtitle = styled.p`
  color: var(--fl-muted);
  font-size: 13px;
  margin: 3px 0 0;
`;

const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;

const StyledChipButton = styled.button<{ tone?: 'accent' }>`
  align-items: center;
  background: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-accent-soft)' : 'var(--fl-chip)'};
  border: none;
  border-radius: 9px;
  color: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-accent-ink)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  font-weight: ${({ tone }) => (tone === 'accent' ? 600 : 500)};
  gap: 6px;
  padding: 9px 12px;
  white-space: nowrap;

  &:disabled {
    cursor: default;
    opacity: 0.6;
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
  height: 38px;
  justify-content: center;
  width: 38px;
`;

const StyledMessages = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
`;

const StyledEarlierButton = styled.button`
  align-self: center;
  background: var(--fl-chip-strong);
  border: none;
  border-radius: 14px;
  color: var(--fl-ink-quiet);
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
`;

const StyledReplyBar = styled.div`
  align-items: center;
  background: var(--fl-surface);
  border-radius: 16px;
  box-shadow: var(--fl-shadow-raised);
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  padding: 10px 12px;
`;

const StyledReplyPrompt = styled.button`
  background: none;
  border: none;
  color: var(--fl-faint);
  cursor: text;
  flex: 1;
  font-family: inherit;
  font-size: 14px;
  padding: 8px 6px;
  text-align: start;
`;

const StyledReplyButton = styled.button`
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
  gap: 6px;
  padding: 10px 18px;

  &:hover {
    background: var(--fl-accent-hover);
  }
`;

const StyledContactColumn = styled.aside`
  background: var(--fl-surface);
  box-shadow: -1px 0 0 var(--fl-line);
  flex: 0 0 300px;
  min-height: 0;
  overflow-y: auto;

  @container team-inbox (max-width: 1000px) {
    display: none;
  }
`;

type TeamInboxThreadPaneProps = {
  threadId: string;
  fallbackSubject: string;
  ownHandles: string[];
  mailboxes: InboxMailbox[];
  isClosed: boolean;
  initialTemplateId: string | null;
  onToggleClosed: () => Promise<void>;
  onBack: () => void;
  onMarkUnread: () => void;
};

const isOwnMessage = (
  message: EmailThreadMessageWithSender,
  ownHandles: string[],
) =>
  isDefined(message.sender?.workspaceMember) ||
  ownHandles.some(
    (handle) => handle.toLowerCase() === message.sender?.handle?.toLowerCase(),
  );

export const TeamInboxThreadPane = ({
  threadId,
  fallbackSubject,
  ownHandles,
  mailboxes,
  isClosed,
  initialTemplateId,
  onToggleClosed,
  onBack,
  onMarkUnread,
}: TeamInboxThreadPaneProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { messages, fetchMoreMessages, threadLoading } =
    useEmailThread(threadId);
  const replyContext = useReplyContext(threadId);
  const [replyMode, setReplyMode] = useState<EmailReplyMode | null>(
    isDefined(initialTemplateId) ? 'reply' : null,
  );
  const [draftPrefill, setDraftPrefill] = useState<EmailDraftPrefill | null>(
    null,
  );
  const [isShowingEarlier, setIsShowingEarlier] = useState(false);
  const [isTogglingClosed, setIsTogglingClosed] = useState(false);

  const subject = messages[0]?.subject ?? fallbackSubject;
  const contact = getConversationContact(messages, ownHandles);
  const firstMessageAt = messages[0]?.receivedAt;

  const lastMessage = messages[messages.length - 1];
  const trailingDraft = lastMessage?.isDraft === true ? lastMessage : null;
  const openReplyMode =
    replyMode ?? (isDefined(trailingDraft) ? 'reply' : null);
  const openDraftPrefill =
    draftPrefill ??
    (isDefined(trailingDraft)
      ? getEmailDraftPrefillFromMessage(trailingDraft)
      : null);

  const isCollapsed =
    !isShowingEarlier && messages.length >= COLLAPSE_FROM_MESSAGE_COUNT;
  const hiddenMessageCount = isCollapsed
    ? messages.length - VISIBLE_MESSAGE_COUNT
    : 0;
  const visibleMessages = messages.slice(hiddenMessageCount);

  const handleDraftClick = (message: EmailThreadMessageWithSender) => {
    setDraftPrefill(getEmailDraftPrefillFromMessage(message));
    setReplyMode('reply');
  };

  const handleCloseComposer = () => {
    setReplyMode(null);
    setDraftPrefill(null);
  };

  const handleSent = async () => {
    handleCloseComposer();
    await apolloCoreClient.refetchQueries({
      include: ['FindManyMessages', 'GetInboxThreads', 'GetInboxUnreadCount'],
    });
  };

  const handleToggleClosed = async () => {
    setIsTogglingClosed(true);

    try {
      await onToggleClosed();
    } finally {
      setIsTogglingClosed(false);
    }
  };

  const handleMoreAction = (action: string) => {
    if (action === 'panel') {
      openRecordInSidePanel({
        recordId: threadId,
        objectNameSingular: CoreObjectNameSingular.MessageThread,
      });
    }
  };

  const canReply = isDefined(replyContext) && replyContext.loading === false;
  const canReplyAll = canReply && isNonEmptyString(replyContext.replyAllCc);
  const contactName = contact?.displayName ?? '';
  const fromHandle = canReply
    ? (mailboxes.find(
        (mailbox) =>
          mailbox.connectedAccountId === replyContext.connectedAccountId,
      )?.handle ?? null)
    : null;

  const subtitle = [
    contactName,
    messages.length > 0
      ? plural(messages.length, { one: '# message', other: '# messages' })
      : null,
    isNonEmptyString(firstMessageAt)
      ? t`started ${formatToHumanReadableDate(firstMessageAt)}`
      : null,
  ]
    .filter(isNonEmptyString)
    .join(' · ');

  return (
    <>
      <StyledContainer aria-label={t`Conversation`}>
        <StyledBackButton type="button" onClick={onBack}>
          {t`Back to list`}
        </StyledBackButton>
        <StyledHeader>
          <StyledHeading>
            <StyledSubject dir="auto">
              {isNonEmptyString(subject) ? subject : t`(no subject)`}
            </StyledSubject>
            <StyledSubtitle dir="auto">{subtitle}</StyledSubtitle>
          </StyledHeading>
          <StyledHeaderActions>
            <StyledChipButton type="button" onClick={onMarkUnread}>
              {t`Mark unread`}
            </StyledChipButton>
            <StyledChipButton
              type="button"
              tone={isClosed ? undefined : 'accent'}
              disabled={isTogglingClosed}
              onClick={handleToggleClosed}
            >
              {isClosed ? <IconRestore size={15} /> : <IconCheck size={15} />}
              {isClosed ? t`Reopen` : t`Close`}
            </StyledChipButton>
            <TeamInboxMenu
              dropdownId={`team-inbox-thread-actions-${threadId}`}
              placement="bottom-end"
              items={[{ value: 'panel', label: t`Open in side panel` }]}
              onSelect={handleMoreAction}
              trigger={
                <StyledIconButton
                  type="button"
                  aria-label={t`More actions`}
                  title={t`More actions`}
                >
                  <IconDotsVertical size={16} />
                </StyledIconButton>
              }
            />
          </StyledHeaderActions>
        </StyledHeader>
        <StyledMessages>
          {threadLoading && messages.length === 0 ? (
            <EmailLoader loadingText={t`Loading thread`} />
          ) : (
            <>
              {hiddenMessageCount > 0 && (
                <StyledEarlierButton
                  type="button"
                  onClick={() => setIsShowingEarlier(true)}
                >
                  {plural(hiddenMessageCount, {
                    one: 'Show # earlier message',
                    other: 'Show # earlier messages',
                  })}
                </StyledEarlierButton>
              )}
              {visibleMessages.map((message) => (
                <TeamInboxMessageBubble
                  key={message.id}
                  message={message}
                  isOurs={isOwnMessage(message, ownHandles)}
                  onDraftClick={handleDraftClick}
                />
              ))}
              <CustomResolverFetchMoreLoader
                loading={threadLoading}
                onLastRowVisible={fetchMoreMessages}
              />
            </>
          )}
        </StyledMessages>
        {canReply && isDefined(openReplyMode) ? (
          <TeamInboxReplyComposer
            key={`${openDraftPrefill?.messageId ?? 'reply'}-${openReplyMode}`}
            replyContext={replyContext}
            replyMode={openReplyMode}
            draftPrefill={openDraftPrefill}
            fromHandle={fromHandle}
            recipientName={null}
            initialTemplateId={initialTemplateId}
            onClose={handleCloseComposer}
            onSent={handleSent}
          />
        ) : (
          canReply && (
            <StyledReplyBar>
              <StyledReplyPrompt
                type="button"
                onClick={() => setReplyMode('reply')}
              >
                {isNonEmptyString(contactName)
                  ? t`Reply to ${contactName}…`
                  : t`Reply…`}
              </StyledReplyPrompt>
              {canReplyAll && (
                <StyledChipButton
                  type="button"
                  onClick={() => setReplyMode('reply-all')}
                >
                  <IconArrowBackUpDouble size={15} />
                  {t`Reply all`}
                </StyledChipButton>
              )}
              <StyledReplyButton
                type="button"
                onClick={() => setReplyMode('reply')}
              >
                <IconArrowBackUp size={15} />
                {t`Reply`}
              </StyledReplyButton>
            </StyledReplyBar>
          )
        )}
      </StyledContainer>
      {isDefined(contact) && (
        <StyledContactColumn aria-label={t`Applicant`}>
          <TeamInboxContactPane
            personId={contact.personId}
            fallbackName={contact.displayName}
            fallbackEmail={contact.handle}
          />
        </StyledContactColumn>
      )}
    </>
  );
};
