import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';

describe('getTeamInboxReviewExcerpt', () => {
  it('drops button lines and extra blank lines', () => {
    expect(
      getTeamInboxReviewExcerpt(
        'Step failed: send first email\n\n\n\nOpen the workflow [https://searchcompareshare.com/workflow/1]\nCheck the stage.',
      ),
    ).toBe('Step failed: send first email\n\nCheck the stage.');
  });

  it('keeps a sentence that contains a link, without the link', () => {
    expect(
      getTeamInboxReviewExcerpt(
        'Step "Update CRM stage" failed with a 502 error, see the execution [https://searchcompareshare.com/workflow/9/executions/1] for details.',
      ),
    ).toBe(
      'Step "Update CRM stage" failed with a 502 error, see the execution for details.',
    );
  });

  it('shortens long emails', () => {
    const excerpt = getTeamInboxReviewExcerpt('a'.repeat(400));

    expect(excerpt).toHaveLength(321);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
