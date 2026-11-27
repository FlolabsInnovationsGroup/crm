import { getEmailSentToApplicantItem } from '@/team-inbox/utils/getEmailSentToApplicantItem';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const entry = (id: string, subject: string) => ({
  thread: { id },
  item: parseTeamInboxReviewItem(subject, ''),
});

describe('getEmailSentToApplicantItem', () => {
  it('looks up the newest applicant email on the card', () => {
    expect(
      getEmailSentToApplicantItem([
        entry(
          'approval',
          'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to ada@gmail.com',
        ),
        entry('newest', '[Reply triage] question: ada@gmail.com - Re: Hi'),
        entry('older', '[Stuck applicant] Ada Lovelace (ada@gmail.com)'),
      ]),
    ).toEqual({ messageThreadId: 'newest', applicantEmail: 'ada@gmail.com' });
  });

  it('skips cards with only approvals or automation issues', () => {
    expect(
      getEmailSentToApplicantItem([
        entry(
          'approval',
          'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to ada@gmail.com',
        ),
      ]),
    ).toBeNull();
  });
});
