import {
  isTeamInboxApproval,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';

type ReviewCardEntry = { thread: { id: string }; item: TeamInboxReviewItem };

// The visible card goes last so it stays on screen until the whole group is
// saved. An approval on a card with a reply still waits for its own button,
// so Done closes it only once it is all that is left. Undo reopens them all.
export const getReviewCardDoneThreadIds = (
  group: ReviewCardEntry & { earlier: ReviewCardEntry[] },
  isUndo: boolean,
): string[] => {
  const entries = [...group.earlier, group];
  const hasOtherItems = entries.some(
    (entry) => !isTeamInboxApproval(entry.item),
  );

  return entries
    .filter(
      (entry) => isUndo || !hasOtherItems || !isTeamInboxApproval(entry.item),
    )
    .map((entry) => entry.thread.id);
};
