import { sortByLastMessage } from '@/team-inbox/utils/sortByLastMessage';

const entry = (id: string, lastMessageReceivedAt: string) => ({
  thread: { id, lastMessageReceivedAt },
});

const entries = [
  entry('middle', '2026-11-20T10:00:00.000Z'),
  entry('oldest', '2026-11-01T10:00:00.000Z'),
  entry('newest', '2026-11-27T10:00:00.000Z'),
];

describe('sortByLastMessage', () => {
  it('puts the newest card first by default order', () => {
    expect(
      sortByLastMessage(entries, 'NEWEST_FIRST').map(({ thread }) => thread.id),
    ).toEqual(['newest', 'middle', 'oldest']);
  });

  it('puts the oldest card first', () => {
    expect(
      sortByLastMessage(entries, 'OLDEST_FIRST').map(({ thread }) => thread.id),
    ).toEqual(['oldest', 'middle', 'newest']);
  });

  it('keeps a stable order for cards from the same moment', () => {
    const sameTime = [
      entry('b', '2026-11-20T10:00:00.000Z'),
      entry('a', '2026-11-20T10:00:00.000Z'),
    ];

    expect(
      sortByLastMessage(sameTime, 'OLDEST_FIRST').map(
        ({ thread }) => thread.id,
      ),
    ).toEqual(['a', 'b']);
    expect(
      sortByLastMessage(sameTime, 'NEWEST_FIRST').map(
        ({ thread }) => thread.id,
      ),
    ).toEqual(['b', 'a']);
  });

  it('does not change the list it is given', () => {
    sortByLastMessage(entries, 'OLDEST_FIRST');

    expect(entries.map(({ thread }) => thread.id)).toEqual([
      'middle',
      'oldest',
      'newest',
    ]);
  });
});
