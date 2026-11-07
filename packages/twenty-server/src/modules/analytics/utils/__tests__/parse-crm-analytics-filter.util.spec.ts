import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  parseCrmAnalyticsFilter,
  parseCrmAnalyticsGroupBy,
  parseCrmAnalyticsLocalDate,
  parseCrmAnalyticsReportPeriodType,
  parseCrmAnalyticsStageKey,
  parseCrmAnalyticsTrendMetric,
} from 'src/modules/analytics/utils/parse-crm-analytics-filter.util';

describe('parseCrmAnalyticsFilter', () => {
  it.each([[null], [undefined], [{}]])(
    'gives null keys, status ALL and period WEEK for %j',
    (input) => {
      expect(parseCrmAnalyticsFilter(input)).toEqual({
        dateFrom: null,
        dateTo: null,
        trackKey: null,
        programKey: null,
        sourceKey: null,
        status: 'ALL',
        period: 'WEEK',
      });
    },
  );

  it('treats explicit nulls as not set', () => {
    expect(
      parseCrmAnalyticsFilter({
        dateFrom: null,
        trackKey: null,
        status: null,
        period: null,
      }).status,
    ).toBe('ALL');
  });

  it('keeps valid values', () => {
    expect(
      parseCrmAnalyticsFilter({
        dateFrom: '2026-10-27',
        dateTo: '2026-11-07',
        trackKey: 'ROBOTICS',
        programKey: 'FINANCE_INTERN',
        sourceKey: 'LINKEDIN',
        status: 'EXITED',
        period: 'MONTH',
      }),
    ).toEqual({
      dateFrom: '2026-10-27',
      dateTo: '2026-11-07',
      trackKey: 'ROBOTICS',
      programKey: 'FINANCE_INTERN',
      sourceKey: 'LINKEDIN',
      status: 'EXITED',
      period: 'MONTH',
    });
  });

  it('accepts a one-day range', () => {
    expect(
      parseCrmAnalyticsFilter({ dateFrom: '2026-11-07', dateTo: '2026-11-07' })
        .dateFrom,
    ).toBe('2026-11-07');
  });

  it.each([
    ['a wrong date format', { dateFrom: '07/11/2026' }],
    ['a date with a time', { dateTo: '2026-11-07T00:00:00Z' }],
    ['an impossible date', { dateFrom: '2026-02-30' }],
    ['a date Postgres rejects', { dateFrom: '0000-01-01' }],
    ['a date too old for its previous period', { dateFrom: '0500-01-01' }],
    ['a date just under the floor', { dateTo: '1999-12-31' }],
    ['an empty date', { dateTo: '' }],
    ['a range that ends before it starts', { dateFrom: '2026-11-08', dateTo: '2026-11-07' }],
    ['an unknown status', { status: 'DELETED' }],
    ['a status in the wrong case', { status: 'active' }],
    ['an unknown period', { period: 'YEAR' }],
    ['an empty key', { trackKey: '' }],
    ['a key over 200 characters', { sourceKey: 'x'.repeat(201) }],
    ['a null byte in a key', { programKey: 'FINANCE\0' }],
  ])('throws on %s', (_description, input) => {
    expect(() => parseCrmAnalyticsFilter(input)).toThrow(UserInputError);
  });

  it('accepts the first day of the date floor', () => {
    expect(parseCrmAnalyticsFilter({ dateFrom: '2000-01-01' }).dateFrom).toBe(
      '2000-01-01',
    );
  });

  it('accepts a key of exactly 200 characters', () => {
    const sourceKey = 'x'.repeat(200);

    expect(parseCrmAnalyticsFilter({ sourceKey }).sourceKey).toBe(sourceKey);
  });
});

describe('the other query arguments', () => {
  it('accepts every allowed literal', () => {
    expect(parseCrmAnalyticsGroupBy('SOURCE')).toBe('SOURCE');
    expect(parseCrmAnalyticsTrendMetric('MEDIAN_DAYS')).toBe('MEDIAN_DAYS');
    expect(parseCrmAnalyticsReportPeriodType('MONTH')).toBe('MONTH');
    expect(parseCrmAnalyticsLocalDate('2026-11-02', 'periodStart')).toBe(
      '2026-11-02',
    );
  });

  it('throws on anything else', () => {
    expect(() => parseCrmAnalyticsGroupBy('POSITION')).toThrow(UserInputError);
    expect(() => parseCrmAnalyticsTrendMetric('REVENUE')).toThrow(
      UserInputError,
    );
    expect(() => parseCrmAnalyticsReportPeriodType('DAY')).toThrow(
      UserInputError,
    );
    expect(() => parseCrmAnalyticsLocalDate('2026-13-01', 'periodStart')).toThrow(
      UserInputError,
    );
    expect(() => parseCrmAnalyticsLocalDate('1999-12-31', 'periodStart')).toThrow(
      UserInputError,
    );
  });

  it('leaves a missing stage key null and limits its length', () => {
    expect(parseCrmAnalyticsStageKey(null)).toBeNull();
    expect(parseCrmAnalyticsStageKey(undefined)).toBeNull();
    expect(parseCrmAnalyticsStageKey('NEW')).toBe('NEW');
    expect(() => parseCrmAnalyticsStageKey('x'.repeat(201))).toThrow(
      UserInputError,
    );
  });
});
