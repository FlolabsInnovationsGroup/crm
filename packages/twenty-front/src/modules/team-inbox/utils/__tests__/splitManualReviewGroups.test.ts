import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { splitManualReviewGroups } from '@/team-inbox/utils/splitManualReviewGroups';

const group = (
  id: string,
  subject: string,
  earlierSubjects: string[] = [],
) => ({
  id,
  item: parseTeamInboxReviewItem(subject, ''),
  earlier: earlierSubjects.map((earlierSubject) => ({
    item: parseTeamInboxReviewItem(earlierSubject, ''),
  })),
});

const question = group(
  'question',
  '[Reply triage] question: ada@gmail.com - Re: Internship',
);
const answered = group(
  'answered',
  '[Reply triage] question: bob@gmail.com - Re: Internship',
);
const approval = group(
  'approval',
  'APPROVAL NEEDED (Form 1): send "BEFORE MEETING" to eve@gmail.com',
);
const replyWithApproval = group(
  'reply-with-approval',
  '[Reply triage] other: sam@gmail.com - Re: Next Steps',
  ['APPROVAL NEEDED (orientation): choose a date for SAM (sam@gmail.com)'],
);

const ids = (groups: { id: string }[]) => groups.map(({ id }) => id);

describe('splitManualReviewGroups', () => {
  it('moves cards emailed since out of the cards to handle', () => {
    const { toHandle, emailedSince } = splitManualReviewGroups(
      [question, answered],
      ({ id }) => id === 'answered',
    );

    expect(ids(toHandle)).toEqual(['question']);
    expect(ids(emailedSince)).toEqual(['answered']);
  });

  it('keeps approval cards to handle even when emailed since', () => {
    const { toHandle, emailedSince } = splitManualReviewGroups(
      [approval, replyWithApproval],
      () => true,
    );

    expect(ids(toHandle)).toEqual(['approval', 'reply-with-approval']);
    expect(emailedSince).toEqual([]);
  });

  it('keeps every card to handle when nobody emailed them', () => {
    const { toHandle, emailedSince } = splitManualReviewGroups(
      [question, answered, approval],
      () => false,
    );

    expect(ids(toHandle)).toEqual(['question', 'answered', 'approval']);
    expect(emailedSince).toEqual([]);
  });
});
