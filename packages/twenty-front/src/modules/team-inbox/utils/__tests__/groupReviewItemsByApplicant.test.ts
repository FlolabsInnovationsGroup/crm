import { groupReviewItemsByApplicant } from '@/team-inbox/utils/groupReviewItemsByApplicant';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const entry = (id: string, subject: string) => ({
  thread: { id },
  item: parseTeamInboxReviewItem(subject, ''),
});

describe('groupReviewItemsByApplicant', () => {
  it('folds later cards for the same applicant into the newest one', () => {
    const groups = groupReviewItemsByApplicant([
      entry(
        'newest',
        '[Reply triage] question: Ada@gmail.com - Re: Internship',
      ),
      entry('other', '[Reply triage] question: bob@gmail.com - Re: Internship'),
      entry('older', '[Reply triage] interested: ada@gmail.com - Re: Hello'),
      entry('stuck', '[Stuck applicant] Ada Lovelace (ada@gmail.com)'),
    ]);

    expect(
      groups.map(({ thread, earlierThreadIds }) => [
        thread.id,
        earlierThreadIds,
      ]),
    ).toEqual([
      ['newest', ['older', 'stuck']],
      ['other', []],
    ]);
  });

  it('keeps every approval and automation issue as its own card', () => {
    const groups = groupReviewItemsByApplicant([
      entry(
        'form-1',
        'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to ada@gmail.com',
      ),
      entry(
        'orientation',
        'APPROVAL NEEDED (orientation): choose a date for Ada (ada@gmail.com)',
      ),
      entry('failed', '[n8n] CRM first email step failed: ada@gmail.com'),
      entry('reply', '[Reply triage] question: ada@gmail.com - Re: Internship'),
    ]);

    expect(groups.map(({ thread }) => thread.id)).toEqual([
      'form-1',
      'orientation',
      'failed',
      'reply',
    ]);
  });
});
