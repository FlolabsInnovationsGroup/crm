import { type InboxThreadSortDirection } from 'src/engine/core-modules/messaging/types/inbox-thread-filter.type';

// The value reaches ORDER BY as raw SQL and this resolver runs no
// validation pipe, so anything but ASC becomes DESC.
export const normalizeInboxThreadSortDirection = (
  sortDirection: unknown,
): InboxThreadSortDirection => (sortDirection === 'ASC' ? 'ASC' : 'DESC');
