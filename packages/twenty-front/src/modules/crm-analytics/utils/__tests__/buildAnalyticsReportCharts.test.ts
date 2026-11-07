import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
  type AnalyticsCohortRow,
} from '@/crm-analytics/types/AnalyticsApi';
import {
  buildAnalyticsCategoryPeopleRows,
  buildAnalyticsCategoryRateRows,
} from '@/crm-analytics/utils/buildAnalyticsCategoryBarRows';
import { buildAnalyticsCohortHeatmap } from '@/crm-analytics/utils/buildAnalyticsCohortHeatmap';

const BASE = {
  asOf: '2026-11-02T02:30:00.000Z',
  trackingStartedAt: '2026-08-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

const formatNumber = (value: number) => value.toLocaleString('en-US');

const buildCategoryRow = (
  overrides: Partial<AnalyticsCategoryRow>,
): AnalyticsCategoryRow => ({
  key: 'ROBOTICS',
  parentKey: null,
  label: 'Robotics',
  isUnmapped: false,
  people: 50,
  activePeople: 20,
  newApplications: 3,
  cohortSize: 40,
  overallEligible: 40,
  overallRate: 0.2,
  overallSoFarRate: 0.1,
  stepRates: [],
  ...overrides,
});

const buildCategories = (rows: AnalyticsCategoryRow[]): AnalyticsCategories => ({
  ...BASE,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 100,
  peopleInSeveral: 0,
  peopleInSeveralTracks: 0,
  stepStageKeys: [],
  rows,
});

describe('buildAnalyticsCategoryRateRows', () => {
  it('ranks measured rates, then so far, then unknown, with catch-all rows apart', () => {
    const { rows, dividedRows } = buildAnalyticsCategoryRateRows(
      buildCategories([
        buildCategoryRow({
          key: 'UNKNOWN_RATE',
          overallRate: null,
          overallSoFarRate: null,
          overallEligible: 0,
        }),
        buildCategoryRow({
          key: 'SO_FAR',
          overallRate: null,
          overallSoFarRate: 0.9,
          overallEligible: 0,
        }),
        buildCategoryRow({ key: 'LOW', overallRate: 0.1 }),
        buildCategoryRow({ key: 'HIGH', overallRate: 0.4 }),
        buildCategoryRow({ key: 'NONE', overallRate: 0.8 }),
        buildCategoryRow({
          key: 'PROGRAM',
          parentKey: 'HIGH',
          overallRate: 0.99,
        }),
      ]),
      formatNumber,
    );

    expect(rows.map(({ key }) => key)).toEqual([
      'HIGH',
      'LOW',
      'SO_FAR',
      'UNKNOWN_RATE',
    ]);
    expect(dividedRows.map(({ key }) => key)).toEqual(['NONE']);
    expect(rows[2]).toMatchObject({
      valueLabel: '90% so far',
      isSmallSample: true,
    });
    expect(rows[3].segments).toEqual([]);
  });

  it('never lets a tiny group outrank a firm rate', () => {
    const { rows } = buildAnalyticsCategoryRateRows(
      buildCategories([
        buildCategoryRow({
          key: 'SO_FAR',
          overallRate: null,
          overallSoFarRate: 0.9,
          overallEligible: 0,
        }),
        buildCategoryRow({
          key: 'TINY',
          overallRate: 1,
          overallEligible: 1,
        }),
        buildCategoryRow({
          key: 'FIRM',
          overallRate: 0.4,
          overallEligible: 200,
        }),
      ]),
      formatNumber,
    );

    expect(rows.map(({ key }) => key)).toEqual(['FIRM', 'TINY', 'SO_FAR']);
  });
});

describe('buildAnalyticsCategoryPeopleRows', () => {
  const getNewApplicationsLabel = (categories: AnalyticsCategories) =>
    buildAnalyticsCategoryPeopleRows(categories, formatNumber).rows[0].tooltip
      ?.rows[3].label;

  it('says which dates new applications cover when the payload has them', () => {
    const categories = buildCategories([buildCategoryRow({})]);

    expect(getNewApplicationsLabel(categories)).toBe('New applications');
    expect(
      getNewApplicationsLabel({
        ...categories,
        newApplicationsFrom: '2026-11-02',
        newApplicationsTo: '2026-11-08',
      }),
    ).toBe('New applications, Nov 2 to Nov 8');
  });
});

describe('buildAnalyticsCohortHeatmap', () => {
  const COHORT: AnalyticsCohortRow = {
    bucketStart: '2026-10-01',
    size: 40,
    cells: [
      {
        stageKey: 'NEW',
        entered: 40,
        eligible: 40,
        rate: 0.5,
        soFarRate: 0.5,
        isMature: true,
      },
      {
        stageKey: 'CONTACTED',
        entered: 20,
        eligible: 5,
        rate: 0.2,
        soFarRate: 0.1,
        isMature: false,
      },
    ],
    overallRate: null,
    overallSoFarRate: null,
  };

  it('labels steps, marks what is in progress and leaves unknown blank', () => {
    const { columns, rows } = buildAnalyticsCohortHeatmap({
      cohorts: [COHORT],
      stages: [
        { stageKey: 'NEW', label: 'New' },
        { stageKey: 'CONTACTED', label: 'Contacted' },
        { stageKey: 'SIGNED', label: 'Signed' },
      ],
      period: 'MONTH',
      minimumSample: 30,
      formatNumber,
    });

    expect(columns.map(({ label }) => label)).toEqual([
      'New to Contacted',
      'Contacted to Signed',
      'Overall',
    ]);
    expect(rows[0].cells[0]).toMatchObject({ value: 0.5 });
    expect(rows[0].cells[1]).toMatchObject({ value: 0.1, isInProgress: true });
    expect(rows[0].cells[2]).toMatchObject({ value: null });
    expect(rows[0].cells[0].tooltip?.title).toBe(
      'People who applied in Oct 2026, New to Contacted',
    );
    expect(rows[0].cells[1].tooltip?.title).toBe(
      'People who applied in Oct 2026, Contacted to Signed',
    );
    expect(rows[0].cells[2].tooltip?.title).toBe(
      'People who applied in Oct 2026, overall',
    );
  });
});
