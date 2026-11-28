import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { buildManualReviewGroups } from '@/team-inbox/utils/buildManualReviewGroups';

const thread = (
  id: string,
  subject: string,
  lastMessageReceivedAt: string,
): InboxThread =>
  ({
    id,
    subject,
    lastMessageBody: '',
    lastMessageReceivedAt,
  }) as InboxThread;

describe('buildManualReviewGroups', () => {
  it('shows the newest item on the card even when loaded oldest first', () => {
    const groups = buildManualReviewGroups([
      thread(
        'older',
        '[Reply triage] question: ada@gmail.com - Re: Hello',
        '2026-11-01T10:00:00.000Z',
      ),
      thread(
        'other',
        '[Reply triage] question: bob@gmail.com - Re: Hello',
        '2026-11-10T10:00:00.000Z',
      ),
      thread(
        'newer',
        '[Reply triage] other: ada@gmail.com - Re: Hello',
        '2026-11-20T10:00:00.000Z',
      ),
    ]);

    expect(
      groups.map(({ thread: { id }, earlier }) => [
        id,
        earlier.map((entry) => entry.thread.id),
      ]),
    ).toEqual([
      ['newer', ['older']],
      ['other', []],
    ]);
  });
});
