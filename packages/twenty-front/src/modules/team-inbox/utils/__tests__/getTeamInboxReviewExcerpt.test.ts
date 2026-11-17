import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';

describe('getTeamInboxReviewExcerpt', () => {
  it('drops link targets and extra blank lines', () => {
    expect(
      getTeamInboxReviewExcerpt(
        'Step failed: send first email\n\n\n\nOpen the workflow [https://searchcompareshare.com/workflow/1]',
      ),
    ).toBe('Step failed: send first email\n\nOpen the workflow');
  });

  it('shortens long emails', () => {
    const excerpt = getTeamInboxReviewExcerpt('a'.repeat(400));

    expect(excerpt).toHaveLength(321);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
