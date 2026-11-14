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
  IconLayoutSidebarRight,
  IconMail,
  IconRestore,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { EmailLoader } from '@/activities/emails/components/EmailLoader';
import { EmailThreadMessage } from '@/activities/emails/components/EmailThreadMessage';
import { useEmailThread } from '@/activities/emails/hooks/useEmailThread';
import { useReplyContext } from '@/activities/emails/hooks/useReplyContext';
import { type EmailDraftPrefill } from '@/activities/emails/types/EmailDraftPrefill';
import { type EmailReplyMode } from '@/activities/emails/types/EmailReplyMode';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';
import { getEmailDraftPrefillFromMessage } from '@/activities/emails/utils/getEmailDraftPrefillFromMessage';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { EmailThreadIntermediaryMessages } from '@/page-layout/widgets/email-thread/components/EmailThreadIntermediaryMessages';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxContactPane } from '@/team-inbox/components/TeamInboxContactPane';
import { TeamInboxReplyComposer } from '@/team-inbox/components/TeamInboxReplyComposer';
import { getConversationContact } from '@/team-inbox/utils/getConversationContact';
import { formatToHumanReadableDate } from '~/utils/date-utils';

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  min-width: 0;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledBackBar = styled.div`
  display: none;

  @container team-inbox (max-width: 700px) {
    display: block;
  }
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.xl};
  box-shadow: ${themeCssVariables.boxShadow.light};
`;

const StyledHeader = styled(StyledCard)`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[5]};
`;

const StyledHeading = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
`;

const StyledSubject = styled.h2`
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  overflow-wrap: anywhere;
`;

const StyledSubtitle = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledMessages = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledBubble = styled.div<{ isOurs: boolean }>`
  align-self: ${({ isOurs }) => (isOurs ? 'flex-end' : 'flex-start')};
  background: ${({ isOurs }) =>
    isOurs
      ? themeCssVariables.tag.background.turquoise
      : themeCssVariables.background.primary};
  border-radius: ${({ isOurs }) =>
    isOurs ? '16px 16px 6px 16px' : '16px 16px 16px 6px'};
  box-shadow: ${({ isOurs }) =>
    isOurs ? 'none' : themeCssVariables.boxShadow.light};
  max-width: 85%;
  min-width: 0;
  overflow: hidden;
  width: fit-content;
`;

const StyledReplyBar = styled(StyledCard)`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledReplyPrompt = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: text;
  flex: 1;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]};
  text-align: start;
`;

const StyledContactColumn = styled.div`
  background: ${themeCssVariables.background.primary};
  box-shadow: -1px 0 0 ${themeCssVariables.border.color.light};
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
  isClosed: boolean;
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

// Renders the conversation and, beside it, the contact it is with.
export const TeamInboxThreadPane = ({
  threadId,
  fallbackSubject,
  ownHandles,
  isClosed,
  onToggleClosed,
  onBack,
  onMarkUnread,
}: TeamInboxThreadPaneProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { messages, fetchMoreMessages, threadLoading } =
    useEmailThread(threadId);
  const replyContext = useReplyContext(threadId);
  const [replyMode, setReplyMode] = useState<EmailReplyMode | null>(null);
  const [isTogglingClosed, setIsTogglingClosed] = useState(false);
  const [draftPrefill, setDraftPrefill] = useState<EmailDraftPrefill | null>(
    null,
  );

  const subject = messages[0]?.subject ?? fallbackSubject;
  const contact = getConversationContact(messages, ownHandles);
  const firstMessageAt = messages[0]?.receivedAt;

  const lastMessage = messages[messages.length - 1];
  const isLongThread = messages.length >= 5;
  const firstMessages = messages.slice(
    0,
    isLongThread ? 2 : messages.length - 1,
  );
  const intermediaryMessages = isLongThread
    ? messages.slice(2, messages.length - 1)
    : [];

  const trailingDraft = lastMessage?.isDraft === true ? lastMessage : null;
  const openReplyMode =
    replyMode ?? (isDefined(trailingDraft) ? 'reply' : null);
  const openDraftPrefill =
    draftPrefill ??
    (isDefined(trailingDraft)
      ? getEmailDraftPrefillFromMessage(trailingDraft)
      : null);

  const handleDraftClick = (message: EmailThreadMessageWithSender) => {
    setDraftPrefill(getEmailDraftPrefillFromMessage(message));
    setReplyMode('reply');
  };

  const handleCloseComposer = () => {
    setReplyMode(null);
    setDraftPrefill(null);
  };

  const handleToggleClosed = async () => {
    setIsTogglingClosed(true);

    try {
      await onToggleClosed();
    } finally {
      setIsTogglingClosed(false);
    }
  };

  const handleSent = async () => {
    handleCloseComposer();
    await apolloCoreClient.refetchQueries({
      include: ['FindManyMessages', 'GetInboxThreads', 'GetInboxUnreadCount'],
    });
  };

  const canReply = isDefined(replyContext) && replyContext.loading === false;
  const canReplyAll = canReply && isNonEmptyString(replyContext.replyAllCc);
  const contactName = contact?.displayName ?? '';

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
      <StyledContainer>
        <StyledBackBar>
          <Button variant="ghost" size="sm" onClick={onBack}>
            {t`Back to list`}
          </Button>
        </StyledBackBar>
        <StyledHeader>
          <StyledHeading>
            <StyledSubject dir="auto">
              {isNonEmptyString(subject) ? subject : t`(no subject)`}
            </StyledSubject>
            <StyledSubtitle dir="auto">{subtitle}</StyledSubtitle>
          </StyledHeading>
          <Button
            variant="soft"
            size="sm"
            startIcon={<IconMail />}
            onClick={onMarkUnread}
          >
            {t`Mark unread`}
          </Button>
          <Button
            variant="soft"
            size="sm"
            startIcon={<IconLayoutSidebarRight />}
            onClick={() =>
              openRecordInSidePanel({
                recordId: threadId,
                objectNameSingular: CoreObjectNameSingular.MessageThread,
              })
            }
          >
            {t`Open in panel`}
          </Button>
          <Button
            variant={isClosed ? 'soft' : 'solid'}
            color={isClosed ? 'neutral' : 'success'}
            size="sm"
            startIcon={isClosed ? <IconRestore /> : <IconCheck />}
            loading={isTogglingClosed}
            disabled={isTogglingClosed}
            onClick={handleToggleClosed}
          >
            {isClosed ? t`Reopen` : t`Close conversation`}
          </Button>
        </StyledHeader>
        <StyledMessages>
          {threadLoading && messages.length === 0 ? (
            <EmailLoader loadingText={t`Loading thread`} />
          ) : (
            <>
              {firstMessages.map((message) => (
                <StyledBubble
                  key={message.id}
                  isOurs={isOwnMessage(message, ownHandles)}
                >
                  <EmailThreadMessage
                    message={message}
                    hideBottomBorder
                    onDraftClick={handleDraftClick}
                  />
                </StyledBubble>
              ))}
              <EmailThreadIntermediaryMessages
                messages={intermediaryMessages}
                onDraftClick={handleDraftClick}
              />
              {isDefined(lastMessage) && (
                <StyledBubble isOurs={isOwnMessage(lastMessage, ownHandles)}>
                  <EmailThreadMessage
                    key={lastMessage.id}
                    message={lastMessage}
                    isExpanded
                    hideBottomBorder
                    onDraftClick={handleDraftClick}
                  />
                </StyledBubble>
              )}
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
                <Button
                  variant="soft"
                  size="sm"
                  startIcon={<IconArrowBackUpDouble />}
                  onClick={() => setReplyMode('reply-all')}
                >
                  {t`Reply all`}
                </Button>
              )}
              <Button
                variant="solid"
                color="accent"
                size="sm"
                startIcon={<IconArrowBackUp />}
                onClick={() => setReplyMode('reply')}
              >
                {t`Reply`}
              </Button>
            </StyledReplyBar>
          )
        )}
      </StyledContainer>
      {isDefined(contact) && (
        <StyledContactColumn>
          <TeamInboxContactPane
            personId={contact.personId}
            fallbackName={contact.displayName}
          />
        </StyledContactColumn>
      )}
    </>
  );
};
