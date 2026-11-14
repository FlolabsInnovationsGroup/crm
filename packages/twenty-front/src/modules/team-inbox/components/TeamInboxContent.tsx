import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
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
import { TeamInboxManualReviewCard } from '@/team-inbox/components/TeamInboxManualReviewCard';
import { TeamInboxThreadListItem } from '@/team-inbox/components/TeamInboxThreadListItem';
import { TeamInboxThreadPane } from '@/team-inbox/components/TeamInboxThreadPane';
import { useInboxContactPeople } from '@/team-inbox/hooks/useInboxContactPeople';
import { useInboxThreadClosed } from '@/team-inbox/hooks/useInboxThreadClosed';
import { useManualReview } from '@/team-inbox/hooks/useManualReview';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { useTeamInboxThreads } from '@/team-inbox/hooks/useTeamInboxThreads';
import { type TeamInboxDirection } from '@/team-inbox/types/TeamInboxFilter';

type TeamInboxTab = TeamInboxDirection | 'UNREAD' | 'CLOSED' | 'MANUAL_REVIEW';

const SEARCH_DEBOUNCE_MS = 350;
const SELECTED_THREAD_PARAM = 'thread';
const TAB_PARAM = 'tab';
const TABS: TeamInboxTab[] = [
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A tab id, not text.
  'ALL',
  'UNREAD',
  'INCOMING',
  'OUTGOING',
  'CLOSED',
  'MANUAL_REVIEW',
];
const ALL_MAILBOXES = '';

// List, conversation and contact side by side, like the HubSpot inbox the
// HR team came from. Breakpoints follow the inbox's own width, which shrinks
// when the side panel opens: first the contact goes, then one pane shows.
const StyledContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  container-name: team-inbox;
  container-type: inline-size;
  display: flex;
  height: 100%;
  min-height: 0;
`;

const StyledListColumn = styled.div<{ hasSelection: boolean }>`
  background: ${themeCssVariables.background.primary};
  box-shadow: 1px 0 0 ${themeCssVariables.border.color.light};
  display: flex;
  flex: 0 0 380px;
  flex-direction: column;
  min-height: 0;
  min-width: 0;

  @container team-inbox (max-width: 700px) {
    display: ${({ hasSelection }) => (hasSelection ? 'none' : 'flex')};
    flex: 1;
  }
`;

const StyledListHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[5]} ${themeCssVariables.spacing[4]}
    ${themeCssVariables.spacing[3]};
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
`;

const StyledTitle = styled.h1`
  font-size: ${themeCssVariables.font.size.xxl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTab = styled.button<{ isActive: boolean; isReview: boolean }>`
  background: ${({ isActive, isReview }) =>
    isActive
      ? themeCssVariables.background.invertedPrimary
      : isReview
        ? themeCssVariables.tag.background.orange
        : themeCssVariables.background.tertiary};
  border: none;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isActive, isReview }) =>
    isActive
      ? themeCssVariables.font.color.inverted
      : isReview
        ? themeCssVariables.tag.text.orange
        : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const StyledFilters = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledMetaRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-height: 0;
  overflow-y: auto;
  padding: 0 ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[2]};
`;

const StyledNoSelection = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 1;
  margin: auto;
  padding: ${themeCssVariables.spacing[8]};
  text-align: center;

  @container team-inbox (max-width: 700px) {
    display: none;
  }
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: ${themeCssVariables.spacing[8]} 0;
  text-align: center;
`;

const StyledReviewLayout = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledReviewIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledReviewDescription = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  line-height: 1.5;
  margin: 0;
  max-width: 640px;
`;

const StyledCardGrid = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
  const { setThreadClosed } = useInboxThreadClosed();
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
      activeTab === 'UNREAD' ||
      activeTab === 'CLOSED' ||
      activeTab === 'MANUAL_REVIEW'
        ? 'ALL'
        : activeTab,
    unreadOnly: activeTab === 'UNREAD',
    closedOnly: activeTab === 'CLOSED',
    manualReview: activeTab === 'MANUAL_REVIEW',
    messageChannelId:
      messageChannelId === ALL_MAILBOXES ? null : messageChannelId,
    searchTerm,
  });

  const tabs: { id: TeamInboxTab; label: string }[] = [
    { id: 'ALL', label: t`All` },
    {
      id: 'UNREAD',
      label: unreadCount > 0 ? t`Unread · ${unreadCount}` : t`Unread`,
    },
    { id: 'INCOMING', label: t`Received` },
    { id: 'OUTGOING', label: t`Sent` },
    { id: 'CLOSED', label: t`Closed` },
    {
      id: 'MANUAL_REVIEW',
      label:
        manualReviewCount > 0
          ? t`Needs review · ${manualReviewCount}`
          : t`Needs review`,
    },
  ];

  const mailboxes = mailboxData?.getInboxMailboxes ?? [];
  const ownHandles = mailboxes.map((mailbox) => mailbox.handle);
  const isManualReview = activeTab === 'MANUAL_REVIEW';

  const contactPeople = useInboxContactPeople(
    isManualReview
      ? []
      : threads.map((thread) => thread.contactPersonId).filter(isDefined),
  );

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

  // Like HubSpot, closing moves on to the next conversation in the list.
  const handleToggleClosed = async (threadId: string) => {
    const isClosing = activeTab !== 'CLOSED';
    const index = threads.findIndex((thread) => thread.id === threadId);
    const nextThreadId =
      index < 0
        ? null
        : (threads[index + 1]?.id ?? threads[index - 1]?.id ?? null);

    const isSaved = await setThreadClosed(threadId, isClosing);

    if (isSaved) {
      selectThread(nextThreadId);
    }
  };

  const handleTabChange = (tab: TeamInboxTab) =>
    updateParams({ tab, threadId: null });

  const handleOpenApplicantThread = async (applicantEmail: string) => {
    const threadId = await findApplicantThreadId(applicantEmail);

    if (isDefined(threadId)) {
      updateParams({ tab: TABS[0], threadId });
    }
  };

  const tabList = (
    <StyledTabs role="tablist">
      {tabs.map((tab) => (
        <StyledTab
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          isActive={activeTab === tab.id}
          isReview={tab.id === 'MANUAL_REVIEW'}
          onClick={() => handleTabChange(tab.id)}
        >
          {tab.label}
        </StyledTab>
      ))}
    </StyledTabs>
  );

  const filters = (
    <StyledFilters>
      {mailboxes.length > 1 && (
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
      )}
      <Input
        value={searchInput}
        aria-label={t`Search emails`}
        placeholder={t`Search name, email or subject`}
        onChange={(event) => setSearchInput(event.target.value)}
      />
    </StyledFilters>
  );

  return (
    <StyledContainer
      onFocusCapture={focusHandlers.onFocusCapture}
      onBlurCapture={focusHandlers.onBlurCapture}
    >
      <ToastOnQueryErrorEffect error={error} />
      {isManualReview ? (
        <StyledReviewLayout>
          <StyledReviewIntro>
            <StyledTitle>
              {manualReviewCount > 0
                ? plural(manualReviewCount, {
                    one: '# reply needs a person',
                    other: '# replies need a person',
                  })
                : t`Needs review`}
            </StyledTitle>
            <StyledReviewDescription>
              {t`The automation read these applicant replies and did not answer them. Reply, then mark each one done so the rest of the team skips it.`}
            </StyledReviewDescription>
          </StyledReviewIntro>
          {tabList}
          {isFirstLoad ? (
            <SkeletonLoader />
          ) : threads.length === 0 ? (
            <StyledEmpty>{t`Nothing needs a manual review.`}</StyledEmpty>
          ) : (
            <StyledCardGrid>
              {threads.map((thread) => (
                <TeamInboxManualReviewCard
                  key={thread.id}
                  thread={thread}
                  onReplyToApplicant={handleOpenApplicantThread}
                  onDone={async () => {
                    await markDone(thread.id);
                  }}
                />
              ))}
              <CustomResolverFetchMoreLoader
                loading={isFetchingMore}
                onLastRowVisible={fetchMoreThreads}
              />
            </StyledCardGrid>
          )}
        </StyledReviewLayout>
      ) : (
        <>
          <StyledListColumn hasSelection={isDefined(selectedThreadId)}>
            <StyledListHeader>
              <StyledTitleRow>
                <StyledTitle>{t`Inbox`}</StyledTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unreadCount === 0}
                  onClick={markAllRead}
                >
                  {t`Mark all as read`}
                </Button>
              </StyledTitleRow>
              {tabList}
              {filters}
              <StyledMetaRow>
                <StyledCount>
                  {!isFirstLoad &&
                    plural(totalNumberOfThreads, {
                      one: '# conversation',
                      other: '# conversations',
                    })}
                </StyledCount>
              </StyledMetaRow>
            </StyledListHeader>
            <StyledList>
              {isFirstLoad ? (
                <SkeletonLoader />
              ) : threads.length === 0 ? (
                <StyledEmpty>{t`No emails match these filters.`}</StyledEmpty>
              ) : (
                <>
                  {threads.map((thread) => (
                    <TeamInboxThreadListItem
                      key={thread.id}
                      thread={thread}
                      contactSummary={
                        isDefined(thread.contactPersonId)
                          ? contactPeople.get(thread.contactPersonId)
                          : undefined
                      }
                      isSelected={thread.id === selectedThreadId}
                      ownHandles={ownHandles}
                      onSelect={() =>
                        handleSelectThread(thread.id, thread.read)
                      }
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
              isClosed={activeTab === 'CLOSED'}
              onToggleClosed={() => handleToggleClosed(selectedThreadId)}
              onBack={() => selectThread(null)}
              onMarkUnread={() => {
                markThreadUnread(selectedThreadId);
                selectThread(null);
              }}
            />
          ) : (
            <StyledNoSelection>
              {t`Select a conversation to read it here.`}
            </StyledNoSelection>
          )}
        </>
      )}
    </StyledContainer>
  );
};
