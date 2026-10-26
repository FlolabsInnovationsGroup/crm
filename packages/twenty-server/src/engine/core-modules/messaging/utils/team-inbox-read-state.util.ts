// Per-user read state of the FloLabs team inbox, stored as a user var.
// Everything received before `readBefore` counts as read, so a new user does
// not start with the whole mailbox history unread.
export type TeamInboxReadState = {
  readBefore: string;
  readAtByThreadId: Record<string, string>;
  unreadThreadIds: string[];
};

export const TEAM_INBOX_READ_STATE_MAX_THREADS = 3000;

export const createTeamInboxReadState = (now: Date): TeamInboxReadState => ({
  readBefore: now.toISOString(),
  readAtByThreadId: {},
  unreadThreadIds: [],
});

// Only replies from outside make a thread unread; our own sent emails,
// including workflow reminders, do not.
export const isTeamInboxThreadRead = (
  state: TeamInboxReadState,
  threadId: string,
  lastIncomingAt: Date | null,
): boolean => {
  if (state.unreadThreadIds.includes(threadId)) {
    return false;
  }

  if (lastIncomingAt === null) {
    return true;
  }

  const readAt = state.readAtByThreadId[threadId] ?? state.readBefore;

  return lastIncomingAt.getTime() <= new Date(readAt).getTime();
};

// Past the cap, the oldest reads fold into `readBefore`: threads untouched
// since then become read, which only matters after thousands of reads.
const capReadEntries = (state: TeamInboxReadState): TeamInboxReadState => {
  const entries = Object.entries(state.readAtByThreadId);

  if (entries.length <= TEAM_INBOX_READ_STATE_MAX_THREADS) {
    return state;
  }

  const sortedEntries = entries.sort(([, first], [, second]) =>
    second.localeCompare(first),
  );
  const keptEntries = sortedEntries.slice(0, TEAM_INBOX_READ_STATE_MAX_THREADS);
  const newestDroppedReadAt =
    sortedEntries[TEAM_INBOX_READ_STATE_MAX_THREADS]?.[1] ?? state.readBefore;

  return {
    ...state,
    readBefore:
      newestDroppedReadAt > state.readBefore
        ? newestDroppedReadAt
        : state.readBefore,
    readAtByThreadId: Object.fromEntries(keptEntries),
  };
};

export const markTeamInboxThreadsRead = (
  state: TeamInboxReadState,
  threadIds: string[],
  now: Date,
): TeamInboxReadState => {
  const readAt = now.toISOString();

  return capReadEntries({
    ...state,
    readAtByThreadId: {
      ...state.readAtByThreadId,
      ...Object.fromEntries(threadIds.map((threadId) => [threadId, readAt])),
    },
    unreadThreadIds: state.unreadThreadIds.filter(
      (threadId) => !threadIds.includes(threadId),
    ),
  });
};

export const markTeamInboxThreadUnread = (
  state: TeamInboxReadState,
  threadId: string,
): TeamInboxReadState => {
  const { [threadId]: _removed, ...readAtByThreadId } = state.readAtByThreadId;

  return {
    ...state,
    readAtByThreadId,
    unreadThreadIds: state.unreadThreadIds.includes(threadId)
      ? state.unreadThreadIds
      : [...state.unreadThreadIds, threadId].slice(
          -TEAM_INBOX_READ_STATE_MAX_THREADS,
        ),
  };
};
