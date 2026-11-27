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
      groups.map(({ thread, earlier }) => [
        thread.id,
        earlier.map((entry) => entry.thread.id),
      ]),
    ).toEqual([
      ['newest', ['older', 'stuck']],
      ['other', []],
    ]);
  });

  it('folds approvals into the same applicant card', () => {
    const groups = groupReviewItemsByApplicant([
      entry(
        'reply',
        '[Reply triage] other: nagasanam108@gmail.com - Re: Next Steps',
      ),
      entry(
        'orientation',
        'APPROVAL NEEDED (orientation): choose a date for SRIMANASA (nagasanam108@gmail.com)',
      ),
      entry(
        'form-1',
        'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to bob@gmail.com',
      ),
    ]);

    expect(
      groups.map(({ thread, earlier }) => [
        thread.id,
        earlier.map((entry) => entry.thread.id),
      ]),
    ).toEqual([
      ['reply', ['orientation']],
      ['form-1', []],
    ]);
  });

  it('keeps every automation issue as its own card', () => {
    const groups = groupReviewItemsByApplicant([
      entry(
        'first',
        '[n8n] Recruitment automation needs attention: john@flolabsinnovations.com',
      ),
      entry(
        'second',
        '[n8n] Recruitment automation needs attention: john@flolabsinnovations.com',
      ),
      entry('failed', '[n8n] CRM first email step failed: ada@gmail.com'),
    ]);

    expect(groups.map(({ thread }) => thread.id)).toEqual([
      'first',
      'second',
      'failed',
    ]);
  });
});
