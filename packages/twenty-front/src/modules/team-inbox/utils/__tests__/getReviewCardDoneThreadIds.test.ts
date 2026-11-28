import { getReviewCardDoneThreadIds } from '@/team-inbox/utils/getReviewCardDoneThreadIds';
import { parseTeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

const entry = (id: string, subject: string) => ({
  thread: { id },
  item: parseTeamInboxReviewItem(subject, ''),
});

const REPLY = '[Reply triage] question: sam@gmail.com - Re: Next Steps';
const OLDER_REPLY = '[Reply triage] other: sam@gmail.com - Re: Hello';
const APPROVAL =
  'APPROVAL NEEDED (orientation): choose a date for SAM (sam@gmail.com)';

describe('getReviewCardDoneThreadIds', () => {
  it('marks the earlier items first and the visible card last', () => {
    expect(
      getReviewCardDoneThreadIds(
        { ...entry('newest', REPLY), earlier: [entry('older', OLDER_REPLY)] },
        false,
      ),
    ).toEqual(['older', 'newest']);
  });

  it('leaves an approval open while the card also has a reply', () => {
    expect(
      getReviewCardDoneThreadIds(
        {
          ...entry('reply', REPLY),
          earlier: [entry('approval', APPROVAL)],
        },
        false,
      ),
    ).toEqual(['reply']);
  });

  it('closes an approval once it is all that is left', () => {
    expect(
      getReviewCardDoneThreadIds(
        { ...entry('approval', APPROVAL), earlier: [] },
        false,
      ),
    ).toEqual(['approval']);
  });

  it('reopens every item on undo', () => {
    expect(
      getReviewCardDoneThreadIds(
        {
          ...entry('reply', REPLY),
          earlier: [entry('approval', APPROVAL)],
        },
        true,
      ),
    ).toEqual(['approval', 'reply']);
  });
});
