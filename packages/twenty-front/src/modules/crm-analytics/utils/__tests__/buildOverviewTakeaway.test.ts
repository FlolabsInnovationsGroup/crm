import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { buildOverviewTakeaway } from '@/crm-analytics/utils/buildOverviewTakeaway';

const formatNumber = (value: number) => value.toLocaleString('en-US');

const buildOverview = ({
  activePeople = 1284,
  stuckPeople = 214,
  totalContacts = 42975,
  hasLimits = true,
}: {
  activePeople?: number;
  stuckPeople?: number;
  totalContacts?: number;
  hasLimits?: boolean;
}): AnalyticsOverview => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  importedExcludedByDate: 0,
  figures: {
    totalContacts,
    activePeople,
    newApplications: 86,
    newApplicationsPrevious: 74,
    newApplicationsFrom: '2026-11-01',
    newApplicationsTo: '2026-11-07',
    importedApplications: 42371,
    stuckPeople,
    inactivePeople: 3810,
    signedPeople: null,
  },
  stageTotals: [],
  stuck: { rows: [], total: stuckPeople, hasLimits },
});

describe('buildOverviewTakeaway', () => {
  it('states active people and how many are past their limit', () => {
    expect(
      buildOverviewTakeaway({ overview: buildOverview({}), formatNumber }),
    ).toBe('1,284 active people, 214 past their stage limit.');
  });

  it('uses the singular for one person', () => {
    expect(
      buildOverviewTakeaway({
        overview: buildOverview({ activePeople: 1, stuckPeople: 0 }),
        formatNumber,
      }),
    ).toBe('1 active person, 0 past their stage limit.');
  });

  it('does not claim anyone is past a limit when no limits exist', () => {
    expect(
      buildOverviewTakeaway({
        overview: buildOverview({ hasLimits: false, stuckPeople: 0 }),
        formatNumber,
      }),
    ).toBe('1,284 active people. No stage limits are set.');
  });

  it('falls back to a neutral sentence without people', () => {
    expect(
      buildOverviewTakeaway({
        overview: buildOverview({ totalContacts: 0, activePeople: 0 }),
        formatNumber,
      }),
    ).toBe('No people match these filters.');
  });
});
