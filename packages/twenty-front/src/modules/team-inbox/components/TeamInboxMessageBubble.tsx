import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import Linkify from 'linkify-react';
import { useState } from 'react';
import { isDefined, isFieldValueRestricted } from 'twenty-shared/utils';

import { EmailThreadNotShared } from '@/activities/emails/components/EmailThreadNotShared';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';
import { formatInboxMessageTime } from '@/team-inbox/utils/formatInboxMessageTime';
import { splitQuotedReply } from '@/team-inbox/utils/splitQuotedReply';
import { MessageChannelVisibility } from '~/generated/graphql';

const StyledBubble = styled.div<{ isOurs: boolean; isDraft: boolean }>`
  align-self: ${({ isOurs }) => (isOurs ? 'flex-end' : 'flex-start')};
  background: ${({ isOurs }) =>
    isOurs ? 'var(--fl-accent-soft)' : 'var(--fl-surface)'};
  border-radius: ${({ isOurs }) =>
    isOurs ? '16px 16px 6px 16px' : '16px 16px 16px 6px'};
  box-shadow: ${({ isOurs }) => (isOurs ? 'none' : 'var(--fl-shadow-card)')};
  color: ${({ isOurs }) => (isOurs ? 'var(--fl-ours-ink)' : 'var(--fl-ink)')};
  cursor: ${({ isDraft }) => (isDraft ? 'pointer' : 'default')};
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.55;
  max-width: 78%;
  min-width: 0;
  outline: ${({ isDraft }) =>
    isDraft ? '1.5px dashed var(--fl-fainter)' : 'none'};
  padding: 14px 16px;
`;

const StyledHeader = styled.div<{ isOurs: boolean }>`
  color: ${({ isOurs }) =>
    isOurs ? 'var(--fl-accent-ink)' : 'var(--fl-muted)'};
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const StyledBody = styled.div`
  overflow-wrap: anywhere;
  white-space: pre-line;

  a {
    color: inherit;
    text-decoration: underline;
  }
`;

const StyledQuoteToggle = styled.button`
  background: none;
  border: none;
  color: var(--fl-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
  padding: 0;
`;

const StyledQuoted = styled.div`
  border-inline-start: 2px solid var(--fl-line);
  color: var(--fl-muted);
  font-size: 13px;
  margin-top: 8px;
  overflow-wrap: anywhere;
  padding-inline-start: 10px;
  white-space: pre-line;
`;

type TeamInboxMessageBubbleProps = {
  message: EmailThreadMessageWithSender;
  isOurs: boolean;
  onDraftClick: (message: EmailThreadMessageWithSender) => void;
};

export const TeamInboxMessageBubble = ({
  message,
  isOurs,
  onDraftClick,
}: TeamInboxMessageBubbleProps) => {
  const [isQuoteVisible, setIsQuoteVisible] = useState(false);
  const isRestricted = isFieldValueRestricted(message.text);
  const { reply, quoted } = splitQuotedReply(message.text ?? '');

  const senderName = isNonEmptyString(message.sender?.displayName)
    ? message.sender.displayName
    : (message.sender?.handle ?? '');
  const header = [
    senderName,
    isDefined(message.receivedAt)
      ? formatInboxMessageTime(new Date(message.receivedAt))
      : null,
    message.isDraft ? t`Draft` : null,
  ]
    .filter(isNonEmptyString)
    .join(' · ');

  return (
    <StyledBubble
      isOurs={isOurs}
      isDraft={message.isDraft}
      role={message.isDraft ? 'button' : undefined}
      tabIndex={message.isDraft ? 0 : undefined}
      onClick={message.isDraft ? () => onDraftClick(message) : undefined}
      onKeyDown={(event) => {
        if (message.isDraft && event.key === 'Enter') {
          onDraftClick(message);
        }
      }}
    >
      <StyledHeader isOurs={isOurs} dir="auto">
        {header}
      </StyledHeader>
      {isRestricted ? (
        <EmailThreadNotShared visibility={MessageChannelVisibility.METADATA} />
      ) : (
        <>
          <StyledBody dir="auto">
            <Linkify options={{ target: '_blank', rel: 'noopener noreferrer' }}>
              {reply}
            </Linkify>
          </StyledBody>
          {isNonEmptyString(quoted) && (
            <>
              <StyledQuoteToggle
                type="button"
                aria-expanded={isQuoteVisible}
                onClick={() => setIsQuoteVisible(!isQuoteVisible)}
              >
                {isQuoteVisible ? t`Hide quoted text` : t`Show quoted text`}
              </StyledQuoteToggle>
              {isQuoteVisible && (
                <StyledQuoted dir="auto">
                  <Linkify
                    options={{ target: '_blank', rel: 'noopener noreferrer' }}
                  >
                    {quoted}
                  </Linkify>
                </StyledQuoted>
              )}
            </>
          )}
        </>
      )}
    </StyledBubble>
  );
};
