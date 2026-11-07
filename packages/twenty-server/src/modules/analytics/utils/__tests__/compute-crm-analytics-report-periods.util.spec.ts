import {
  addCrmAnalyticsLocalDays,
  addCrmAnalyticsPeriods,
  computeCrmAnalyticsLocalDate,
  computeCrmAnalyticsLocalDayStart,
  computeCrmAnalyticsPeriodStart,
  computeCrmAnalyticsPreviousReportPeriod,
  computeCrmAnalyticsReportPeriods,
  computeCrmAnalyticsTrendBuckets,
  countCrmAnalyticsLocalDays,
  toCrmAnalyticsIsoString,
} from 'src/modules/analytics/utils/compute-crm-analytics-report-periods.util';

// 2026-10-27 is a Tuesday, so the first whole week starts on Monday 2026-11-02.
const TRACKING_START = '2026-10-27T00:00:00.000Z';

const computePeriods = ({
  now,
  timeZone = 'UTC',
  trackingStartAt = TRACKING_START,
  existingPeriods = [],
  limit,
}: {
  now: string;
  timeZone?: string;
  trackingStartAt?: string;
  existingPeriods?: { periodType: string; periodStart: string }[];
  limit?: number;
}) =>
  computeCrmAnalyticsReportPeriods({
    trackingStartAt,
    now,
    timeZone,
    existingPeriods,
    limit,
  });

describe('computeCrmAnalyticsReportPeriods', () => {
  describe('finished periods', () => {
    it('gives nothing while the first whole week is still running', () => {
      expect(computePeriods({ now: '2026-11-08T23:59:59.000Z' })).toEqual([]);
    });

    it('gives the week once it has ended', () => {
      expect(computePeriods({ now: '2026-11-09T00:00:00.000Z' })).toEqual([
        {
          periodType: 'WEEK',
          periodStart: '2026-11-02',
          periodEnd: '2026-11-09',
        },
      ]);
    });

    it('skips the partial week and month that tracking start falls in', () => {
      const periods = computePeriods({ now: '2026-12-15T00:00:00.000Z' });

      expect(periods[0].periodStart).toBe('2026-11-02');
      expect(
        periods.filter(({ periodType }) => periodType === 'MONTH'),
      ).toEqual([
        {
          periodType: 'MONTH',
          periodStart: '2026-11-01',
          periodEnd: '2026-12-01',
        },
      ]);
    });

    it('counts a period that starts exactly at tracking start', () => {
      const periods = computePeriods({
        trackingStartAt: '2026-11-02T00:00:00.000Z',
        now: '2026-11-09T00:00:00.000Z',
      });

      expect(periods).toEqual([
        {
          periodType: 'WEEK',
          periodStart: '2026-11-02',
          periodEnd: '2026-11-09',
        },
      ]);
    });

    it('skips a Monday that tracking start falls part way through', () => {
      const periods = computePeriods({
        trackingStartAt: '2026-11-02T00:00:01.000Z',
        now: '2026-11-15T00:00:00.000Z',
      });

      expect(periods).toEqual([]);
    });
  });

  describe('local boundaries', () => {
    const KARACHI = 'Asia/Karachi';

    it('ends the week at Monday midnight in the reporting zone, not in UTC', () => {
      // 19:00 UTC on Sunday 8 November is 00:00 on Monday 9 November in Karachi (UTC+5).
      expect(
        computePeriods({ now: '2026-11-08T19:00:00.000Z', timeZone: KARACHI }),
      ).toEqual([
        {
          periodType: 'WEEK',
          periodStart: '2026-11-02',
          periodEnd: '2026-11-09',
        },
      ]);
      expect(
        computePeriods({ now: '2026-11-08T18:59:59.000Z', timeZone: KARACHI }),
      ).toEqual([]);
      expect(
        computePeriods({ now: '2026-11-08T19:00:00.000Z', timeZone: 'UTC' }),
      ).toEqual([]);
    });

    it('reads tracking start in the reporting zone', () => {
      // 19:00 UTC on Sunday 1 November is exactly Monday midnight in Karachi.
      expect(
        computePeriods({
          trackingStartAt: '2026-11-01T19:00:00.000Z',
          now: '2026-11-08T19:00:00.000Z',
          timeZone: KARACHI,
        })[0],
      ).toEqual({
        periodType: 'WEEK',
        periodStart: '2026-11-02',
        periodEnd: '2026-11-09',
      });
    });

    it('ends the month at local midnight on the first', () => {
      const monthPeriods = (now: string) =>
        computePeriods({ now, timeZone: KARACHI }).filter(
          ({ periodType }) => periodType === 'MONTH',
        );

      // 19:00 UTC on 30 November is 00:00 on 1 December in Karachi.
      expect(monthPeriods('2026-11-30T18:59:59.000Z')).toEqual([]);
      expect(monthPeriods('2026-11-30T19:00:00.000Z')).toEqual([
        {
          periodType: 'MONTH',
          periodStart: '2026-11-01',
          periodEnd: '2026-12-01',
        },
      ]);
    });

    it('handles the year end and February', () => {
      const months = computePeriods({
        now: '2027-03-01T00:00:00.000Z',
        limit: 100,
      }).filter(({ periodType }) => periodType === 'MONTH');

      expect(months.map(({ periodStart }) => periodStart)).toEqual([
        '2026-11-01',
        '2026-12-01',
        '2027-01-01',
        '2027-02-01',
      ]);
      expect(months[3].periodEnd).toBe('2027-03-01');
    });
  });

  describe('existing reports and the cap', () => {
    it('skips existing periods of that type only', () => {
      const periods = computePeriods({
        now: '2026-12-01T00:00:00.000Z',
        existingPeriods: [
          { periodType: 'WEEK', periodStart: '2026-11-02' },
          { periodType: 'MONTH', periodStart: '2026-11-09' },
        ],
      });

      expect(
        periods.map(({ periodType, periodStart }) => [periodType, periodStart]),
      ).toEqual([
        ['WEEK', '2026-11-09'],
        ['WEEK', '2026-11-16'],
        ['WEEK', '2026-11-23'],
        ['MONTH', '2026-11-01'],
      ]);
    });

    it('caps a run at 8, oldest first, leaving the rest for the next run', () => {
      const first = computePeriods({ now: '2027-06-01T00:00:00.000Z' });

      expect(first).toHaveLength(8);
      expect(first.map(({ periodEnd }) => periodEnd)).toEqual(
        [...first.map(({ periodEnd }) => periodEnd)].sort(),
      );
      expect(first[0].periodEnd).toBe('2026-11-09');

      const second = computePeriods({
        now: '2027-06-01T00:00:00.000Z',
        existingPeriods: first,
      });

      expect(second).toHaveLength(8);
      expect(second[0].periodEnd > first[7].periodEnd).toBe(true);
    });

    it('never lists a period twice', () => {
      const periods = computePeriods({
        now: '2027-06-01T00:00:00.000Z',
        limit: 1000,
      });
      const keys = periods.map(
        ({ periodType, periodStart }) => `${periodType}:${periodStart}`,
      );

      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});

describe('computeCrmAnalyticsPreviousReportPeriod', () => {
  it('steps back one week', () => {
    expect(
      computeCrmAnalyticsPreviousReportPeriod({
        periodType: 'WEEK',
        periodStart: '2026-11-02',
        periodEnd: '2026-11-09',
      }),
    ).toEqual({
      periodType: 'WEEK',
      periodStart: '2026-10-26',
      periodEnd: '2026-11-02',
    });
  });

  it('steps back one calendar month', () => {
    expect(
      computeCrmAnalyticsPreviousReportPeriod({
        periodType: 'MONTH',
        periodStart: '2027-03-01',
        periodEnd: '2027-04-01',
      }),
    ).toEqual({
      periodType: 'MONTH',
      periodStart: '2027-02-01',
      periodEnd: '2027-03-01',
    });
  });
});

describe('computeCrmAnalyticsTrendBuckets', () => {
  const LOCAL_TODAY = '2026-11-07';

  const computeBuckets = (
    period: 'DAY' | 'WEEK' | 'MONTH',
    dateFrom: string | null = null,
    dateTo: string | null = null,
  ) =>
    computeCrmAnalyticsTrendBuckets({
      dateFrom,
      dateTo,
      period,
      localToday: LOCAL_TODAY,
    });

  it('defaults to 30 days, 12 weeks or 12 months ending in the current one', () => {
    expect(computeBuckets('DAY')).toHaveLength(30);
    expect(computeBuckets('WEEK')).toHaveLength(12);
    expect(computeBuckets('MONTH')).toHaveLength(12);

    expect(computeBuckets('DAY').at(-1)?.bucketStart).toBe('2026-11-07');
    expect(computeBuckets('WEEK').at(-1)?.bucketStart).toBe('2026-11-02');
    expect(computeBuckets('MONTH').at(-1)?.bucketStart).toBe('2026-11-01');
    expect(computeBuckets('MONTH')[0].bucketStart).toBe('2025-12-01');
  });

  it('gives only overall conversion by week a longer default', () => {
    const computeMetricBuckets = (
      metric: 'OVERALL_CONVERSION' | 'DROP_OFF',
      period: 'WEEK' | 'MONTH',
      dateFrom: string | null = null,
    ) =>
      computeCrmAnalyticsTrendBuckets({
        dateFrom,
        dateTo: null,
        period,
        localToday: LOCAL_TODAY,
        metric,
      });

    const overallByWeek = computeMetricBuckets('OVERALL_CONVERSION', 'WEEK');

    expect(overallByWeek).toHaveLength(26);
    expect(overallByWeek[0].bucketStart).toBe('2026-05-11');
    expect(overallByWeek[25].bucketStart).toBe('2026-11-02');
    expect(overallByWeek[25].previousBucketStart).toBe('2026-05-04');

    expect(computeMetricBuckets('DROP_OFF', 'WEEK')).toHaveLength(12);
    expect(computeMetricBuckets('OVERALL_CONVERSION', 'MONTH')).toHaveLength(
      12,
    );
    expect(
      computeMetricBuckets('OVERALL_CONVERSION', 'WEEK', '2026-10-26'),
    ).toHaveLength(2);
  });

  it('pairs each bucket with the one the same count of buckets before', () => {
    const buckets = computeBuckets('WEEK');

    expect(buckets[0]).toEqual({
      bucketStart: '2026-08-17',
      previousBucketStart: '2026-05-25',
      isPartial: false,
    });
    expect(buckets[11].previousBucketStart).toBe('2026-08-10');
  });

  it('marks only the bucket holding today as partial', () => {
    expect(
      computeBuckets('MONTH').filter(({ isPartial }) => isPartial),
    ).toEqual([
      {
        bucketStart: '2026-11-01',
        previousBucketStart: '2025-11-01',
        isPartial: true,
      },
    ]);
  });

  it('snaps a date filter to whole periods', () => {
    const buckets = computeBuckets('WEEK', '2026-10-28', '2026-11-03');

    expect(buckets.map(({ bucketStart }) => bucketStart)).toEqual([
      '2026-10-26',
      '2026-11-02',
    ]);
    expect(buckets[0].previousBucketStart).toBe('2026-10-12');
  });

  it('does not run past today, even with a later date filter', () => {
    expect(
      computeBuckets('DAY', '2026-11-05', '2026-12-31').map(
        ({ bucketStart }) => bucketStart,
      ),
    ).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
  });

  it('keeps a past date filter out of the partial state', () => {
    expect(
      computeBuckets('DAY', '2026-10-01', '2026-10-02').some(
        ({ isPartial }) => isPartial,
      ),
    ).toBe(false);
  });

  it('gives no buckets when the filter starts in the future', () => {
    expect(computeBuckets('DAY', '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('keeps the latest 60 buckets of a long range', () => {
    const buckets = computeBuckets('DAY', '2020-01-01', LOCAL_TODAY);

    expect(buckets).toHaveLength(60);
    expect(buckets[59].bucketStart).toBe(LOCAL_TODAY);
    expect(buckets[0].bucketStart).toBe('2026-09-09');
    expect(buckets[59].previousBucketStart).toBe('2026-09-08');
  });
});

describe('local date helpers', () => {
  it('reads an instant as a local date', () => {
    expect(
      computeCrmAnalyticsLocalDate('2026-11-08T19:00:00.000Z', 'Asia/Karachi'),
    ).toBe('2026-11-09');
    expect(computeCrmAnalyticsLocalDate('2026-11-08T19:00:00.000Z', 'UTC')).toBe(
      '2026-11-08',
    );
  });

  it('gives the instant a local day starts', () => {
    expect(computeCrmAnalyticsLocalDayStart('2026-11-09', 'UTC')).toBe(
      '2026-11-09T00:00:00Z',
    );
    expect(computeCrmAnalyticsLocalDayStart('2026-11-09', 'Asia/Karachi')).toBe(
      '2026-11-08T19:00:00Z',
    );
  });

  it('starts weeks on Monday, like date_trunc', () => {
    expect(computeCrmAnalyticsPeriodStart('2026-11-08', 'WEEK')).toBe(
      '2026-11-02',
    );
    expect(computeCrmAnalyticsPeriodStart('2026-11-09', 'WEEK')).toBe(
      '2026-11-09',
    );
    expect(computeCrmAnalyticsPeriodStart('2026-11-08', 'MONTH')).toBe(
      '2026-11-01',
    );
    expect(computeCrmAnalyticsPeriodStart('2026-11-08', 'DAY')).toBe(
      '2026-11-08',
    );
  });

  it('adds and counts days and periods', () => {
    expect(addCrmAnalyticsLocalDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addCrmAnalyticsPeriods('2026-01-01', 'MONTH', -1)).toBe('2025-12-01');
    expect(addCrmAnalyticsPeriods('2026-11-02', 'WEEK', 1)).toBe('2026-11-09');
    expect(countCrmAnalyticsLocalDays('2026-11-01', '2026-11-07')).toBe(7);
    expect(countCrmAnalyticsLocalDays('2026-11-07', '2026-11-07')).toBe(1);
  });

  it('turns either driver timestamp form into an ISO string', () => {
    const iso = '2026-11-07T12:00:00.000Z';

    expect(toCrmAnalyticsIsoString(new Date(iso))).toBe(iso);
    expect(toCrmAnalyticsIsoString('2026-11-07 12:00:00+00')).toBe(iso);
  });
});
