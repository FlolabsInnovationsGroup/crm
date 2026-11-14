import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { Button, Input } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';
import { useDebounce } from 'use-debounce';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { useFormBuilderFocusHandlers } from '@/form-builder/hooks/useFormBuilderFocusHandlers';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_MAILBOXES } from '@/team-inbox/graphql/getInboxMailboxes';
import { TeamInboxThreadListItem } from '@/team-inbox/components/TeamInboxThreadListItem';
import { TeamInboxThreadPane } from '@/team-inbox/components/TeamInboxThreadPane';
import { useManualReview } from '@/team-inbox/hooks/useManualReview';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { useTeamInboxThreads } from '@/team-inbox/hooks/useTeamInboxThreads';
import { type TeamInboxDirection } from '@/team-inbox/types/TeamInboxFilter';

type TeamInboxTab = TeamInboxDirection | 'UNREAD' | 'MANUAL_REVIEW';

const SEARCH_DEBOUNCE_MS = 350;
const SELECTED_THREAD_PARAM = 'thread';
const TAB_PARAM = 'tab';
const TABS: TeamInboxTab[] = [
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A tab id, not text.
  'ALL',
  'UNREAD',
  'INCOMING',
  'OUTGOING',
  'MANUAL_REVIEW',
];
const ALL_MAILBOXES = '';

// List, conversation and contact side by side, like the HubSpot inbox the
// HR team came from. Narrow screens drop the contact, then show one pane.
const StyledContainer = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
`;

const StyledListColumn = styled.div<{ hasSelection: boolean }>`
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex: 0 0 380px;
  flex-direction: column;
  min-height: 0;
  min-width: 0;

  @media (max-width: 900px) {
    border-right: none;
    display: ${({ hasSelection }) => (hasSelection ? 'none' : 'flex')};
    flex: 1;
  }
`;

const StyledToolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  width: 100%;
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
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledMailbox = styled.div`
  width: 100%;
`;

const StyledSearch = styled.div`
  width: 100%;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const StyledNoSelection = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 1;
  margin: auto;
  padding: ${themeCssVariables.spacing[8]};
  text-align: center;

  @media (max-width: 900px) {
    display: none;
  }
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: ${themeCssVariables.spacing[8]} 0;
  text-align: center;
`;

export const TeamInboxContent = () => {
  const apolloCoreClient = useApolloCoreClient();
  const focusHandlers = useFormBuilderFocusHandlers();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab = TABS.find((tab) => tab === tabParam) ?? TABS[0];
  const { unreadCount, markThreadRead, markThreadUnread, markAllRead } =
    useTeamInboxReadState();
  const { manualReviewCount, markDone, findApplicantThreadId } =
    useManualReview();
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
    direction:
      activeTab === 'UNREAD' || activeTab === 'MANUAL_REVIEW'
        ? 'ALL'
        : activeTab,
    unreadOnly: activeTab === 'UNREAD',
    manualReview: activeTab === 'MANUAL_REVIEW',
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
    {
      id: 'MANUAL_REVIEW',
      label:
        manualReviewCount > 0
          ? t`Manual review (${manualReviewCount})`
          : t`Manual review`,
    },
  ];

  const mailboxes = mailboxData?.getInboxMailboxes ?? [];
  const ownHandles = mailboxes.map((mailbox) => mailbox.handle);
  const isManualReview = activeTab === 'MANUAL_REVIEW';

  const selectedThreadId = searchParams.get(SELECTED_THREAD_PARAM);
  const selectedThread = threads.find(
    (thread) => thread.id === selectedThreadId,
  );

  const updateParams = (params: {
    tab?: TeamInboxTab;
    threadId: string | null;
  }) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (isDefined(params.tab)) {
          next.set(TAB_PARAM, params.tab);
        }

        if (isDefined(params.threadId)) {
          next.set(SELECTED_THREAD_PARAM, params.threadId);
        } else {
          next.delete(SELECTED_THREAD_PARAM);
        }

        return next;
      },
      { replace: true },
    );

  const selectThread = (threadId: string | null) => updateParams({ threadId });

  const handleSelectThread = (threadId: string, isRead: boolean) => {
    selectThread(threadId);

    if (!isRead) {
      markThreadRead(threadId);
    }
  };

  const handleTabChange = (tab: TeamInboxTab) =>
    updateParams({ tab, threadId: null });

  const handleManualReviewDone = async (threadId: string) => {
    const index = threads.findIndex((thread) => thread.id === threadId);
    const nextThread = index >= 0 ? threads[index + 1] : undefined;

    if (await markDone(threadId)) {
      selectThread(nextThread?.id ?? null);
    }
  };

  const handleOpenApplicantThread = async (applicantEmail: string) => {
    const threadId = await findApplicantThreadId(applicantEmail);

    if (isDefined(threadId)) {
      updateParams({ tab: TABS[0], threadId });
    }
  };

  return (
    <StyledContainer
      onFocusCapture={focusHandlers.onFocusCapture}
      onBlurCapture={focusHandlers.onBlurCapture}
    >
      <ToastOnQueryErrorEffect error={error} />
      <StyledListColumn hasSelection={isDefined(selectedThreadId)}>
        <StyledToolbar>
          <StyledTabs role="tablist">
            {tabs.map((tab) => (
              <StyledTab
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                isActive={activeTab === tab.id}
                onClick={() => handleTabChange(tab.id)}
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
          <StyledCount>
            {!isFirstLoad && t`${totalNumberOfThreads} conversations`}
          </StyledCount>
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
            <StyledEmpty>
              {isManualReview
                ? t`Nothing needs a manual review.`
                : t`No emails match these filters.`}
            </StyledEmpty>
          ) : (
            <>
              {threads.map((thread) => (
                <TeamInboxThreadListItem
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === selectedThreadId}
                  isManualReview={isManualReview}
                  ownHandles={ownHandles}
                  onSelect={() => handleSelectThread(thread.id, thread.read)}
                />
              ))}
              <CustomResolverFetchMoreLoader
                loading={isFetchingMore}
                onLastRowVisible={fetchMoreThreads}
              />
            </>
          )}
        </StyledList>
      </StyledListColumn>
      {isDefined(selectedThreadId) ? (
        <TeamInboxThreadPane
          key={selectedThreadId}
          threadId={selectedThreadId}
          fallbackSubject={selectedThread?.subject ?? ''}
          ownHandles={ownHandles}
          isManualReview={isManualReview}
          onBack={() => selectThread(null)}
          onMarkUnread={() => {
            markThreadUnread(selectedThreadId);
            selectThread(null);
          }}
          onOpenApplicantThread={handleOpenApplicantThread}
          onManualReviewDone={() => handleManualReviewDone(selectedThreadId)}
        />
      ) : (
        <StyledNoSelection>
          {t`Select a conversation to read it here.`}
        </StyledNoSelection>
      )}
    </StyledContainer>
  );
};
