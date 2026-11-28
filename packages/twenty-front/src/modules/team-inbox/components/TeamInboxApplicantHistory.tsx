import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { Fragment, useState } from 'react';

import { EmailLoader } from '@/activities/emails/components/EmailLoader';
import { TeamInboxMessageBubble } from '@/team-inbox/components/TeamInboxMessageBubble';
import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { buildApplicantHistoryEntries } from '@/team-inbox/utils/buildApplicantHistoryEntries';
import { getFoldedMessages } from '@/team-inbox/utils/getFoldedMessages';

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

const StyledNotice = styled.p`
  align-self: center;
  color: var(--fl-faint);
  flex-shrink: 0;
  font-size: 12px;
  margin: 0;
`;

const StyledThreadLabel = styled.p`
  align-self: center;
  color: var(--fl-muted);
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  margin: 4px 0 0;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type TeamInboxApplicantHistoryProps = {
  messages: ApplicantEmailHistoryMessage[];
  isTruncated: boolean;
  isLoading: boolean;
  hasFailed: boolean;
};

const ignoreDraftClick = () => undefined;

export const TeamInboxApplicantHistory = ({
  messages,
  isTruncated,
  isLoading,
  hasFailed,
}: TeamInboxApplicantHistoryProps) => {
  const [isShowingEarlier, setIsShowingEarlier] = useState(false);

  if (isLoading) {
    return <EmailLoader loadingText={t`Loading all emails`} />;
  }

  if (hasFailed) {
    return <StyledNotice>{t`Could not load all emails.`}</StyledNotice>;
  }

  if (messages.length === 0) {
    return <StyledNotice>{t`No emails with this applicant.`}</StyledNotice>;
  }

  const { hiddenCount, visibleMessages } = getFoldedMessages(
    messages,
    isShowingEarlier,
  );

  return (
    <>
      {isTruncated && (
        <StyledNotice>{t`Showing the latest ${messages.length} emails`}</StyledNotice>
      )}
      {hiddenCount > 0 && (
        <StyledEarlierButton
          type="button"
          onClick={() => setIsShowingEarlier(true)}
        >
          {plural(hiddenCount, {
            one: 'Show # earlier message',
            other: 'Show # earlier messages',
          })}
        </StyledEarlierButton>
      )}
      {buildApplicantHistoryEntries(visibleMessages).map(
        ({ message, threadSubject }) => {
          const subject = isNonEmptyString(threadSubject)
            ? threadSubject
            : t`(no subject)`;

          return (
            <Fragment key={message.id}>
              {threadSubject !== null && (
                <StyledThreadLabel dir="auto" title={subject}>
                  {t`Thread: ${subject}`}
                </StyledThreadLabel>
              )}
              <TeamInboxMessageBubble
                message={{
                  text: message.text ?? '',
                  receivedAt: message.receivedAt,
                  isDraft: false,
                  sender: message.sender,
                }}
                isOurs={message.direction === 'OUTGOING'}
                onDraftClick={ignoreDraftClick}
              />
            </Fragment>
          );
        },
      )}
    </>
  );
};
