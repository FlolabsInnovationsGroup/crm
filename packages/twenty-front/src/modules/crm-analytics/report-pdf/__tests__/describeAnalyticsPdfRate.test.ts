import { ANALYTICS_PDF_UNKNOWN_VALUE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfUnknownValue';
import { describeAnalyticsPdfRate } from '@/crm-analytics/report-pdf/utils/describeAnalyticsPdfRate';

const MINIMUM_SAMPLE = 30;

describe('describeAnalyticsPdfRate', () => {
  it('prints a firm rate plainly', () => {
    expect(
      describeAnalyticsPdfRate({
        rate: 0.62,
        sampleSize: 252,
        minimumSample: MINIMUM_SAMPLE,
      }),
    ).toEqual({
      ratio: 0.62,
      text: '62%',
      detail: null,
      shortDetail: null,
      isLighter: false,
    });
  });

  it('keeps a measured zero as 0%', () => {
    expect(
      describeAnalyticsPdfRate({
        rate: 0,
        sampleSize: 40,
        minimumSample: MINIMUM_SAMPLE,
      }).text,
    ).toBe('0%');
  });

  it('prints a small sample lighter with its count', () => {
    expect(
      describeAnalyticsPdfRate({
        rate: 0.5,
        sampleSize: 14,
        minimumSample: MINIMUM_SAMPLE,
      }),
    ).toEqual({
      ratio: 0.5,
      text: '50%',
      detail: 'of 14 people',
      shortDetail: 'of 14',
      isLighter: true,
    });
  });

  it('says so far when only a rate in progress is known', () => {
    expect(
      describeAnalyticsPdfRate({
        rate: null,
        soFarRate: 0.12,
        sampleSize: 0,
        minimumSample: MINIMUM_SAMPLE,
      }),
    ).toEqual({
      ratio: 0.12,
      text: '12%',
      detail: 'so far',
      shortDetail: 'so far',
      isLighter: true,
    });
  });

  it.each([
    { rate: null, soFarRate: null, sampleSize: null },
    { rate: null, soFarRate: 0, sampleSize: 12 },
    { rate: 0, soFarRate: 0, sampleSize: 0 },
  ])(
    'prints a dash, never 0%, for an unknown rate: %j',
    ({ rate, soFarRate, sampleSize }) => {
      expect(
        describeAnalyticsPdfRate({
          rate,
          soFarRate,
          sampleSize,
          minimumSample: MINIMUM_SAMPLE,
        }),
      ).toEqual({
        ratio: null,
        text: ANALYTICS_PDF_UNKNOWN_VALUE,
        detail: null,
        shortDetail: null,
        isLighter: true,
      });
    },
  );
});
