import { type ManualReviewSortDirection } from '@/team-inbox/types/ManualReviewSortDirection';

type SortableEntry = {
  thread: { id: string; lastMessageReceivedAt: string };
};

export const sortByLastMessage = <TEntry extends SortableEntry>(
  entries: TEntry[],
  sortDirection: ManualReviewSortDirection,
): TEntry[] => {
  const sign = sortDirection === 'OLDEST_FIRST' ? 1 : -1;

  return [...entries].sort((first, second) => {
    const difference =
      new Date(first.thread.lastMessageReceivedAt).getTime() -
      new Date(second.thread.lastMessageReceivedAt).getTime();

    return difference !== 0
      ? sign * difference
      : sign * first.thread.id.localeCompare(second.thread.id);
  });
};
