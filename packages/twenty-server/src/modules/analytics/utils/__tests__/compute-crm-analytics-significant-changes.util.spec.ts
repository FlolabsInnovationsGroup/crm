import { computeCrmAnalyticsSignificantChanges } from 'src/modules/analytics/utils/compute-crm-analytics-significant-changes.util';

const isSignificant = (current: number | null, previous: number | null) =>
  computeCrmAnalyticsSignificantChanges({
    changes: [{ metricKey: 'METRIC', label: 'Metric', current, previous }],
    minimumSample: 30,
    significantChangeRatio: 0.2,
  })[0].isSignificant;

describe('computeCrmAnalyticsSignificantChanges', () => {
  it('marks a change of exactly the threshold, up or down', () => {
    expect(isSignificant(36, 30)).toBe(true);
    expect(isSignificant(40, 50)).toBe(true);
    expect(isSignificant(45, 35)).toBe(true);
  });

  it('leaves a change under the threshold unmarked', () => {
    expect(isSignificant(35, 30)).toBe(false);
    expect(isSignificant(41, 50)).toBe(false);
    expect(isSignificant(30, 30)).toBe(false);
  });

  it('needs both values at or above the minimum', () => {
    expect(isSignificant(60, 29)).toBe(false);
    expect(isSignificant(29, 60)).toBe(false);
    expect(isSignificant(40, 30)).toBe(true);
    expect(isSignificant(30, 40)).toBe(true);
  });

  it('never marks a missing value', () => {
    expect(isSignificant(null, 100)).toBe(false);
    expect(isSignificant(100, null)).toBe(false);
    expect(isSignificant(null, null)).toBe(false);
  });

  it('keeps each change as given, in order', () => {
    expect(
      computeCrmAnalyticsSignificantChanges({
        changes: [
          { metricKey: 'FIRST', label: 'First', current: 50, previous: 30 },
          { metricKey: 'SECOND', label: 'Second', current: 1, previous: 2 },
        ],
        minimumSample: 30,
        significantChangeRatio: 0.2,
      }),
    ).toEqual([
      {
        metricKey: 'FIRST',
        label: 'First',
        current: 50,
        previous: 30,
        isSignificant: true,
      },
      {
        metricKey: 'SECOND',
        label: 'Second',
        current: 1,
        previous: 2,
        isSignificant: false,
      },
    ]);
  });
});
