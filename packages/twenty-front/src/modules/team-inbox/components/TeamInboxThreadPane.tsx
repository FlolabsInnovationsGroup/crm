import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
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
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledBackBar = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: none;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};

  @container team-inbox (max-width: 700px) {
    display: block;
  }
`;

const StyledContactColumn = styled.div`
  border-left: 1px solid ${themeCssVariables.border.color.light};
  flex: 0 0 300px;
  min-height: 0;
  overflow-y: auto;

  @container team-inbox (max-width: 1000px) {
    display: none;
  }
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledSubject = styled.h2`
  flex: 1;
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  min-width: 200px;
  overflow-wrap: anywhere;
`;

const StyledMessages = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const StyledReplyBar = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

type TeamInboxThreadPaneProps = {
  threadId: string;
  fallbackSubject: string;
  ownHandles: string[];
  isManualReview: boolean;
  onBack: () => void;
  onMarkUnread: () => void;
  onOpenApplicantThread: (applicantEmail: string) => void;
  onManualReviewDone: () => Promise<void>;
};

// Renders the conversation and, beside it, the contact it is with.
export const TeamInboxThreadPane = ({
  threadId,
  fallbackSubject,
  ownHandles,
  isManualReview,
  onBack,
  onMarkUnread,
  onOpenApplicantThread,
  onManualReviewDone,
}: TeamInboxThreadPaneProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { messages, fetchMoreMessages, threadLoading } =
    useEmailThread(threadId);
  const replyContext = useReplyContext(threadId);
  const [replyMode, setReplyMode] = useState<EmailReplyMode | null>(null);
  const [draftPrefill, setDraftPrefill] = useState<EmailDraftPrefill | null>(
    null,
  );
  const [isMarkingDone, setIsMarkingDone] = useState(false);

  const subject = messages[0]?.subject ?? fallbackSubject;
  const contact = getConversationContact(messages, ownHandles);

  const manualReview = isManualReview
    ? parseManualReviewSubject(subject)
    : null;
  const applicantEmail = manualReview?.applicantEmail ?? null;
  const title = isDefined(applicantEmail)
    ? `${applicantEmail} · ${manualReview?.originalSubject ?? ''}`
    : subject;

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

  const handleSent = async () => {
    handleCloseComposer();
    await apolloCoreClient.refetchQueries({
      include: ['FindManyMessages', 'GetInboxThreads', 'GetInboxUnreadCount'],
    });
  };

  const handleManualReviewDone = async () => {
    setIsMarkingDone(true);

    try {
      await onManualReviewDone();
    } finally {
      setIsMarkingDone(false);
    }
  };

  const canReply =
    isDefined(replyContext) &&
    replyContext.loading === false &&
    !isManualReview;
  const canReplyAll = canReply && isNonEmptyString(replyContext.replyAllCc);

  return (
    <>
      <StyledContainer>
        <StyledBackBar>
          <Button variant="ghost" size="sm" onClick={onBack}>
            {t`Back to list`}
          </Button>
        </StyledBackBar>
        <StyledHeader>
          <StyledSubject dir="auto">
            {isNonEmptyString(title) ? title : t`(no subject)`}
          </StyledSubject>
          {isDefined(applicantEmail) && (
            <Button
              variant="outline"
              size="sm"
              startIcon={<IconArrowBackUp />}
              onClick={() => onOpenApplicantThread(applicantEmail)}
            >{t`Reply to applicant`}</Button>
          )}
          {isManualReview && (
            <Button
              variant="soft"
              color="accent"
              size="sm"
              startIcon={<IconCheck />}
              loading={isMarkingDone}
              disabled={isMarkingDone}
              onClick={handleManualReviewDone}
            >{t`Done`}</Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            startIcon={<IconMail />}
            onClick={onMarkUnread}
          >{t`Mark as unread`}</Button>
          <Button
            variant="ghost"
            size="sm"
            startIcon={<IconLayoutSidebarRight />}
            onClick={() =>
              openRecordInSidePanel({
                recordId: threadId,
                objectNameSingular: CoreObjectNameSingular.MessageThread,
              })
            }
          >{t`Open in panel`}</Button>
        </StyledHeader>
        <StyledMessages>
          {threadLoading && messages.length === 0 ? (
            <EmailLoader loadingText={t`Loading thread`} />
          ) : (
            <>
              {firstMessages.map((message) => (
                <EmailThreadMessage
                  key={message.id}
                  message={message}
                  onDraftClick={handleDraftClick}
                />
              ))}
              <EmailThreadIntermediaryMessages
                messages={intermediaryMessages}
                onDraftClick={handleDraftClick}
              />
              {isDefined(lastMessage) && (
                <EmailThreadMessage
                  key={lastMessage.id}
                  message={lastMessage}
                  isExpanded
                  hideBottomBorder
                  onDraftClick={handleDraftClick}
                />
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
              <Button
                variant="outline"
                startIcon={<IconArrowBackUp />}
                onClick={() => setReplyMode('reply')}
              >{t`Reply`}</Button>
              {canReplyAll && (
                <Button
                  variant="outline"
                  startIcon={<IconArrowBackUpDouble />}
                  onClick={() => setReplyMode('reply-all')}
                >{t`Reply all`}</Button>
              )}
            </StyledReplyBar>
          )
        )}
      </StyledContainer>
      {!isManualReview && isDefined(contact) && (
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
