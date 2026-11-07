import { isAnalyticsPeriodFullyTracked } from '@/crm-analytics/utils/isAnalyticsPeriodFullyTracked';

const AT_MIDNIGHT = {
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
};

describe('isAnalyticsPeriodFullyTracked', () => {
  it('accepts a period starting on the day tracking started', () => {
    expect(isAnalyticsPeriodFullyTracked('2026-10-27', AT_MIDNIGHT)).toBe(true);
  });

  it('accepts a later period and rejects an earlier one', () => {
    expect(isAnalyticsPeriodFullyTracked('2026-11-02', AT_MIDNIGHT)).toBe(true);
    expect(isAnalyticsPeriodFullyTracked('2026-10-26', AT_MIDNIGHT)).toBe(
      false,
    );
  });

  it('rejects the day tracking started partway through', () => {
    const partway = { ...AT_MIDNIGHT, trackingStartedAt: '2026-10-27T09:30:00.000Z' };

    expect(isAnalyticsPeriodFullyTracked('2026-10-27', partway)).toBe(false);
    expect(isAnalyticsPeriodFullyTracked('2026-10-28', partway)).toBe(true);
  });

  it('reads the start in the reporting time zone', () => {
    const inKarachi = {
      trackingStartedAt: '2026-10-26T19:00:00.000Z',
      reportingTimeZone: 'Asia/Karachi',
    };

    expect(isAnalyticsPeriodFullyTracked('2026-10-27', inKarachi)).toBe(true);
    expect(isAnalyticsPeriodFullyTracked('2026-10-26', inKarachi)).toBe(false);
  });
});
