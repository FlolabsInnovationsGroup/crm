import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

describe('formatAnalyticsRate', () => {
  it('turns fractions into whole percents', () => {
    expect(formatAnalyticsRate(0.4)).toBe('40%');
    expect(formatAnalyticsRate(1 / 3)).toBe('33%');
    expect(formatAnalyticsRate(1)).toBe('100%');
  });

  it('keeps a measured zero', () => {
    expect(formatAnalyticsRate(0)).toBe('0%');
  });

  it('keeps one decimal below 1% so a small rate does not read as zero', () => {
    expect(formatAnalyticsRate(0.004)).toBe('0.4%');
    expect(formatAnalyticsRate(1 / 2500)).toBe('0.1%');
  });

  it('keeps one decimal just under 100% so a rate does not read as everyone', () => {
    expect(formatAnalyticsRate(0.992)).toBe('99.2%');
    expect(formatAnalyticsRate(0.9996)).toBe('99.9%');
  });

  it('returns null for anything unknown', () => {
    expect(formatAnalyticsRate(null)).toBeNull();
    expect(formatAnalyticsRate(undefined)).toBeNull();
    expect(formatAnalyticsRate(Number.NaN)).toBeNull();
  });
});
