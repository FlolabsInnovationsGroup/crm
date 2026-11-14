import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { useQuery } from '@apollo/client/react';
import { startOfDay } from 'date-fns';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { IconChevronDown, IconSearch } from 'twenty-ui/icon';
import { useDebounce } from 'use-debounce';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { useFormBuilderFocusHandlers } from '@/form-builder/hooks/useFormBuilderFocusHandlers';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { TeamInboxManualReviewCard } from '@/team-inbox/components/TeamInboxManualReviewCard';
import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import { TeamInboxThreadListItem } from '@/team-inbox/components/TeamInboxThreadListItem';
import { TeamInboxThreadPane } from '@/team-inbox/components/TeamInboxThreadPane';
import { GET_INBOX_MAILBOXES } from '@/team-inbox/graphql/getInboxMailboxes';
import { useInboxContactPeople } from '@/team-inbox/hooks/useInboxContactPeople';
import { useInboxEmailTemplates } from '@/team-inbox/hooks/useInboxEmailTemplates';
import { useInboxPeopleByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { useInboxThreadClosed } from '@/team-inbox/hooks/useInboxThreadClosed';
import { useManualReview } from '@/team-inbox/hooks/useManualReview';
import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { useTeamInboxThreads } from '@/team-inbox/hooks/useTeamInboxThreads';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { type TeamInboxDirection } from '@/team-inbox/types/TeamInboxFilter';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';
import { suggestInboxTemplate } from '@/team-inbox/utils/suggestInboxTemplate';

type TeamInboxTab = TeamInboxDirection | 'UNREAD' | 'CLOSED' | 'MANUAL_REVIEW';
type ReviewFilter = 'ALL' | 'QUESTION' | 'NOT_INTERESTED' | 'DONE_TODAY';

// oxlint-disable-next-line lingui/no-unlocalized-strings -- A filter id, not text.
const ALL_REVIEW_ITEMS: ReviewFilter = 'ALL';

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
  background: var(--fl-canvas);
  color: var(--fl-ink);
  container-name: team-inbox;
  container-type: inline-size;
  display: flex;
  font-size: 14px;
  height: 100%;
  min-height: 0;
`;

const StyledListColumn = styled.section<{ hasSelection: boolean }>`
  background: var(--fl-surface);
  box-shadow: 1px 0 0 var(--fl-line);
  display: flex;
  flex: 0 0 384px;
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
  gap: 14px;
  padding: 22px 20px 14px;
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
`;

const StyledTitle = styled.h1<{ size: number }>`
  color: var(--fl-ink);
  font-family: var(--fl-font-display);
  font-size: ${({ size }) => `${size}px`};
  font-weight: 800;
  margin: 0;
`;

const StyledChipButton = styled.button`
  align-items: center;
  background: var(--fl-chip);
  border: none;
  border-radius: 8px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  gap: 6px;
  max-width: 220px;
  padding: 7px 10px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StyledTab = styled.button<{
  isActive: boolean;
  tone: 'neutral' | 'review' | 'surface';
}>`
  background: ${({ isActive, tone }) =>
    isActive
      ? 'var(--fl-ink)'
      : tone === 'review'
        ? 'var(--fl-warn-soft)'
        : tone === 'surface'
          ? 'var(--fl-surface)'
          : 'var(--fl-chip)'};
  border: none;
  border-radius: 18px;
  color: ${({ isActive, tone }) =>
    isActive
      ? 'var(--fl-surface)'
      : tone === 'review'
        ? 'var(--fl-warn-ink)'
        : 'var(--fl-ink-soft)'};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: ${({ isActive, tone }) =>
    isActive || tone === 'review' ? 600 : 500};
  padding: 7px 12px;
  white-space: nowrap;
`;

const StyledSearch = styled.label`
  align-items: center;
  background: var(--fl-chip);
  border-radius: 9px;
  color: var(--fl-faint);
  display: flex;
  gap: 8px;
  height: 36px;
  padding: 0 10px;

  input {
    background: transparent;
    border: none;
    color: var(--fl-ink);
    flex: 1;
    font: inherit;
    font-size: 13px;
    min-width: 0;
    outline: none;
  }
`;

const StyledMetaRow = styled.div`
  align-items: center;
  color: var(--fl-faint);
  display: flex;
  font-size: 12px;
  justify-content: space-between;
`;

const StyledTextButton = styled.button`
  background: none;
  border: none;
  color: var(--fl-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 0;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  padding: 0 10px 10px;
`;

const StyledNoSelection = styled.p`
  color: var(--fl-muted);
  flex: 1;
  margin: auto;
  padding: 32px;
  text-align: center;

  @container team-inbox (max-width: 700px) {
    display: none;
  }
`;

const StyledEmpty = styled.p`
  color: var(--fl-muted);
  margin: 32px 0;
  text-align: center;
`;

const StyledReviewLayout = styled.main`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 36px;
`;

const StyledReviewHeader = styled.div`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
`;

const StyledReviewIntro = styled.div`
  flex: 1;
  min-width: 320px;
`;

const StyledBreadcrumb = styled.nav`
  align-items: center;
  display: flex;
  font-size: 13px;
  gap: 6px;
  margin-bottom: 10px;

  span {
    color: var(--fl-fainter);
  }

  strong {
    color: var(--fl-ink);
    font-weight: 500;
  }
`;

const StyledReviewDescription = styled.p`
  color: var(--fl-muted);
  line-height: 1.5;
  margin: 6px 0 0;
  max-width: 640px;
`;

const StyledCardGrid = styled.div`
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
`;

export const TeamInboxContent = () => {
  const apolloCoreClient = useApolloCoreClient();
  const focusHandlers = useFormBuilderFocusHandlers();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab = TABS.find((tab) => tab === tabParam) ?? TABS[0];
  const isManualReview = activeTab === 'MANUAL_REVIEW';
  const [reviewFilter, setReviewFilter] =
    useState<ReviewFilter>(ALL_REVIEW_ITEMS);
  const [doneSince] = useState(() => startOfDay(new Date()).toISOString());
  const [pendingTemplate, setPendingTemplate] = useState<{
    threadId: string;
    templateId: string;
  } | null>(null);
  const { unreadCount, markThreadRead, markThreadUnread, markAllRead } =
    useTeamInboxReadState();
  const {
    manualReviewCount,
    doneSinceCount,
    markDone,
    undoDone,
    findApplicantThreadId,
  } = useManualReview(doneSince);
  const { setThreadClosed } = useInboxThreadClosed();
  const [messageChannelId, setMessageChannelId] = useState(ALL_MAILBOXES);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm] = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const templates = useInboxEmailTemplates();

  const { data: mailboxData } = useQuery<{
    getInboxMailboxes: InboxMailbox[];
  }>(GET_INBOX_MAILBOXES, { client: apolloCoreClient });

  const isShowingDoneToday = isManualReview && reviewFilter === 'DONE_TODAY';

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
    manualReview: isManualReview,
    manualReviewDoneSince: isShowingDoneToday ? doneSince : null,
    messageChannelId:
      messageChannelId === ALL_MAILBOXES ? null : messageChannelId,
    searchTerm,
  });

  const mailboxes = mailboxData?.getInboxMailboxes ?? [];
  const ownHandles = mailboxes.map((mailbox) => mailbox.handle);

  const reviewItems = isManualReview
    ? threads.map((thread) => {
        const subject = parseManualReviewSubject(thread.subject);

        return {
          thread,
          subject,
          reply: parseManualReviewBody(thread.lastMessageBody).reply,
        };
      })
    : [];
  const questionCount = reviewItems.filter(
    ({ subject }) => subject.reason === 'question',
  ).length;
  const notInterestedCount = reviewItems.filter(
    ({ subject }) => subject.reason === 'not interested',
  ).length;
  const visibleReviewItems = reviewItems.filter(({ subject }) =>
    reviewFilter === 'QUESTION'
      ? subject.reason === 'question'
      : reviewFilter === 'NOT_INTERESTED'
        ? subject.reason === 'not interested'
        : true,
  );
  const peopleByEmail = useInboxPeopleByEmail(
    reviewItems.map(({ subject }) => subject.applicantEmail).filter(isDefined),
  );

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

  const handleTabChange = (tab: TeamInboxTab) => {
    setReviewFilter(ALL_REVIEW_ITEMS);
    updateParams({ tab, threadId: null });
  };

  const handleReplyToApplicant = async (
    applicantEmail: string,
    templateId: string | null,
  ) => {
    const threadId = await findApplicantThreadId(applicantEmail);

    if (!isDefined(threadId)) {
      return;
    }

    setPendingTemplate(isDefined(templateId) ? { threadId, templateId } : null);
    updateParams({ tab: TABS[0], threadId });
  };

  const tabs: {
    id: TeamInboxTab;
    label: string;
    tone: 'neutral' | 'review';
  }[] = [
    { id: 'ALL', label: t`All`, tone: 'neutral' },
    {
      id: 'UNREAD',
      label: unreadCount > 0 ? t`Unread · ${unreadCount}` : t`Unread`,
      tone: 'neutral',
    },
    { id: 'INCOMING', label: t`Received`, tone: 'neutral' },
    { id: 'OUTGOING', label: t`Sent`, tone: 'neutral' },
    { id: 'CLOSED', label: t`Closed`, tone: 'neutral' },
    {
      id: 'MANUAL_REVIEW',
      label:
        manualReviewCount > 0
          ? t`Needs review · ${manualReviewCount}`
          : t`Needs review`,
      tone: 'review',
    },
  ];

  // Reason counts come from the loaded cards, so they show only when every
  // open card is loaded.
  const areReasonCountsExact =
    !isShowingDoneToday && threads.length >= totalNumberOfThreads;

  const reviewFilters: { id: ReviewFilter; label: string }[] = [
    { id: ALL_REVIEW_ITEMS, label: t`All · ${manualReviewCount}` },
    {
      id: 'QUESTION',
      label: areReasonCountsExact
        ? t`Questions · ${questionCount}`
        : t`Questions`,
    },
    {
      id: 'NOT_INTERESTED',
      label: areReasonCountsExact
        ? t`Not interested · ${notInterestedCount}`
        : t`Not interested`,
    },
    { id: 'DONE_TODAY', label: t`Done today · ${doneSinceCount}` },
  ];

  const selectedMailbox = mailboxes.find(
    (mailbox) => mailbox.id === messageChannelId,
  );

  if (isManualReview) {
    return (
      <StyledContainer
        onFocusCapture={focusHandlers.onFocusCapture}
        onBlurCapture={focusHandlers.onBlurCapture}
      >
        <ToastOnQueryErrorEffect error={error} />
        <StyledReviewLayout>
          <StyledReviewHeader>
            <StyledReviewIntro>
              <StyledBreadcrumb aria-label={t`Breadcrumb`}>
                <StyledTextButton
                  type="button"
                  onClick={() => handleTabChange(TABS[0])}
                >
                  {t`Inbox`}
                </StyledTextButton>
                <span>/</span>
                <strong>{t`Needs review`}</strong>
              </StyledBreadcrumb>
              <StyledTitle size={28}>
                {manualReviewCount > 0
                  ? plural(manualReviewCount, {
                      one: '# reply needs a person',
                      other: '# replies need a person',
                    })
                  : t`Nothing needs a person`}
              </StyledTitle>
              <StyledReviewDescription>
                {t`The automation read these applicant replies and did not answer them. Reply, then mark each one done so the rest of the team skips it.`}
              </StyledReviewDescription>
            </StyledReviewIntro>
            <StyledTabs role="tablist">
              {reviewFilters.map((filter) => (
                <StyledTab
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={reviewFilter === filter.id}
                  isActive={reviewFilter === filter.id}
                  tone="surface"
                  onClick={() => setReviewFilter(filter.id)}
                >
                  {filter.label}
                </StyledTab>
              ))}
            </StyledTabs>
          </StyledReviewHeader>
          {isFirstLoad ? (
            <SkeletonLoader />
          ) : visibleReviewItems.length === 0 ? (
            <StyledEmpty>
              {isShowingDoneToday
                ? t`Nothing marked done today yet.`
                : t`Nothing needs a manual review.`}
            </StyledEmpty>
          ) : (
            <StyledCardGrid>
              {visibleReviewItems.map(({ thread, subject, reply }) => (
                <TeamInboxManualReviewCard
                  key={thread.id}
                  thread={thread}
                  person={
                    isDefined(subject.applicantEmail)
                      ? peopleByEmail.get(subject.applicantEmail.toLowerCase())
                      : undefined
                  }
                  suggestedTemplate={suggestInboxTemplate({
                    reason: subject.reason,
                    replyText: reply,
                    templates,
                  })}
                  isDone={isShowingDoneToday}
                  onReply={handleReplyToApplicant}
                  onToggleDone={async () => {
                    await (isShowingDoneToday
                      ? undoDone(thread.id)
                      : markDone(thread.id));
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
      </StyledContainer>
    );
  }

  return (
    <StyledContainer
      onFocusCapture={focusHandlers.onFocusCapture}
      onBlurCapture={focusHandlers.onBlurCapture}
    >
      <ToastOnQueryErrorEffect error={error} />
      <StyledListColumn
        hasSelection={isDefined(selectedThreadId)}
        aria-label={t`Conversations`}
      >
        <StyledListHeader>
          <StyledTitleRow>
            <StyledTitle size={24}>{t`Inbox`}</StyledTitle>
            {mailboxes.length > 1 && (
              <TeamInboxMenu
                dropdownId="team-inbox-mailbox"
                placement="bottom-end"
                selectedValue={messageChannelId}
                items={[
                  { value: ALL_MAILBOXES, label: t`All mailboxes` },
                  ...mailboxes.map((mailbox) => ({
                    value: mailbox.id,
                    label: mailbox.handle,
                  })),
                ]}
                onSelect={setMessageChannelId}
                trigger={
                  <StyledChipButton type="button" title={t`Mailbox`}>
                    <span>{selectedMailbox?.handle ?? t`All mailboxes`}</span>
                    <IconChevronDown size={12} />
                  </StyledChipButton>
                }
              />
            )}
          </StyledTitleRow>
          <StyledTabs role="tablist">
            {tabs.map((tab) => (
              <StyledTab
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                isActive={activeTab === tab.id}
                tone={tab.tone}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </StyledTab>
            ))}
          </StyledTabs>
          <StyledSearch>
            <IconSearch size={15} />
            <input
              type="search"
              value={searchInput}
              aria-label={t`Search emails`}
              placeholder={t`Search name, email or subject`}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </StyledSearch>
          <StyledMetaRow>
            <span>
              {!isFirstLoad &&
                plural(totalNumberOfThreads, {
                  one: '# conversation',
                  other: '# conversations',
                })}
            </span>
            <StyledTextButton
              type="button"
              disabled={unreadCount === 0}
              onClick={markAllRead}
            >
              {t`Mark all as read`}
            </StyledTextButton>
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
          mailboxes={mailboxes}
          isClosed={activeTab === 'CLOSED'}
          initialTemplateId={
            pendingTemplate?.threadId === selectedThreadId
              ? pendingTemplate.templateId
              : null
          }
          onInitialTemplateApplied={() => setPendingTemplate(null)}
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
    </StyledContainer>
  );
};
