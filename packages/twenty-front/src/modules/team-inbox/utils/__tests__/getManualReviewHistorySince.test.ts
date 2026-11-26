import { getManualReviewHistorySince } from '@/team-inbox/utils/getManualReviewHistorySince';

describe('getManualReviewHistorySince', () => {
  const now = new Date(2026, 10, 26, 15, 30);

  it('starts today at midnight', () => {
    expect(getManualReviewHistorySince('TODAY', now)).toBe(
      new Date(2026, 10, 26).toISOString(),
    );
  });

  it('counts today as one of the days in longer periods', () => {
    expect(getManualReviewHistorySince('LAST_7_DAYS', now)).toBe(
      new Date(2026, 10, 20).toISOString(),
    );
    expect(getManualReviewHistorySince('LAST_30_DAYS', now)).toBe(
      new Date(2026, 9, 28).toISOString(),
    );
  });
});
