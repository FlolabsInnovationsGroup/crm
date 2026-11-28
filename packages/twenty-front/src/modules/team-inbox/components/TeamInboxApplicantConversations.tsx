import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const CONVERSATION_LIMIT = 10;

const StyledList = styled.nav`
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px;
`;

const StyledLabel = styled.span`
  align-self: center;
  color: var(--fl-faint);
`;

const StyledConversation = styled.button<{ isActive: boolean }>`
  background: ${({ isActive }) =>
    isActive ? 'var(--fl-ink)' : 'var(--fl-chip)'};
  border: none;
  border-radius: 14px;
  color: ${({ isActive }) =>
    isActive ? 'var(--fl-surface)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  padding: 5px 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type TeamInboxApplicantConversationsProps = {
  applicantEmail: string;
  selectedThreadId: string;
  onSelect: (threadId: string) => void;
};

// The applicant's emails can sit in several threads (a reminder with a new
// subject starts one), and a thread shows only its own messages.
export const TeamInboxApplicantConversations = ({
  applicantEmail,
  selectedThreadId,
  onSelect,
}: TeamInboxApplicantConversationsProps) => {
  const apolloCoreClient = useApolloCoreClient();
  const { data } = useQuery<{
    getInboxThreads: { timelineThreads: InboxThread[] };
  }>(GET_INBOX_THREADS, {
    client: apolloCoreClient,
    variables: {
      page: 1,
      pageSize: CONVERSATION_LIMIT,
      searchTerm: applicantEmail,
    },
  });

  const conversations = data?.getInboxThreads.timelineThreads ?? [];

  if (conversations.length < 2) {
    return null;
  }

  return (
    <StyledList aria-label={t`Conversations with this applicant`}>
      <StyledLabel>{t`Their conversations:`}</StyledLabel>
      {conversations.map((conversation) => {
        const subject = isNonEmptyString(conversation.subject)
          ? conversation.subject
          : t`(no subject)`;
        const when = beautifyPastDateRelativeToNow(
          conversation.lastMessageReceivedAt,
        );

        return (
          <StyledConversation
            key={conversation.id}
            type="button"
            dir="auto"
            isActive={conversation.id === selectedThreadId}
            aria-current={conversation.id === selectedThreadId}
            title={t`${subject} · ${when}`}
            onClick={() => onSelect(conversation.id)}
          >
            {t`${subject} · ${when}`}
          </StyledConversation>
        );
      })}
    </StyledList>
  );
};
