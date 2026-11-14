import {
  getManualReviewDoneKey,
  getManualReviewDoneThreadIds,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

const FIRST_THREAD_ID = '20202020-0001-4e7c-8001-123456789def';
const SECOND_THREAD_ID = '20202020-0002-4e7c-8001-123456789def';

describe('manual review done keys', () => {
  it('reads back the thread ids it stored', () => {
    const keys = [
      getManualReviewDoneKey(FIRST_THREAD_ID),
      'TEAM_MAILBOX_SHARES',
      getManualReviewDoneKey(SECOND_THREAD_ID),
    ];

    expect(getManualReviewDoneThreadIds(keys)).toEqual([
      FIRST_THREAD_ID,
      SECOND_THREAD_ID,
    ]);
  });

  it('skips malformed thread ids', () => {
    expect(
      getManualReviewDoneThreadIds([
        getManualReviewDoneKey('not-a-uuid'),
        getManualReviewDoneKey(FIRST_THREAD_ID),
      ]),
    ).toEqual([FIRST_THREAD_ID]);
  });
});
