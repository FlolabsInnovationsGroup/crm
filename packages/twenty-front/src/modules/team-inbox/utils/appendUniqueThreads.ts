// Offset pages shift when a thread arrives or is marked done mid-load.
export const appendUniqueThreads = <TThread extends { id: string }>(
  threads: TThread[],
  page: TThread[],
): TThread[] => {
  const seenIds = new Set(threads.map(({ id }) => id));

  return [...threads, ...page.filter(({ id }) => !seenIds.has(id))];
};
