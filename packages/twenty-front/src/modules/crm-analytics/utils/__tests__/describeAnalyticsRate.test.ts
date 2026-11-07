import { describeAnalyticsRate } from '@/crm-analytics/utils/describeAnalyticsRate';

describe('describeAnalyticsRate', () => {
  it('keeps a measured 0%', () => {
    expect(describeAnalyticsRate({ rate: 0, eligible: 40 })).toEqual({
      value: 0,
      label: '0%',
      isInProgress: false,
      isSmallSample: false,
    });
  });

  it('marks a small sample', () => {
    expect(
      describeAnalyticsRate({ rate: 0.5, eligible: 4, isUnderMinimum: true }),
    ).toMatchObject({ label: '50%', isSmallSample: true });
  });

  it('says so far when nobody has been measured yet', () => {
    expect(
      describeAnalyticsRate({ rate: 0, soFarRate: 0.12, eligible: 0 }),
    ).toMatchObject({ value: 0.12, label: '12% so far', isInProgress: true });
  });

  it('leaves an unknown rate unknown, never 0%', () => {
    expect(
      describeAnalyticsRate({ rate: null, soFarRate: 0, eligible: 0 }),
    ).toMatchObject({ value: null, label: null });
  });
});
