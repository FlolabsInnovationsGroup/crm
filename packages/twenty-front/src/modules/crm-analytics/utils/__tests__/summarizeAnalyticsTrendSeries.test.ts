import {
  type AnalyticsPeriod,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { summarizeAnalyticsTrendSeries } from '@/crm-analytics/utils/summarizeAnalyticsTrendSeries';

const BASE = {
  minimumSample: 30,
  trackingStartedAt: '2026-09-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
};

const formatNumber = (value: number, options?: { decimals?: number }) =>
  value.toFixed(options?.decimals ?? 0);

const buildPoint = (
  bucketStart: string,
  value: number | null,
  overrides: Partial<AnalyticsTrendPoint> = {},
): AnalyticsTrendPoint => ({
  bucketStart,
  value,
  previousValue: null,
  size: null,
  previousSize: null,
  isPartial: false,
  ...overrides,
});

const summarize = (
  points: AnalyticsTrendPoint[],
  metric: AnalyticsTrendMetric,
  period: AnalyticsPeriod = 'WEEK',
) =>
  summarizeAnalyticsTrendSeries({
    points,
    metric,
    period,
    base: BASE,
    formatNumber,
  });

describe('summarizeAnalyticsTrendSeries', () => {
  it('has nothing to say when no value is known', () => {
    expect(
      summarize([buildPoint('2026-11-02', null)], 'OVERALL_CONVERSION'),
    ).toBeNull();
  });

  it('gives a running count as so far and does not subtract from it', () => {
    expect(
      summarize(
        [
          buildPoint('2026-10-26', 74),
          buildPoint('2026-11-02', 12, { isPartial: true }),
        ],
        'NEW_APPLICATIONS',
      ),
    ).toEqual({
      value: '12',
      detail: 'So far this week. 74 the week before.',
      isSmallSample: false,
    });
  });

  it('gives a level in progress as its change', () => {
    expect(
      summarize(
        [
          buildPoint('2026-10-26', 100),
          buildPoint('2026-11-02', 90, { isPartial: true }),
        ],
        'TOTAL_CONTACTS',
      )?.detail,
    ).toBe('This week. -10 against the week before.');
  });

  it('does not compare a count with a period before tracking started', () => {
    expect(
      summarize(
        [buildPoint('2026-08-31', 5), buildPoint('2026-09-07', 20)],
        'NEW_APPLICATIONS',
      )?.detail,
    ).toMatch(/^Week of Sep 7, 2026\.$/);
  });

  it('skips a rate still inside its window and names who it is about', () => {
    expect(
      summarize(
        [
          buildPoint('2026-10-12', 0.2, { size: 40 }),
          buildPoint('2026-10-19', 0.25, { size: 50 }),
          buildPoint('2026-11-02', null, { size: 12, isPartial: true }),
        ],
        'OVERALL_CONVERSION',
      ),
    ).toEqual({
      value: '25%',
      detail:
        '50 people who applied in the week of Oct 19, 2026. +5 points against the week before.',
      isSmallSample: false,
    });
  });

  it('marks a small sample and leaves out a change that would mislead', () => {
    expect(
      summarize(
        [
          buildPoint('2026-10-12', 0.2, { size: 40 }),
          buildPoint('2026-10-19', 0.5, { size: 14 }),
        ],
        'OVERALL_CONVERSION',
      ),
    ).toEqual({
      value: '50%',
      detail: '14 people who applied in the week of Oct 19, 2026.',
      isSmallSample: true,
    });
  });

  it('calls a rate in a running period so far and shows no change', () => {
    const summary = summarize(
      [
        buildPoint('2027-02-01', 0.3, { size: 60 }),
        buildPoint('2027-03-01', 0.35, { size: 40, isPartial: true }),
      ],
      'DROP_OFF',
      'MONTH',
    );

    expect(summary?.detail).toBe('40 people who applied so far in Mar 2027.');
    expect(summary?.isSmallSample).toBe(true);
  });

  it('says one point in the singular', () => {
    const summary = summarize(
      [
        buildPoint('2027-01-01', 0.2, { size: 60 }),
        buildPoint('2027-02-01', 0.21, { size: 60 }),
      ],
      'OVERALL_CONVERSION',
      'MONTH',
    );

    expect(summary?.detail).toContain('+1 point against the month before');
  });

  it('names a month for a monthly rate', () => {
    expect(
      summarize(
        [buildPoint('2026-06-01', 0.3, { size: 40 })],
        'OVERALL_CONVERSION',
        'MONTH',
      )?.detail,
    ).toBe('40 people who applied in Jun 2026.');
  });

  it('keeps one decimal on median days and says how many stays', () => {
    expect(
      summarize(
        [
          buildPoint('2026-10-26', 4, { size: 40 }),
          buildPoint('2026-11-02', 5.5, { size: 40 }),
        ],
        'MEDIAN_DAYS',
      ),
    ).toEqual({
      value: '5.5',
      detail:
        'Week of Nov 2, 2026, from 40 completed stays. +1.5 days against the week before.',
      isSmallSample: false,
    });
  });
});
