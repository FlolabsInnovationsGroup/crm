import {
  createTeamInboxReadState,
  isTeamInboxThreadRead,
  markTeamInboxThreadUnread,
  markTeamInboxThreadsRead,
  TEAM_INBOX_READ_STATE_MAX_THREADS,
} from 'src/engine/core-modules/messaging/utils/team-inbox-read-state.util';

const at = (iso: string) => new Date(iso);

describe('team inbox read state', () => {
  const initial = createTeamInboxReadState(at('2026-10-26T10:00:00Z'));

  it('treats mail received before the first visit as read', () => {
    expect(isTeamInboxThreadRead(initial, 'a', at('2026-10-20T10:00:00Z'))).toBe(true);
    expect(isTeamInboxThreadRead(initial, 'a', at('2026-10-26T11:00:00Z'))).toBe(false);
    expect(isTeamInboxThreadRead(initial, 'a', null)).toBe(true);
  });

  it('becomes unread again when a reply arrives after it was opened', () => {
    const state = markTeamInboxThreadsRead(initial, ['a'], at('2026-10-26T12:00:00Z'));

    expect(isTeamInboxThreadRead(state, 'a', at('2026-10-26T11:00:00Z'))).toBe(true);
    expect(isTeamInboxThreadRead(state, 'a', at('2026-10-26T13:00:00Z'))).toBe(false);
  });

  it('keeps a thread marked as unread until it is opened again', () => {
    const unread = markTeamInboxThreadUnread(
      markTeamInboxThreadsRead(initial, ['a'], at('2026-10-26T12:00:00Z')),
      'a',
    );

    expect(isTeamInboxThreadRead(unread, 'a', at('2026-10-01T00:00:00Z'))).toBe(false);
    expect(
      isTeamInboxThreadRead(
        markTeamInboxThreadsRead(unread, ['a'], at('2026-10-26T14:00:00Z')),
        'a',
        at('2026-10-01T00:00:00Z'),
      ),
    ).toBe(true);
  });

  it('folds the oldest reads into readBefore past the cap', () => {
    let state = initial;

    for (let index = 0; index <= TEAM_INBOX_READ_STATE_MAX_THREADS; index++) {
      state = markTeamInboxThreadsRead(
        state,
        [`t${index}`],
        new Date(Date.UTC(2026, 10, 1, 0, 0, index)),
      );
    }

    expect(Object.keys(state.readAtByThreadId)).toHaveLength(
      TEAM_INBOX_READ_STATE_MAX_THREADS,
    );
    expect(state.readAtByThreadId.t0).toBeUndefined();
    expect(state.readBefore).toBe('2026-11-01T00:00:00.000Z');
  });
});
