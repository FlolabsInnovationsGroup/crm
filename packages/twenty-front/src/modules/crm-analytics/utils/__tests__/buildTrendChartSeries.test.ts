import { buildTrendChartSeries } from '@/crm-analytics/utils/buildTrendChartSeries';

const formatBucketLabel = (bucketStart: string) => `Week of ${bucketStart}`;

describe('buildTrendChartSeries', () => {
  it('puts the gray previous series first and the blue current series last', () => {
    const series = buildTrendChartSeries({
      metric: 'NEW_APPLICATIONS',
      period: 'WEEK',
      formatBucketLabel,
      points: [
        {
          bucketStart: '2026-11-02',
          value: 12,
          previousValue: 9,
          size: null,
          isPartial: false,
        },
      ],
    });

    expect(series.map(({ color }) => color)).toEqual(['gray', 'blue']);
    expect(series[0].data).toEqual([{ x: 'Week of 2026-11-02', y: 9 }]);
    expect(series[1].data).toEqual([{ x: 'Week of 2026-11-02', y: 12 }]);
  });

  it('names each line by how far back it reaches', () => {
    const point = {
      value: 12,
      previousValue: 9,
      size: null,
      isPartial: false,
    };

    const series = buildTrendChartSeries({
      metric: 'NEW_APPLICATIONS',
      period: 'MONTH',
      formatBucketLabel,
      points: [
        { ...point, bucketStart: '2026-10-01' },
        { ...point, bucketStart: '2026-11-01' },
      ],
    });

    expect(series.map(({ label }) => label)).toEqual([
      '2 months before',
      'These 2 months',
    ]);
  });

  it('keeps null as null, never 0, so the line stops', () => {
    const series = buildTrendChartSeries({
      metric: 'OVERALL_CONVERSION',
      period: 'WEEK',
      formatBucketLabel,
      points: [
        {
          bucketStart: '2026-10-26',
          value: 0.2,
          previousValue: null,
          size: 40,
          isPartial: false,
        },
        {
          bucketStart: '2026-11-02',
          value: null,
          previousValue: 0.3,
          size: null,
          isPartial: true,
        },
      ],
    });

    expect(series[0].data.map(({ y }) => y)).toEqual([null, 30]);
    expect(series[1].data.map(({ y }) => y)).toEqual([20, null]);
  });

  it('scales rates to 0 to 100 and leaves other metrics alone', () => {
    const point = {
      bucketStart: '2026-11-02',
      value: 0.123,
      previousValue: null,
      size: 50,
      isPartial: false,
    };

    expect(
      buildTrendChartSeries({
        metric: 'DROP_OFF',
        period: 'WEEK',
        formatBucketLabel,
        points: [point],
      })[0].data[0].y,
    ).toBe(12.3);

    expect(
      buildTrendChartSeries({
        metric: 'MEDIAN_DAYS',
        period: 'WEEK',
        formatBucketLabel,
        points: [{ ...point, value: 4.5 }],
      })[0].data[0].y,
    ).toBe(4.5);
  });

  it('draws no previous line in the first period', () => {
    const series = buildTrendChartSeries({
      metric: 'NEW_APPLICATIONS',
      period: 'WEEK',
      formatBucketLabel,
      points: [
        {
          bucketStart: '2026-11-02',
          value: 12,
          previousValue: null,
          size: null,
          isPartial: false,
        },
      ],
    });

    expect(series.map(({ key }) => key)).toEqual(['current']);
  });
});
