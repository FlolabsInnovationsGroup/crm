import {
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildTrendsTakeaway } from '@/crm-analytics/utils/buildTrendsTakeaway';
import { formatNumber } from '@/localization/utils/formatNumber';

const buildPoint = (
  point: Partial<AnalyticsTrendPoint> & { bucketStart: string },
): AnalyticsTrendPoint => ({
  value: null,
  previousValue: null,
  size: null,
  previousSize: null,
  isPartial: false,
  ...point,
});

const buildTrends = (overrides: Partial<AnalyticsTrends>): AnalyticsTrends => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-09-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  metric: 'NEW_APPLICATIONS',
  stageKey: null,
  period: 'WEEK',
  unavailableReason: null,
  series: [],
  cohorts: [],
  movement: { from: '2026-11-02', to: '2026-11-08', rows: [] },
  ...overrides,
});

describe('buildTrendsTakeaway', () => {
  it('compares with the preceding bucket, not the value one window back', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 40 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 86,
              previousValue: 74,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe(
      '86 new applications in the week of Nov 2, 2026, +46 against the previous one.',
    );
  });

  it('states a running count beside the previous one instead of subtracting it', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 74 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 2,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('2 new applications so far in this week; the previous one had 74.');
  });

  it('still subtracts a level in a period in progress', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'TOTAL_CONTACTS',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 40 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 42,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('42 contacts in this week, +2 against the previous one.');
  });

  describe('when the preceding bucket starts before tracking', () => {
    const TRACKING_STARTED_AT = '2026-10-27T00:00:00.000Z';

    it('leaves the comparison out of a running count in progress', () => {
      expect(
        buildTrendsTakeaway({
          trends: buildTrends({
            trackingStartedAt: TRACKING_STARTED_AT,
            period: 'MONTH',
            series: [
              buildPoint({ bucketStart: '2026-10-01', value: 5 }),
              buildPoint({
                bucketStart: '2026-11-01',
                value: 86,
                isPartial: true,
              }),
            ],
          }),
          formatNumber,
        }),
      ).toBe('86 new applications so far in this month.');
    });

    it('leaves the change out of a finished running count', () => {
      expect(
        buildTrendsTakeaway({
          trends: buildTrends({
            trackingStartedAt: TRACKING_STARTED_AT,
            series: [
              buildPoint({ bucketStart: '2026-10-26', value: 5 }),
              buildPoint({ bucketStart: '2026-11-02', value: 42 }),
            ],
          }),
          formatNumber,
        }),
      ).toBe('42 new applications in the week of Nov 2, 2026.');
    });

    it('keeps the change on a level, which is known whenever it was counted', () => {
      expect(
        buildTrendsTakeaway({
          trends: buildTrends({
            trackingStartedAt: TRACKING_STARTED_AT,
            metric: 'TOTAL_CONTACTS',
            series: [
              buildPoint({ bucketStart: '2026-10-26', value: 40 }),
              buildPoint({ bucketStart: '2026-11-02', value: 42 }),
            ],
          }),
          formatNumber,
        }),
      ).toBe(
        '42 contacts in the week of Nov 2, 2026, +2 against the previous one.',
      );
    });
  });

  it('leaves out the change when there is no preceding bucket', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          period: 'MONTH',
          series: [
            buildPoint({
              bucketStart: '2026-11-01',
              value: 86,
              previousValue: 12,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('86 new applications so far in this month.');
  });

  it('leaves out the change when the preceding bucket has no value', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'TOTAL_CONTACTS',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: null }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 1,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('1 contact in this week.');
  });

  it('names a finished last bucket on a past date range', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          series: [
            buildPoint({ bucketStart: '2026-10-05', value: 30 }),
            buildPoint({ bucketStart: '2026-10-12', value: 42 }),
          ],
        }),
        formatNumber,
      }),
    ).toBe(
      '42 new applications in the week of Oct 12, 2026, +12 against the previous one.',
    );
  });

  it('formats rates as percents and changes as points', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'OVERALL_CONVERSION',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 0.45, size: 120 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 0.4,
              previousValue: 0.1,
              size: 120,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe(
      '40% overall conversion for people who applied in the week of Nov 2, 2026, -5 points against the previous one.',
    );
  });

  it('skips a rate under the minimum sample and says the bucket is not the current one', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'OVERALL_CONVERSION',
          series: [
            buildPoint({ bucketStart: '2026-10-19', value: 0.3, size: 90 }),
            buildPoint({
              bucketStart: '2026-10-26',
              value: 0.9,
              size: 4,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('30% overall conversion in the latest complete week.');
  });

  it('leaves out the change when the preceding rate is under the minimum sample', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'DROP_OFF',
          series: [
            buildPoint({ bucketStart: '2026-10-19', value: 0.9, size: 4 }),
            buildPoint({ bucketStart: '2026-10-26', value: 0.3, size: 90 }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('30% drop-off for people who applied in the week of Oct 26, 2026.');
  });

  it('names an old cohort instead of calling it the latest complete one', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'OVERALL_CONVERSION',
          period: 'MONTH',
          series: [
            buildPoint({ bucketStart: '2026-07-01', value: 0.12, size: 90 }),
            buildPoint({ bucketStart: '2026-10-01', value: null, size: 90 }),
            buildPoint({
              bucketStart: '2026-11-01',
              value: null,
              size: 10,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('12% overall conversion for people who applied in Jul 2026.');
  });

  it('calls the bucket just before the current one the latest complete', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'TOTAL_CONTACTS',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 40 }),
            buildPoint({ bucketStart: '2026-11-02', isPartial: true }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('40 contacts in the latest complete week.');
  });

  it('reads as English by day', () => {
    const buildDailyTakeaway = (latestDayIsPartial: boolean) =>
      buildTrendsTakeaway({
        trends: buildTrends({
          period: 'DAY',
          series: [
            buildPoint({ bucketStart: '2026-11-05', value: 7 }),
            buildPoint({
              bucketStart: '2026-11-06',
              value: 5,
            }),
            buildPoint({
              bucketStart: '2026-11-07',
              value: latestDayIsPartial ? 2 : null,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      });

    expect(buildDailyTakeaway(true)).toBe(
      '2 new applications so far today; the day before had 5.',
    );
    expect(buildDailyTakeaway(false)).toBe(
      '5 new applications on the latest complete day, -2 against the day before.',
    );
  });

  it('keeps one decimal on median days and their change', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'MEDIAN_DAYS',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: 4.1, size: 40 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: 4.5,
              size: 40,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('Median of 4.5 days in this week, +0.4 days against the previous one.');
  });

  it('bases the median plural on the rounded value', () => {
    const buildMedianTakeaway = (latest: number, preceding: number) =>
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'MEDIAN_DAYS',
          series: [
            buildPoint({ bucketStart: '2026-10-26', value: preceding, size: 40 }),
            buildPoint({
              bucketStart: '2026-11-02',
              value: latest,
              size: 40,
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      });

    expect(buildMedianTakeaway(1.04, 2.04)).toBe(
      'Median of 1 day in this week, -1 day against the previous one.',
    );
    expect(buildMedianTakeaway(1.4, 1.42)).toBe(
      'Median of 1.4 days in this week, 0 days against the previous one.',
    );
  });

  it('falls back to a neutral sentence when nothing is known', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'MEDIAN_DAYS',
          series: [buildPoint({ bucketStart: '2026-11-02' })],
        }),
        formatNumber,
      }),
    ).toBe('No figures for this view yet.');
  });

  it('gives the window as the reason when no rate is known, whatever the previous values', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'OVERALL_CONVERSION',
          series: [
            buildPoint({ bucketStart: '2026-10-26', previousValue: 0.3 }),
            buildPoint({ bucketStart: '2026-11-02', previousValue: 0.4 }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('No period in this view has fully passed the window yet.');
  });

  it('keeps the neutral sentence when known rates are all under the minimum sample', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          metric: 'DROP_OFF',
          series: [
            buildPoint({ bucketStart: '2026-11-02', value: 0.5, size: 4 }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('No figures for this view yet.');
  });

  it('falls back to a neutral sentence when the trend is unavailable', () => {
    expect(
      buildTrendsTakeaway({
        trends: buildTrends({
          unavailableReason: 'DAILY_RATE',
          series: [buildPoint({ bucketStart: '2026-11-02', value: 1 })],
        }),
        formatNumber,
      }),
    ).toBe('No figures for this view yet.');
  });
});
