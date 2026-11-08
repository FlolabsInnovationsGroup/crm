import { getAnalyticsNiceTicks } from '@/crm-analytics/charts/getAnalyticsNiceTicks';

describe('getAnalyticsNiceTicks', () => {
  it('keeps people counts on whole steps', () => {
    expect(
      getAnalyticsNiceTicks({ maxValue: 3, hasOnlyWholeValues: true }),
    ).toEqual([0, 1, 2, 3]);
  });

  it('never gives a rate a step that rounds unevenly', () => {
    expect(getAnalyticsNiceTicks({ maxValue: 0.1, isRate: true })).toEqual([
      0, 0.05, 0.1,
    ]);
    expect(getAnalyticsNiceTicks({ maxValue: 0.02, isRate: true })).toEqual([
      0, 0.01, 0.02,
    ]);
    expect(getAnalyticsNiceTicks({ maxValue: 0.004, isRate: true })).toEqual([
      0, 0.01,
    ]);
  });

  it('keeps a quarter step for a rate when it lands on whole percents', () => {
    expect(getAnalyticsNiceTicks({ maxValue: 1, isRate: true })).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
  });
});
