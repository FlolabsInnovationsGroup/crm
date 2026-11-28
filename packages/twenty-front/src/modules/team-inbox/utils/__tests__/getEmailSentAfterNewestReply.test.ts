import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';
import { getEmailSentAfterNewestReply } from '@/team-inbox/utils/getEmailSentAfterNewestReply';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const REPLY = '[Reply triage] question: ada@gmail.com - Re: Internship';

const entry = (id: string, lastMessageReceivedAt: string) => ({
  thread: { id, lastMessageReceivedAt },
  item: parseTeamInboxReviewItem(REPLY, ''),
});

const sentAt = (sentAtValue: string): EmailSentToApplicant => ({
  messageThreadId: 'reply-2',
  sentAt: sentAtValue,
  subject: 'Re: Internship',
  excerpt: null,
  senderName: 'HR',
  senderEmail: 'hr@flolabsinnovations.com',
});

// Newest first, as cards hold them.
const entries = [
  entry('reply-2', '2026-11-20T10:00:00.000Z'),
  entry('reply-1', '2026-11-10T10:00:00.000Z'),
];

describe('getEmailSentAfterNewestReply', () => {
  it('counts an email sent after the newest reply', () => {
    const email = sentAt('2026-11-21T10:00:00.000Z');

    expect(
      getEmailSentAfterNewestReply(entries, new Map([['reply-2', email]])),
    ).toBe(email);
  });

  it('ignores an email sent between two replies', () => {
    expect(
      getEmailSentAfterNewestReply(
        entries,
        new Map([['reply-2', sentAt('2026-11-15T10:00:00.000Z')]]),
      ),
    ).toBeNull();
  });

  it('has nothing when no email was found', () => {
    expect(getEmailSentAfterNewestReply(entries, new Map())).toBeNull();
  });
});
