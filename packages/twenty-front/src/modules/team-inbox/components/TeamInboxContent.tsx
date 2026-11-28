import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconChevronDown, IconSearch } from 'twenty-ui/icon';
import { useDebounce } from 'use-debounce';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { useFormBuilderFocusHandlers } from '@/form-builder/hooks/useFormBuilderFocusHandlers';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { TeamInboxApplicantConversations } from '@/team-inbox/components/TeamInboxApplicantConversations';
import { TeamInboxManualReviewCard } from '@/team-inbox/components/TeamInboxManualReviewCard';
import { TeamInboxManualReviewRow } from '@/team-inbox/components/TeamInboxManualReviewRow';
import { TeamInboxManualReviewToolbar } from '@/team-inbox/components/TeamInboxManualReviewToolbar';
import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import { TeamInboxReviewHistoryBar } from '@/team-inbox/components/TeamInboxReviewHistoryBar';
import { TeamInboxThreadListItem } from '@/team-inbox/components/TeamInboxThreadListItem';
import { TeamInboxThreadPane } from '@/team-inbox/components/TeamInboxThreadPane';
import { TeamInboxThreadPaneReviewBar } from '@/team-inbox/components/TeamInboxThreadPaneReviewBar';
import { MANUAL_REVIEW_FILTERS } from '@/team-inbox/constants/ManualReviewFilters';
import { MANUAL_REVIEW_SORT_DIRECTIONS } from '@/team-inbox/constants/ManualReviewSortDirections';
import { MANUAL_REVIEW_SORT_STORAGE_KEY } from '@/team-inbox/constants/ManualReviewSortStorageKey';
import { MANUAL_REVIEW_VIEW_MODE_STORAGE_KEY } from '@/team-inbox/constants/ManualReviewViewModeStorageKey';
import { MANUAL_REVIEW_VIEW_MODES } from '@/team-inbox/constants/ManualReviewViewModes';
import { GET_INBOX_MAILBOXES } from '@/team-inbox/graphql/getInboxMailboxes';
import { useInboxContactPeople } from '@/team-inbox/hooks/useInboxContactPeople';
import { useInboxEmailTemplates } from '@/team-inbox/hooks/useInboxEmailTemplates';
import { useInboxPeopleByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { useInboxThreadClosed } from '@/team-inbox/hooks/useInboxThreadClosed';
import { useManualReview } from '@/team-inbox/hooks/useManualReview';
import { useManualReviewCards } from '@/team-inbox/hooks/useManualReviewCards';
import { useManualReviewHistoryExport } from '@/team-inbox/hooks/useManualReviewHistoryExport';
import { useManualReviewScrollPosition } from '@/team-inbox/hooks/useManualReviewScrollPosition';
import { useManualReviewThreads } from '@/team-inbox/hooks/useManualReviewThreads';
import { useRecordManualReviewAnswer } from '@/team-inbox/hooks/useRecordManualReviewAnswer';
import { useTeamInboxPreference } from '@/team-inbox/hooks/useTeamInboxPreference';
import { useTeamInboxReadState } from '@/team-inbox/hooks/useTeamInboxReadState';
import { useTeamInboxThreads } from '@/team-inbox/hooks/useTeamInboxThreads';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { type ManualReviewFilter } from '@/team-inbox/types/ManualReviewFilter';
import { type ManualReviewGroup } from '@/team-inbox/types/ManualReviewGroup';
import { type ManualReviewHistoryPeriod } from '@/team-inbox/types/ManualReviewHistoryPeriod';
import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';
import { type ManualReviewViewMode } from '@/team-inbox/types/ManualReviewViewMode';
import { type TeamInboxDirection } from '@/team-inbox/types/TeamInboxFilter';
import { type TeamInboxSentReply } from '@/team-inbox/types/TeamInboxSentReply';
import {
  buildManualReviewAnswerContext,
  type ManualReviewAnswerContext,
} from '@/team-inbox/utils/buildManualReviewAnswerContext';
import { buildManualReviewGroups } from '@/team-inbox/utils/buildManualReviewGroups';
import { getManualReviewHistorySince } from '@/team-inbox/utils/getManualReviewHistorySince';
import { getReviewCardDoneThreadIds } from '@/team-inbox/utils/getReviewCardDoneThreadIds';
import {
  isTeamInboxApproval,
  isTeamInboxAutomationIssue,
  isTeamInboxQuestion,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { sortByLastMessage } from '@/team-inbox/utils/sortByLastMessage';
import { suggestInboxTemplate } from '@/team-inbox/utils/suggestInboxTemplate';

type TeamInboxTab =
  | TeamInboxDirection
  | 'UNREAD'
  | 'CLOSED'
  | 'SYSTEM'
  | 'MANUAL_REVIEW';

const isNotInterested = (item: TeamInboxReviewItem) =>
  item.triage?.reason === 'not interested';

const REVIEW_FILTER_MATCHERS: Partial<
  Record<ManualReviewFilter, (item: TeamInboxReviewItem) => boolean>
> = {
  QUESTION: isTeamInboxQuestion,
  NOT_INTERESTED: isNotInterested,
  APPROVAL: isTeamInboxApproval,
  AUTOMATION: isTeamInboxAutomationIssue,
};

// oxlint-disable-next-line lingui/no-unlocalized-strings -- A filter id, not text.
const ALL_REVIEW_ITEMS: ManualReviewFilter = 'ALL';

const SEARCH_DEBOUNCE_MS = 350;

// oxlint-disable-next-line lingui/no-unlocalized-strings -- An object name, not text.
const MANUAL_REVIEW_ANSWERS_OBJECT = 'manualReviewAnswers';
const SELECTED_THREAD_PARAM = 'thread';
const TAB_PARAM = 'tab';
// In the URL so browser back returns to the same Needs review section.
const REVIEW_FILTER_PARAM = 'filter';
// The card a conversation was opened from, for its Done and way back.
const REVIEW_CARD_PARAM = 'reviewCard';
const TABS: TeamInboxTab[] = [
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A tab id, not text.
  'ALL',
  'UNREAD',
  'INCOMING',
  'OUTGOING',
  'CLOSED',
  'SYSTEM',
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

const StyledAnswersLink = styled(Link)`
  color: var(--fl-accent-ink);
  display: inline-block;
  font-size: 13px;
  margin-top: 8px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
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
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
`;

const StyledRowList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const TeamInboxContent = () => {
  const apolloCoreClient = useApolloCoreClient();
  const focusHandlers = useFormBuilderFocusHandlers();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab = TABS.find((tab) => tab === tabParam) ?? TABS[0];
  const isManualReview = activeTab === 'MANUAL_REVIEW';
  const isSystem = activeTab === 'SYSTEM';
  const reviewFilterParam = searchParams.get(REVIEW_FILTER_PARAM);
  const reviewFilter =
    MANUAL_REVIEW_FILTERS.find((filter) => filter === reviewFilterParam) ??
    ALL_REVIEW_ITEMS;
  const reviewCardId = searchParams.get(REVIEW_CARD_PARAM);
  const [sortDirection, setSortDirection] = useTeamInboxPreference(
    MANUAL_REVIEW_SORT_STORAGE_KEY,
    MANUAL_REVIEW_SORT_DIRECTIONS,
    'NEWEST_FIRST',
  );
  const [viewMode, setViewMode] = useTeamInboxPreference(
    MANUAL_REVIEW_VIEW_MODE_STORAGE_KEY,
    MANUAL_REVIEW_VIEW_MODES,
    'CARDS',
  );
  const [historyPeriod, setHistoryPeriod] =
    useState<ManualReviewHistoryPeriod>('TODAY');
  const doneSince = getManualReviewHistorySince(historyPeriod, new Date());
  const [pendingTemplate, setPendingTemplate] = useState<{
    threadId: string;
    templateId: string;
  } | null>(null);
  // A reply started from a Needs review card closes that card when it is sent.
  const [pendingReview, setPendingReview] = useState<{
    applicantThreadId: string;
    context: ManualReviewAnswerContext;
  } | null>(null);
  const [markAllProgress, setMarkAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const { recordFromReply, recordFromDone } = useRecordManualReviewAnswer();
  const { enqueueToast } = useToast();
  const { unreadCount, markThreadRead, markThreadUnread, markAllRead } =
    useTeamInboxReadState();
  const {
    manualReviewCount,
    doneSinceCount,
    markDone,
    setDoneWithoutListRefetch,
    refetchManualReviewCounts,
    findApplicantThreadId,
  } = useManualReview(doneSince);
  const { setThreadClosed } = useInboxThreadClosed();
  const [messageChannelId, setMessageChannelId] = useState(ALL_MAILBOXES);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm] = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const templates = useInboxEmailTemplates();
  const { exportHistory, isExporting } =
    useManualReviewHistoryExport(templates);

  const { data: mailboxData } = useQuery<{
    getInboxMailboxes: InboxMailbox[];
  }>(GET_INBOX_MAILBOXES, { client: apolloCoreClient });

  const isShowingDone = isManualReview && reviewFilter === 'DONE';

  const {
    threads,
    totalNumberOfThreads,
    isFirstLoad,
    isFetchingMore,
    error,
    fetchMoreThreads,
  } = useTeamInboxThreads(
    {
      direction:
        activeTab === 'UNREAD' ||
        activeTab === 'CLOSED' ||
        activeTab === 'SYSTEM' ||
        activeTab === 'MANUAL_REVIEW'
          ? 'ALL'
          : activeTab,
      unreadOnly: activeTab === 'UNREAD',
      closedOnly: activeTab === 'CLOSED',
      manualReview: isManualReview,
      system: isSystem,
      manualReviewDoneSince: isShowingDone ? doneSince : null,
      messageChannelId:
        messageChannelId === ALL_MAILBOXES ? null : messageChannelId,
      searchTerm,
    },
    // Needs review loads every page itself, below.
    { skip: isManualReview },
  );

  const mailboxes = mailboxData?.getInboxMailboxes ?? [];
  const ownHandles = mailboxes.map((mailbox) => mailbox.handle);

  const openCards = useManualReviewCards({
    sortDirection,
    skip: !isManualReview && !isDefined(reviewCardId),
  });
  const doneThreads = useManualReviewThreads({
    doneSince,
    sortDirection,
    skip: !isShowingDone,
  });
  const doneGroups = isShowingDone
    ? buildManualReviewGroups(doneThreads.threads)
    : [];

  // A card counts for a filter when any item folded into it does.
  const groupMatches = (
    group: ManualReviewGroup,
    matches: (item: TeamInboxReviewItem) => boolean,
  ) => [group, ...group.earlier].some(({ item }) => matches(item));
  const countReviewItems = (matches: (item: TeamInboxReviewItem) => boolean) =>
    openCards.toHandle.filter((group) => groupMatches(group, matches)).length;
  const activeReviewMatcher = REVIEW_FILTER_MATCHERS[reviewFilter];
  const visibleReviewGroups = sortByLastMessage(
    isShowingDone
      ? doneGroups
      : reviewFilter === 'EMAILED_SINCE'
        ? openCards.emailedSince
        : isDefined(activeReviewMatcher)
          ? openCards.toHandle.filter((group) =>
              groupMatches(group, activeReviewMatcher),
            )
          : openCards.toHandle,
    sortDirection,
  );
  const visibleReviewList = isShowingDone ? doneThreads : openCards;
  const isReviewListLoading =
    visibleReviewList.isFirstLoad ||
    (!isShowingDone && !openCards.isSplitReady);

  const { containerRef, handleScroll, scrollToStart, scrollToEnd } =
    useManualReviewScrollPosition({
      viewKey: `${reviewFilter}:${sortDirection}:${viewMode}`,
      renderedCardIds: isReviewListLoading
        ? []
        : visibleReviewGroups.map(({ thread }) => thread.id),
      canSave: visibleReviewList.isComplete,
    });

  const peopleByEmail = useInboxPeopleByEmail(
    isManualReview
      ? [...openCards.groups, ...doneGroups]
          .flatMap((group) => [group, ...group.earlier])
          .map(({ item }) => item.applicantEmail)
          .filter(isDefined)
      : [],
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
  const reviewCardGroup = isDefined(reviewCardId)
    ? openCards.groups.find((group) =>
        [group, ...group.earlier].some(
          ({ thread }) => thread.id === reviewCardId,
        ),
      )
    : undefined;

  const updateParams = ({
    tab,
    threadId,
    reviewCardId: nextReviewCardId = null,
    reviewFilter: nextReviewFilter,
    replace = true,
  }: {
    tab?: TeamInboxTab;
    threadId: string | null;
    reviewCardId?: string | null;
    reviewFilter?: ManualReviewFilter;
    replace?: boolean;
  }) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (isDefined(tab)) {
          next.set(TAB_PARAM, tab);
        }

        if (isDefined(threadId)) {
          next.set(SELECTED_THREAD_PARAM, threadId);
        } else {
          next.delete(SELECTED_THREAD_PARAM);
        }

        if (isDefined(nextReviewCardId)) {
          next.set(REVIEW_CARD_PARAM, nextReviewCardId);
        } else {
          next.delete(REVIEW_CARD_PARAM);
        }

        if (nextReviewFilter === ALL_REVIEW_ITEMS) {
          next.delete(REVIEW_FILTER_PARAM);
        } else if (isDefined(nextReviewFilter)) {
          next.set(REVIEW_FILTER_PARAM, nextReviewFilter);
        }

        return next;
      },
      { replace },
    );

  const selectThread = (threadId: string | null) => updateParams({ threadId });

  const handleSelectThread = (threadId: string, isRead: boolean) => {
    // A card's reply only counts in the conversation it was opened for.
    if (pendingReview?.applicantThreadId !== threadId) {
      setPendingReview(null);
    }

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
    setPendingReview(null);
    updateParams({ tab, threadId: null, reviewFilter: ALL_REVIEW_ITEMS });
  };

  // A section opens at its top unless it has a saved position to restore.
  const handleReviewFilterChange = (filter: ManualReviewFilter) => {
    scrollToStart();
    updateParams({ threadId: null, reviewFilter: filter });
  };

  const handleSortDirectionChange = (
    nextSortDirection: ManualReviewSortDirection,
  ) => {
    scrollToStart();
    setSortDirection(nextSortDirection);
  };

  const handleViewModeChange = (nextViewMode: ManualReviewViewMode) => {
    scrollToStart();
    setViewMode(nextViewMode);
  };

  // The filter stays in the URL, so this lands on the section it came from.
  const handleBackToReview = () => {
    setPendingReview(null);
    updateParams({ tab: 'MANUAL_REVIEW', threadId: null });
  };

  const handleReplyToApplicant = async (
    group: ManualReviewGroup,
    context: ManualReviewAnswerContext,
    templateId: string | null,
  ) => {
    setPendingReview(null);

    const threadId = await findApplicantThreadId(context.applicantEmail);

    if (!isDefined(threadId)) {
      return;
    }

    setPendingTemplate(isDefined(templateId) ? { threadId, templateId } : null);
    setPendingReview({ applicantThreadId: threadId, context });
    // Pushed, so browser back returns to the card.
    updateParams({
      tab: TABS[0],
      threadId,
      reviewCardId: group.thread.id,
      replace: false,
    });
  };

  // Only the applicant's own emails close; an approval in the same card still
  // needs its button.
  const handleReviewReplySent = async (reply: TeamInboxSentReply) => {
    if (
      !isDefined(pendingReview) ||
      pendingReview.applicantThreadId !== selectedThreadId
    ) {
      return;
    }

    const { context } = pendingReview;

    setPendingReview(null);

    for (const threadId of context.applicantMessageThreadIds) {
      if (!(await markDone(threadId))) {
        return;
      }
    }

    openCards.removeThreads(context.applicantMessageThreadIds);

    await recordFromReply(
      context,
      reply.text,
      templates.find(({ id }) => id === reply.templateId)?.name ?? null,
    );
  };

  // The same for a card's Done, a list row, the thread pane and Mark all.
  // A card saved only in part still records its answer: the row is keyed by
  // review thread, so its next Done updates the same row.
  const setGroupDone = async (group: ManualReviewGroup, isUndo: boolean) => {
    const threadIds = getReviewCardDoneThreadIds(group, isUndo);
    const { savedThreadIds, isComplete } = await setDoneWithoutListRefetch(
      threadIds,
      !isUndo,
    );

    if (savedThreadIds.length === 0) {
      return false;
    }

    (isUndo ? doneThreads : openCards).removeThreads(savedThreadIds);

    const answerContext = buildManualReviewAnswerContext([
      group,
      ...group.earlier,
    ]);

    if (!isUndo && isDefined(answerContext)) {
      await recordFromDone(answerContext);
    }

    return isComplete;
  };

  const refreshAfterDone = async () => {
    await refetchManualReviewCounts();
    openCards.reload();

    if (isShowingDone) {
      doneThreads.reload();
    }
  };

  const handleToggleGroupDone = async (group: ManualReviewGroup) => {
    await setGroupDone(group, isShowingDone);
    await refreshAfterDone();
  };

  const handlePaneReviewDone = isDefined(reviewCardGroup)
    ? async () => {
        const isSaved = await setGroupDone(reviewCardGroup, false);

        if (isSaved) {
          handleBackToReview();
        }

        await refreshAfterDone();
      }
    : null;

  const handleMarkAllEmailedSinceDone = async () => {
    const groups = sortByLastMessage(openCards.emailedSince, sortDirection);
    const cardTotal = groups.length;
    let markedCount = 0;

    setMarkAllProgress({ done: 0, total: cardTotal });

    try {
      for (const group of groups) {
        if (!(await setGroupDone(group, false))) {
          break;
        }

        markedCount += 1;
        setMarkAllProgress({ done: markedCount, total: cardTotal });
      }
    } finally {
      setMarkAllProgress(null);
      enqueueToast({
        status: markedCount === cardTotal ? 'success' : 'error',
        children: t`Marked ${markedCount} of ${cardTotal} as done`,
      });
      await refreshAfterDone();
    }
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
    { id: 'SYSTEM', label: t`System`, tone: 'neutral' },
    {
      id: 'MANUAL_REVIEW',
      label:
        manualReviewCount > 0
          ? t`Needs review · ${manualReviewCount}`
          : t`Needs review`,
      tone: 'review',
    },
  ];

  // Counts are of cards (one per applicant), so they show once every open
  // review email is loaded and checked for emails sent since.
  const areReviewCountsExact = openCards.isComplete && openCards.isSplitReady;

  const toHandleCount = openCards.toHandle.length;
  const emailedSinceCount = openCards.emailedSince.length;
  const questionCount = countReviewItems(isTeamInboxQuestion);
  const notInterestedCount = countReviewItems(isNotInterested);
  const approvalCount = countReviewItems(isTeamInboxApproval);
  const automationCount = countReviewItems(isTeamInboxAutomationIssue);

  const reviewFilters: { id: ManualReviewFilter; label: string }[] = [
    {
      id: ALL_REVIEW_ITEMS,
      label: areReviewCountsExact ? t`All · ${toHandleCount}` : t`All`,
    },
    {
      id: 'QUESTION',
      label: areReviewCountsExact
        ? t`Questions · ${questionCount}`
        : t`Questions`,
    },
    {
      id: 'NOT_INTERESTED',
      label: areReviewCountsExact
        ? t`Not interested · ${notInterestedCount}`
        : t`Not interested`,
    },
    {
      id: 'APPROVAL',
      label: areReviewCountsExact
        ? t`Approvals · ${approvalCount}`
        : t`Approvals`,
    },
    {
      id: 'AUTOMATION',
      label: areReviewCountsExact
        ? t`Automation issues · ${automationCount}`
        : t`Automation issues`,
    },
    {
      id: 'EMAILED_SINCE',
      label:
        areReviewCountsExact && !openCards.hasEmailsSentFailed
          ? t`Emailed since · ${emailedSinceCount}`
          : t`Emailed since`,
    },
    { id: 'DONE', label: t`Done · ${doneSinceCount}` },
  ];

  const openCardCount = openCards.groups.length;
  const reviewEmailCount = openCards.totalNumberOfThreads;
  const loadedReviewEmailCount = openCards.threads.length;
  const openCardsLabel = plural(openCardCount, {
    one: '# applicant card',
    other: '# applicant cards',
  });
  const reviewEmailsLabel = plural(reviewEmailCount, {
    one: '# review email',
    other: '# review emails',
  });
  // A failed load keeps what it got but must not look like it is still going.
  const hasReviewLoadFailed =
    isDefined(visibleReviewList.error) && !visibleReviewList.isComplete;
  const reviewSummary = hasReviewLoadFailed
    ? t`Could not load every review email.`
    : isShowingDone
      ? null
      : !openCards.isComplete
        ? t`Loading every review email…`
        : openCards.isTruncated
          ? t`Showing ${loadedReviewEmailCount} of ${reviewEmailCount} review emails`
          : t`${openCardsLabel} from ${reviewEmailsLabel}`;

  const isOldestAtEnd = sortDirection === 'NEWEST_FIRST';

  const selectedMailbox = mailboxes.find(
    (mailbox) => mailbox.id === messageChannelId,
  );

  const renderReviewCard = (group: ManualReviewGroup) => {
    const { thread, item, earlier } = group;
    const answerContext = buildManualReviewAnswerContext([group, ...earlier]);
    const newestApplicantMessage = [group, ...earlier].find((entry) =>
      isDefined(entry.item.triage),
    );
    const suggestedTemplate = isDefined(newestApplicantMessage?.item.triage)
      ? suggestInboxTemplate({
          reason: newestApplicantMessage.item.triage.reason,
          replyText: newestApplicantMessage.reply,
          templates,
        })
      : null;
    const emailSentSinceCard = isShowingDone
      ? null
      : openCards.getEmailSentSinceCard(group);
    const person = isDefined(item.applicantEmail)
      ? peopleByEmail.get(item.applicantEmail.toLowerCase())
      : undefined;
    const handleReply = (templateId: string | null) => {
      if (isDefined(answerContext)) {
        handleReplyToApplicant(group, answerContext, templateId);
      }
    };

    return (
      <div key={thread.id} data-review-card-id={thread.id}>
        {viewMode === 'LIST' ? (
          <TeamInboxManualReviewRow
            thread={thread}
            item={item}
            earlier={earlier}
            emailSentSinceCard={emailSentSinceCard}
            person={person}
            suggestedTemplateId={suggestedTemplate?.id ?? null}
            isDone={isShowingDone}
            onReply={handleReply}
            onToggleDone={() => handleToggleGroupDone(group)}
          />
        ) : (
          <TeamInboxManualReviewCard
            thread={thread}
            item={item}
            earlier={earlier}
            emailSentSinceCard={emailSentSinceCard}
            person={person}
            suggestedTemplate={suggestedTemplate}
            isDone={isShowingDone}
            onReply={handleReply}
            onToggleDone={() => handleToggleGroupDone(group)}
          />
        )}
      </div>
    );
  };

  if (isManualReview) {
    return (
      <StyledContainer
        onFocusCapture={focusHandlers.onFocusCapture}
        onBlurCapture={focusHandlers.onBlurCapture}
      >
        <ToastOnQueryErrorEffect error={visibleReviewList.error} />
        <StyledReviewLayout ref={containerRef} onScroll={handleScroll}>
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
                {!areReviewCountsExact
                  ? t`Needs review`
                  : toHandleCount > 0
                    ? plural(toHandleCount, {
                        one: '# item needs a person',
                        other: '# items need a person',
                      })
                    : t`Nothing needs a person`}
              </StyledTitle>
              <StyledReviewDescription>
                {t`The automation could not finish these on its own: applicant replies, approvals and failed steps. Handle each one, then mark it done so the rest of the team skips it. A reply sent from a card marks it done for you.`}
              </StyledReviewDescription>
              <StyledAnswersLink
                to={getAppPath(AppPath.RecordIndexPage, {
                  objectNamePlural: MANUAL_REVIEW_ANSWERS_OBJECT,
                })}
              >
                {t`Open Manual review answers`}
              </StyledAnswersLink>
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
                  onClick={() => handleReviewFilterChange(filter.id)}
                >
                  {filter.label}
                </StyledTab>
              ))}
            </StyledTabs>
            {isShowingDone && (
              <TeamInboxReviewHistoryBar
                period={historyPeriod}
                isExporting={isExporting}
                onPeriodChange={setHistoryPeriod}
                onExport={() => exportHistory(doneSince)}
              />
            )}
          </StyledReviewHeader>
          <TeamInboxManualReviewToolbar
            sortDirection={sortDirection}
            viewMode={viewMode}
            summary={reviewSummary}
            markAllDone={
              reviewFilter === 'EMAILED_SINCE' &&
              areReviewCountsExact &&
              !openCards.hasEmailsSentFailed
                ? {
                    cardCount: emailedSinceCount,
                    progress: markAllProgress,
                    onConfirm: () => {
                      handleMarkAllEmailedSinceDone();
                    },
                  }
                : null
            }
            onRetry={hasReviewLoadFailed ? visibleReviewList.reload : null}
            onSortDirectionChange={handleSortDirectionChange}
            onViewModeChange={handleViewModeChange}
            onJumpToNewest={isOldestAtEnd ? scrollToStart : scrollToEnd}
            onJumpToOldest={isOldestAtEnd ? scrollToEnd : scrollToStart}
          />
          {isReviewListLoading ? (
            <SkeletonLoader />
          ) : visibleReviewGroups.length === 0 ? (
            <StyledEmpty>
              {hasReviewLoadFailed
                ? t`Could not load every review email.`
                : isShowingDone
                  ? t`Nothing marked done in this period.`
                  : reviewFilter === 'EMAILED_SINCE'
                    ? openCards.hasEmailsSentFailed
                      ? t`Could not check the emails sent to applicants. Try again later.`
                      : t`No card has an email sent to the applicant since it arrived.`
                    : t`Nothing needs a manual review.`}
            </StyledEmpty>
          ) : viewMode === 'LIST' ? (
            <StyledRowList>
              {visibleReviewGroups.map(renderReviewCard)}
            </StyledRowList>
          ) : (
            <StyledCardGrid>
              {visibleReviewGroups.map(renderReviewCard)}
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
            <StyledEmpty>
              {isSystem &&
              searchTerm.trim() === '' &&
              messageChannelId === ALL_MAILBOXES
                ? t`No automation reports yet.`
                : t`No emails match these filters.`}
            </StyledEmpty>
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
          isReadOnly={isSystem}
          initialTemplateId={
            pendingTemplate?.threadId === selectedThreadId
              ? pendingTemplate.templateId
              : null
          }
          onInitialTemplateApplied={() => setPendingTemplate(null)}
          reviewNotice={
            pendingReview?.applicantThreadId === selectedThreadId
              ? t`Answering a Needs review card: sending this reply marks it done and saves the question and answer.`
              : null
          }
          reviewBar={
            isDefined(reviewCardId) ? (
              <>
                <TeamInboxThreadPaneReviewBar
                  onDone={handlePaneReviewDone}
                  onBack={handleBackToReview}
                />
                {isNonEmptyString(reviewCardGroup?.item.applicantEmail) && (
                  <TeamInboxApplicantConversations
                    applicantEmail={reviewCardGroup.item.applicantEmail}
                    selectedThreadId={selectedThreadId}
                    onSelect={(threadId) =>
                      updateParams({
                        threadId,
                        reviewCardId,
                        replace: false,
                      })
                    }
                  />
                )}
              </>
            ) : null
          }
          onReplySent={handleReviewReplySent}
          onToggleClosed={() => handleToggleClosed(selectedThreadId)}
          onBack={() => {
            if (isDefined(reviewCardId)) {
              handleBackToReview();

              return;
            }

            setPendingReview(null);
            selectThread(null);
          }}
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
