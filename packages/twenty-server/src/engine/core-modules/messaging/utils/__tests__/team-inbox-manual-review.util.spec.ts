import {
  getManualReviewDoneKey,
  getManualReviewDoneThreadIds,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

describe('manual review done keys', () => {
  it('reads back the thread ids it stored', () => {
    const keys = [
      getManualReviewDoneKey('thread-1'),
      'TEAM_MAILBOX_SHARES',
      getManualReviewDoneKey('thread-2'),
    ];

    expect(getManualReviewDoneThreadIds(keys)).toEqual([
      'thread-1',
      'thread-2',
    ]);
  });
});
