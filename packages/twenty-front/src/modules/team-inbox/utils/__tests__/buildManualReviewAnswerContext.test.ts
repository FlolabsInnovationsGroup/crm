import { buildManualReviewAnswerContext } from '@/team-inbox/utils/buildManualReviewAnswerContext';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const entry = (id: string, subject: string, reply: string | null) => ({
  thread: { id, lastMessageBody: '' },
  item: parseTeamInboxReviewItem(subject, ''),
  reply,
});

describe('buildManualReviewAnswerContext', () => {
  it('joins the applicant emails oldest first and leaves approvals out', () => {
    expect(
      buildManualReviewAnswerContext([
        entry(
          'newest',
          '[Reply triage] question: ada@gmail.com - Re: Internship',
          'And when does it start?',
        ),
        entry(
          'approval',
          'APPROVAL NEEDED (orientation): choose a date for Ada (ada@gmail.com)',
          null,
        ),
        entry(
          'older',
          '[Reply triage] interested_with_question: ada@gmail.com - Re: Hi',
          'Is it paid?',
        ),
      ]),
    ).toEqual({
      applicantEmail: 'ada@gmail.com',
      reviewThreadId: 'newest',
      applicantMessageThreadIds: ['newest', 'older'],
      question: 'Is it paid?\n\nAnd when does it start?',
      category: 'question',
    });
  });

  it('returns nothing for a card that is only an approval', () => {
    expect(
      buildManualReviewAnswerContext([
        entry(
          'approval',
          'APPROVAL NEEDED (orientation): choose a date for Ada (ada@gmail.com)',
          null,
        ),
      ]),
    ).toBeNull();
  });
});
