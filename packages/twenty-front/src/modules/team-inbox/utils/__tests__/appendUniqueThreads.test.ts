import { appendUniqueThreads } from '@/team-inbox/utils/appendUniqueThreads';

describe('appendUniqueThreads', () => {
  it('appends the next page', () => {
    expect(
      appendUniqueThreads([{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]),
    ).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('skips a thread the previous page already had', () => {
    expect(
      appendUniqueThreads(
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'b' }, { id: 'c' }],
      ),
    ).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});
