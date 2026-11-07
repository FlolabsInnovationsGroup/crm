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
  isPartial: false,
  ...point,
});

const buildTrends = (overrides: Partial<AnalyticsTrends>): AnalyticsTrends => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
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
              isPartial: true,
            }),
          ],
        }),
        formatNumber,
      }),
    ).toBe('86 new applications in this week, +46 against the previous one.');
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
    ).toBe('86 new applications in this month.');
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

  it('calls a finished last bucket complete on a past date range', () => {
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
      '42 new applications in the latest complete week, +12 against the previous one.',
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
      '40% overall conversion in the latest complete week, -5 points against the previous one.',
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
    ).toBe('30% drop-off in the latest complete week.');
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
          metric: 'DROP_OFF',
          series: [buildPoint({ bucketStart: '2026-11-02' })],
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
