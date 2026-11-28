import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconLayoutGrid,
  IconList,
  IconSortAscending,
  IconSortDescending,
} from 'twenty-ui/icon';

import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';
import { type ManualReviewViewMode } from '@/team-inbox/types/ManualReviewViewMode';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';

const MARK_ALL_DONE_DIALOG_ID = 'team-inbox-mark-emailed-since-done';

const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const StyledSegmented = styled.div`
  background: var(--fl-chip);
  border-radius: 9px;
  display: inline-flex;
  padding: 2px;
`;

const StyledSegment = styled.button<{ isActive: boolean }>`
  align-items: center;
  background: ${({ isActive }) =>
    isActive ? 'var(--fl-surface)' : 'transparent'};
  border: none;
  border-radius: 7px;
  box-shadow: ${({ isActive }) =>
    isActive ? 'var(--fl-shadow-card)' : 'none'};
  color: ${({ isActive }) =>
    isActive ? 'var(--fl-ink)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: ${({ isActive }) => (isActive ? 600 : 500)};
  gap: 5px;
  padding: 5px 9px;
  white-space: nowrap;
`;

const StyledChipButton = styled.button<{ tone?: 'accent' }>`
  align-items: center;
  background: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-accent-soft)' : 'var(--fl-chip)'};
  border: none;
  border-radius: 9px;
  color: ${({ tone }) =>
    tone === 'accent' ? 'var(--fl-accent-ink)' : 'var(--fl-ink-soft)'};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: ${({ tone }) => (tone === 'accent' ? 600 : 500)};
  gap: 5px;
  padding: 7px 10px;
  white-space: nowrap;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const StyledSummary = styled.span`
  color: var(--fl-faint);
  font-size: 12px;
  margin-inline-start: auto;
`;

type MarkAllDone = {
  cardCount: number;
  progress: { done: number; total: number } | null;
  onConfirm: () => void;
};

type TeamInboxManualReviewToolbarProps = {
  sortDirection: ManualReviewSortDirection;
  viewMode: ManualReviewViewMode;
  summary: string | null;
  markAllDone: MarkAllDone | null;
  onSortDirectionChange: (sortDirection: ManualReviewSortDirection) => void;
  onViewModeChange: (viewMode: ManualReviewViewMode) => void;
  onJumpToNewest: () => void;
  onJumpToOldest: () => void;
};

export const TeamInboxManualReviewToolbar = ({
  sortDirection,
  viewMode,
  summary,
  markAllDone,
  onSortDirectionChange,
  onViewModeChange,
  onJumpToNewest,
  onJumpToOldest,
}: TeamInboxManualReviewToolbarProps) => {
  const { openDialog } = useDialog();
  const markAllCardCount = markAllDone?.cardCount ?? 0;
  const markAllProgress = markAllDone?.progress;
  const markedCount = markAllProgress?.done ?? 0;
  const markingTotal = markAllProgress?.total ?? 0;

  return (
    <StyledToolbar>
      <StyledSegmented role="group" aria-label={t`Sort`}>
        <StyledSegment
          type="button"
          aria-pressed={sortDirection === 'NEWEST_FIRST'}
          isActive={sortDirection === 'NEWEST_FIRST'}
          onClick={() => onSortDirectionChange('NEWEST_FIRST')}
        >
          <IconSortDescending size={14} />
          {t`Newest first`}
        </StyledSegment>
        <StyledSegment
          type="button"
          aria-pressed={sortDirection === 'OLDEST_FIRST'}
          isActive={sortDirection === 'OLDEST_FIRST'}
          onClick={() => onSortDirectionChange('OLDEST_FIRST')}
        >
          <IconSortAscending size={14} />
          {t`Oldest first`}
        </StyledSegment>
      </StyledSegmented>
      <StyledSegmented role="group" aria-label={t`Layout`}>
        <StyledSegment
          type="button"
          aria-pressed={viewMode === 'CARDS'}
          isActive={viewMode === 'CARDS'}
          onClick={() => onViewModeChange('CARDS')}
        >
          <IconLayoutGrid size={14} />
          {t`Cards`}
        </StyledSegment>
        <StyledSegment
          type="button"
          aria-pressed={viewMode === 'LIST'}
          isActive={viewMode === 'LIST'}
          onClick={() => onViewModeChange('LIST')}
        >
          <IconList size={14} />
          {t`List`}
        </StyledSegment>
      </StyledSegmented>
      <StyledChipButton type="button" onClick={onJumpToOldest}>
        <IconArrowDown size={14} />
        {t`Jump to oldest`}
      </StyledChipButton>
      <StyledChipButton type="button" onClick={onJumpToNewest}>
        <IconArrowUp size={14} />
        {t`Jump to newest`}
      </StyledChipButton>
      {isDefined(markAllDone) && (
        <StyledChipButton
          type="button"
          tone="accent"
          disabled={markAllCardCount === 0 || isDefined(markAllProgress)}
          onClick={() => openDialog(MARK_ALL_DONE_DIALOG_ID)}
        >
          <IconCheck size={14} />
          {isDefined(markAllProgress)
            ? t`Marking ${markedCount} of ${markingTotal}…`
            : t`Mark all as done`}
        </StyledChipButton>
      )}
      {isNonEmptyString(summary) && <StyledSummary>{summary}</StyledSummary>}
      {isDefined(markAllDone) && (
        <ConfirmationDialog
          dialogId={MARK_ALL_DONE_DIALOG_ID}
          title={plural(markAllCardCount, {
            one: 'Mark # card as done?',
            other: 'Mark # cards as done?',
          })}
          subtitle={t`Each card in Emailed since is marked done with its earlier items, as if you pressed Done on it. Automated emails count as emailed since too, so check that no question is still unanswered.`}
          confirmButtonText={t`Mark all as done`}
          confirmButtonColor="accent"
          onConfirmClick={markAllDone.onConfirm}
        />
      )}
    </StyledToolbar>
  );
};
