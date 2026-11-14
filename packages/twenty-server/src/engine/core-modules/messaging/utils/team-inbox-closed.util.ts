import { isString } from '@sniptt/guards';
import { isValidUuid } from 'twenty-shared/utils';

// One key per thread, so two teammates closing at the same time never
// overwrite each other. The value is when it was closed.
const CLOSED_KEY_PREFIX = 'TEAM_INBOX_CLOSED:';

export const getClosedKey = (messageThreadId: string) =>
  `${CLOSED_KEY_PREFIX}${messageThreadId}`;

export const getClosedAtByThreadId = (
  entries: Iterable<[string, unknown]>,
): Record<string, string> =>
  Object.fromEntries(
    [...entries]
      .filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith(CLOSED_KEY_PREFIX) && isString(entry[1]),
      )
      .map(([key, closedAt]) => [key.slice(CLOSED_KEY_PREFIX.length), closedAt])
      // A malformed id would break the uuid[] cast in every inbox query.
      .filter(([threadId]) => isValidUuid(threadId)),
  );

// A reply from outside after closing reopens the thread, like HubSpot; our
// own sent emails, including workflow reminders, do not.
export const isTeamInboxThreadClosed = (
  closedAt: string,
  lastIncomingAt: Date | null,
): boolean =>
  lastIncomingAt === null ||
  lastIncomingAt.getTime() <= new Date(closedAt).getTime();
