import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { buildOverviewTakeaway } from '@/crm-analytics/utils/buildOverviewTakeaway';

const formatNumber = (value: number) => value.toLocaleString('en-US');

const buildOverview = ({
  activePeople = 1284,
  stuckPeople = 214,
  totalContacts = 42975,
  hasLimits = true,
  stageTotals = [],
}: {
  activePeople?: number;
  stuckPeople?: number;
  totalContacts?: number;
  hasLimits?: boolean;
  stageTotals?: AnalyticsOverview['stageTotals'];
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
  stageTotals,
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

  it('says who is left out when a stage is not mapped', () => {
    const buildUnmappedRow = (rawStage: string, count: number) => ({
      rowKey: `UNMAPPED:${rawStage}`,
      label: rawStage,
      rowKind: 'UNMAPPED' as const,
      parentStageKey: null,
      count,
      pastLimitCount: null,
    });

    expect(
      buildOverviewTakeaway({
        overview: buildOverview({
          stageTotals: [
            buildUnmappedRow('LEGACY', 1000),
            buildUnmappedRow('OLD', 200),
          ],
        }),
        formatNumber,
      }),
    ).toBe(
      '1,284 active people, 214 past their stage limit. 1,200 people have a stage not yet mapped and are not counted as active or stuck.',
    );
    expect(
      buildOverviewTakeaway({
        overview: buildOverview({
          hasLimits: false,
          stageTotals: [buildUnmappedRow('OLD', 1)],
        }),
        formatNumber,
      }),
    ).toBe(
      '1,284 active people. No stage limits are set. 1 person has a stage not yet mapped and is not counted as active or stuck.',
    );
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
