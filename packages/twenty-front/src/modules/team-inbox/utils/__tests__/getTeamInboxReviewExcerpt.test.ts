import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';

describe('getTeamInboxReviewExcerpt', () => {
  it('drops button lines and extra blank lines', () => {
    expect(
      getTeamInboxReviewExcerpt(
        'Step failed: send first email\n\n\n\nOpen the workflow [https://searchcompareshare.com/workflow/1]\nCheck the stage.',
      ),
    ).toBe('Step failed: send first email\n\nCheck the stage.');
  });

  it('shortens long emails', () => {
    const excerpt = getTeamInboxReviewExcerpt('a'.repeat(400));

    expect(excerpt).toHaveLength(321);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
