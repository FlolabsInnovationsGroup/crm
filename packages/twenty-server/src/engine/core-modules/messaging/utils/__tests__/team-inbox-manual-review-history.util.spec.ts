import { MessageParticipantRole } from 'twenty-shared/types';

import {
  getManualReviewDoneByKey,
  getManualReviewDoneState,
  pickManualReviewReply,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review-history.util';
import {
  getManualReviewDoneKey,
  getManualReviewDoneThreadIds,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

const THREAD_ID = '20202020-0001-4e7c-8001-123456789def';
const MEMBER_ID = '20202020-0002-4e7c-8001-123456789def';

const { FROM, TO, CC } = MessageParticipantRole;

describe('getManualReviewDoneState', () => {
  it('reads when and by whom an item was marked done', () => {
    const workspaceVars = new Map<string, unknown>([
      [getManualReviewDoneKey(THREAD_ID), '2026-11-25T10:00:00.000Z'],
      [getManualReviewDoneByKey(THREAD_ID), MEMBER_ID],
    ]);

    expect(getManualReviewDoneState(workspaceVars, THREAD_ID)).toEqual({
      doneAt: new Date('2026-11-25T10:00:00.000Z'),
      doneByWorkspaceMemberId: MEMBER_ID,
    });
  });

  it('leaves the time empty for items marked done before it was stored', () => {
    const workspaceVars = new Map<string, unknown>([
      [getManualReviewDoneKey(THREAD_ID), true],
    ]);

    expect(getManualReviewDoneState(workspaceVars, THREAD_ID)).toEqual({
      doneAt: null,
      doneByWorkspaceMemberId: null,
    });
  });

  it('does not count the done-by entry as a done thread', () => {
    expect(
      getManualReviewDoneThreadIds([getManualReviewDoneByKey(THREAD_ID)]),
    ).toEqual([]);
  });
});

describe('pickManualReviewReply', () => {
  const reviewReceivedAt = new Date('2026-11-25T09:00:00Z');

  const message = (
    id: string,
    receivedAt: string,
    participants: { role: MessageParticipantRole; handle: string }[],
  ) => ({
    id,
    text: `Text of ${id}`,
    receivedAt: new Date(receivedAt),
    participants,
  });

  it('picks the first email our mailbox sent the applicant after the review arrived', () => {
    const reply = pickManualReviewReply({
      messages: [
        message('later', '2026-11-26T09:00:00Z', [
          { role: FROM, handle: 'hr@flolabs.test' },
          { role: TO, handle: 'jane@example.com' },
        ]),
        message('first', '2026-11-25T12:00:00Z', [
          { role: FROM, handle: 'HR@flolabs.test' },
          { role: CC, handle: 'Jane@Example.com' },
        ]),
        message('before-review', '2026-11-24T12:00:00Z', [
          { role: FROM, handle: 'hr@flolabs.test' },
          { role: TO, handle: 'jane@example.com' },
        ]),
      ],
      applicantEmail: 'jane@example.com',
      ownHandles: ['hr@flolabs.test'],
      reviewReceivedAt,
    });

    expect(reply?.id).toBe('first');
  });

  it('ignores emails the applicant sent and emails from other senders', () => {
    const reply = pickManualReviewReply({
      messages: [
        message('from-applicant', '2026-11-25T10:00:00Z', [
          { role: FROM, handle: 'jane@example.com' },
          { role: TO, handle: 'hr@flolabs.test' },
        ]),
        message('from-someone-else', '2026-11-25T11:00:00Z', [
          { role: FROM, handle: 'friend@example.com' },
          { role: TO, handle: 'jane@example.com' },
        ]),
      ],
      applicantEmail: 'jane@example.com',
      ownHandles: ['hr@flolabs.test'],
      reviewReceivedAt,
    });

    expect(reply).toBeNull();
  });
});
