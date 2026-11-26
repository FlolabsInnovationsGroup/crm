import { getManualReviewHistorySince } from '@/team-inbox/utils/getManualReviewHistorySince';

describe('getManualReviewHistorySince', () => {
  const now = new Date(2026, 10, 26, 15, 30);

  it('starts today at midnight', () => {
    expect(getManualReviewHistorySince('TODAY', now)).toBe(
      new Date(2026, 10, 26).toISOString(),
    );
  });

  it('goes back whole days for longer periods', () => {
    expect(getManualReviewHistorySince('LAST_7_DAYS', now)).toBe(
      new Date(2026, 10, 19).toISOString(),
    );
    expect(getManualReviewHistorySince('LAST_30_DAYS', now)).toBe(
      new Date(2026, 9, 27).toISOString(),
    );
  });
});
