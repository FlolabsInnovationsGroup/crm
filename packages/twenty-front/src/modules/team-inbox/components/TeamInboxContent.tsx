import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Button, Input } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';
import { useDebounce } from 'use-debounce';

import { ActivityList } from '@/activities/components/ActivityList';
import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { EmailThreadPreview } from '@/activities/emails/components/EmailThreadPreview';
import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { useFormBuilderFocusHandlers } from '@/form-builder/hooks/useFormBuilderFocusHandlers';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_MAILBOXES } from '@/team-inbox/graphql/getInboxMailboxes';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { useTeamInboxThreads } from '@/team-inbox/hooks/useTeamInboxThreads';
import { type TeamInboxDirection } from '@/team-inbox/types/TeamInboxFilter';

type TeamInboxTab = TeamInboxDirection | 'UNREAD';

const SEARCH_DEBOUNCE_MS = 350;
const ALL_MAILBOXES = '';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const StyledToolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledTabs = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTab = styled.button<{ isActive: boolean }>`
  background: ${({ isActive }) =>
    isActive ? themeCssVariables.background.transparent.medium : 'none'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledMailbox = styled.div`
  width: 240px;
`;

const StyledSearch = styled.div`
  flex: 1;
  max-width: 320px;
  min-width: 180px;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
  margin-left: auto;
`;

const StyledList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: ${themeCssVariables.spacing[8]} 0;
  text-align: center;
`;

export const TeamInboxContent = () => {
  const apolloCoreClient = useApolloCoreClient();
  const focusHandlers = useFormBuilderFocusHandlers();
  const [activeTab, setActiveTab] = useState<TeamInboxTab>('ALL');
  const { unreadCount, markThreadRead, markThreadUnread, markAllRead } =
    useTeamInboxReadState();
  const [messageChannelId, setMessageChannelId] = useState(ALL_MAILBOXES);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm] = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

  const { data: mailboxData } = useQuery<{
    getInboxMailboxes: InboxMailbox[];
  }>(GET_INBOX_MAILBOXES, { client: apolloCoreClient });

  const {
    threads,
    totalNumberOfThreads,
    isFirstLoad,
    isFetchingMore,
    error,
    fetchMoreThreads,
  } = useTeamInboxThreads({
    direction: activeTab === 'UNREAD' ? 'ALL' : activeTab,
    unreadOnly: activeTab === 'UNREAD',
    messageChannelId:
      messageChannelId === ALL_MAILBOXES ? null : messageChannelId,
    searchTerm,
  });

  const tabs: { id: TeamInboxTab; label: string }[] = [
    { id: 'ALL', label: t`All` },
    {
      id: 'UNREAD',
      label: unreadCount > 0 ? t`Unread (${unreadCount})` : t`Unread`,
    },
    { id: 'INCOMING', label: t`Received` },
    { id: 'OUTGOING', label: t`Sent` },
  ];

  const mailboxes = mailboxData?.getInboxMailboxes ?? [];

  return (
    <StyledContainer
      onFocusCapture={focusHandlers.onFocusCapture}
      onBlurCapture={focusHandlers.onBlurCapture}
    >
      <ToastOnQueryErrorEffect error={error} />
      <StyledToolbar>
        <StyledTabs role="tablist">
          {tabs.map((tab) => (
            <StyledTab
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </StyledTab>
          ))}
        </StyledTabs>
        {mailboxes.length > 1 && (
          <StyledMailbox>
            <FormBuilderNativeSelect
              value={messageChannelId}
              ariaLabel={t`Mailbox`}
              options={[
                { value: ALL_MAILBOXES, label: t`All mailboxes` },
                ...mailboxes.map((mailbox) => ({
                  value: mailbox.id,
                  label: mailbox.handle,
                })),
              ]}
              onChange={setMessageChannelId}
            />
          </StyledMailbox>
        )}
        <StyledSearch>
          <Input
            value={searchInput}
            aria-label={t`Search emails`}
            placeholder={t`Search subject, name or email`}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </StyledSearch>
        {!isFirstLoad && (
          <StyledCount>{t`${totalNumberOfThreads} conversations`}</StyledCount>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={unreadCount === 0}
          onClick={markAllRead}
        >
          {t`Mark all as read`}
        </Button>
      </StyledToolbar>
      <StyledList>
        {isFirstLoad ? (
          <SkeletonLoader />
        ) : threads.length === 0 ? (
          <StyledEmpty>{t`No emails match these filters.`}</StyledEmpty>
        ) : (
          <ActivityList>
            {threads.map((thread) => (
              <EmailThreadPreview
                key={thread.id}
                thread={thread}
                divider
                onOpen={() => {
                  if (!thread.read) {
                    markThreadRead(thread.id);
                  }
                }}
                onToggleRead={() =>
                  thread.read
                    ? markThreadUnread(thread.id)
                    : markThreadRead(thread.id)
                }
              />
            ))}
            <CustomResolverFetchMoreLoader
              loading={isFetchingMore}
              onLastRowVisible={fetchMoreThreads}
            />
          </ActivityList>
        )}
      </StyledList>
    </StyledContainer>
  );
};
