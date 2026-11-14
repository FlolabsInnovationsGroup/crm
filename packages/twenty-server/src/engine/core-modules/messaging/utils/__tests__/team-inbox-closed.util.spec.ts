import {
  getClosedAtByThreadId,
  getClosedKey,
  isTeamInboxThreadClosed,
} from 'src/engine/core-modules/messaging/utils/team-inbox-closed.util';

const THREAD_ID = '20202020-00dd-4e7c-8001-123456789def';

describe('team inbox closed threads', () => {
  it('reads back the threads it stored and ignores other vars', () => {
    expect(
      getClosedAtByThreadId([
        [getClosedKey(THREAD_ID), '2026-11-14T09:00:00.000Z'],
        ['TEAM_INBOX_MANUAL_REVIEW_DONE:thread-2', true],
        [getClosedKey('8b0f6a52-9f2e-4c1b-a7f4-1d2c3b4a5e6f'), true],
        [getClosedKey('not-a-uuid'), '2026-11-14T09:00:00.000Z'],
      ]),
    ).toEqual({ [THREAD_ID]: '2026-11-14T09:00:00.000Z' });
  });

  it('reopens only when a reply arrives after closing', () => {
    const closedAt = '2026-11-14T09:00:00.000Z';

    expect(isTeamInboxThreadClosed(closedAt, null)).toBe(true);
    expect(
      isTeamInboxThreadClosed(closedAt, new Date('2026-11-14T08:59:00.000Z')),
    ).toBe(true);
    expect(
      isTeamInboxThreadClosed(closedAt, new Date('2026-11-14T09:01:00.000Z')),
    ).toBe(false);
  });
});
