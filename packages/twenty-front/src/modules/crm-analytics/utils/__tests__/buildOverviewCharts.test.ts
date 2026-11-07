import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
  type AnalyticsStageTotalRow,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsSparkline } from '@/crm-analytics/utils/buildAnalyticsSparkline';
import { buildCategoryBarRows } from '@/crm-analytics/utils/buildCategoryBarRows';
import { buildPipelineStatusSlices } from '@/crm-analytics/utils/buildPipelineStatusSlices';
import { buildStageTotalsChartRows } from '@/crm-analytics/utils/buildStageTotalsChartRows';

const formatNumber = (value: number) => value.toLocaleString('en-US');

const buildStageRow = (
  rowKey: string,
  rowKind: AnalyticsStageTotalRow['rowKind'],
  count: number,
  overrides: Partial<AnalyticsStageTotalRow> = {},
): AnalyticsStageTotalRow => ({
  rowKey,
  label: rowKey,
  rowKind,
  parentStageKey: null,
  count,
  pastLimitCount: null,
  inactiveCount: 0,
  ...overrides,
});

const STAGE_ROWS = [
  buildStageRow('NEW', 'MAIN', 100, { pastLimitCount: 30 }),
  buildStageRow('NEW:REMINDER', 'NESTED', 20, {
    label: 'New reminder',
    parentStageKey: 'NEW',
  }),
  buildStageRow('SIGNED', 'MAIN', 8),
  buildStageRow('NO_ANSWER', 'EXIT', 40),
  buildStageRow('REJECTED', 'EXIT', 0),
  buildStageRow('INTERESTED', 'OTHER', 5),
  buildStageRow('UNMAPPED:OLD', 'UNMAPPED', 3, { label: 'OLD' }),
  buildStageRow('NO_STAGE', 'NO_STAGE', 2),
];

describe('buildStageTotalsChartRows', () => {
  const { mainRows, otherRows } = buildStageTotalsChartRows({
    rows: STAGE_ROWS,
    formatNumber,
  });

  it('splits a main stage into within limit and past limit', () => {
    expect(
      mainRows[0].segments.map(({ label, value }) => [label, value]),
    ).toEqual([
      ['Within limit', 70],
      ['Past limit', 30],
    ]);
  });

  it('keeps inactive imported people out of within limit', () => {
    const {
      mainRows: [stageRow],
    } = buildStageTotalsChartRows({
      rows: [
        buildStageRow('NEW', 'MAIN', 503, {
          pastLimitCount: 3,
          inactiveCount: 500,
        }),
      ],
      formatNumber,
    });

    expect(
      stageRow.segments.map(({ label, value }) => [label, value]),
    ).toEqual([
      ['Within limit', 0],
      ['Past limit', 3],
      ['Inactive', 500],
    ]);
    expect(
      stageRow.tooltip?.rows.map(({ label, value }) => [label, value]),
    ).toEqual([
      ['Within limit', '0'],
      ['Past limit', '3'],
      ['Inactive', '500'],
    ]);
  });

  it('shows inactive people on a stage with no limit', () => {
    const {
      mainRows: [stageRow],
    } = buildStageTotalsChartRows({
      rows: [buildStageRow('SIGNED', 'MAIN', 10, { inactiveCount: 4 })],
      formatNumber,
    });

    expect(
      stageRow.tooltip?.rows.map(({ label, value }) => [label, value]),
    ).toEqual([
      ['People', '10'],
      ['Inactive', '4'],
    ]);
  });

  it('does not call a stage with no limit within limit', () => {
    expect(
      mainRows[1].segments.map(({ key, label, value }) => [key, label, value]),
    ).toEqual([['people', 'People', 8]]);
  });

  it('shows inactive people on a row outside the main steps', () => {
    const {
      otherRows: [stageRow],
    } = buildStageTotalsChartRows({
      rows: [buildStageRow('INTERESTED', 'OTHER', 100, { inactiveCount: 40 })],
      formatNumber,
    });

    expect(
      stageRow.tooltip?.rows.map(({ label, value }) => [label, value]),
    ).toEqual([
      ['People', '100'],
      ['Inactive', '40'],
    ]);
  });

  it('keeps reminders out of the bars and in the tooltip', () => {
    expect(mainRows.map(({ key }) => key)).toEqual(['NEW', 'SIGNED']);
    expect(mainRows[0].tooltip?.rows).toContainEqual({
      label: 'New reminder',
      value: '20',
    });
  });

  it('does not split a stage with no limit in its tooltip', () => {
    expect(mainRows[1].tooltip?.rows).toEqual([
      { label: 'People', value: '8' },
    ]);
  });

  it('puts the rest after the divider, skips empty rows and names unmapped ones', () => {
    expect(otherRows.map(({ label }) => label)).toEqual([
      'NO_ANSWER',
      'INTERESTED',
      'Unmapped: OLD',
      'No stage',
    ]);
  });
});

describe('buildPipelineStatusSlices', () => {
  it('adds up to everyone, with other stages counted as active', () => {
    const slices = buildPipelineStatusSlices({
      rows: STAGE_ROWS,
      stages: [
        { stageKey: 'NEW', isSuccess: false },
        { stageKey: 'SIGNED', isSuccess: true },
      ],
    });

    expect(slices.map(({ label, value }) => [label, value])).toEqual([
      ['Active', 105],
      ['Signed', 8],
      ['Left', 40],
      ['Not mapped or no stage', 5],
    ]);
  });

  it('leaves out a slice with nobody in it', () => {
    const slices = buildPipelineStatusSlices({
      rows: [buildStageRow('NEW', 'MAIN', 10)],
      stages: [],
    });

    expect(slices.map(({ key }) => key)).toEqual(['active']);
  });
});

const buildCategoryRow = (
  key: string,
  people: number,
  overrides: Partial<AnalyticsCategoryRow> = {},
): AnalyticsCategoryRow => ({
  key,
  parentKey: null,
  label: key,
  isUnmapped: false,
  people,
  activePeople: people,
  newApplications: null,
  cohortSize: 0,
  overallEligible: 0,
  overallRate: null,
  overallSoFarRate: null,
  stepRates: [],
  ...overrides,
});

const buildCategories = (
  groupBy: AnalyticsCategories['groupBy'],
  rows: AnalyticsCategoryRow[],
): AnalyticsCategories => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  groupBy,
  distinctPeople: 0,
  peopleInSeveral: 0,
  peopleInSeveralTracks: 0,
  stepStageKeys: [],
  rows,
});

describe('buildCategoryBarRows', () => {
  it('ranks tracks and leaves their programs out', () => {
    const { mainRows, catchAllRows } = buildCategoryBarRows({
      categories: buildCategories('TRACK_PROGRAM', [
        buildCategoryRow('DESIGN', 10),
        buildCategoryRow('AI', 40),
        buildCategoryRow('EMPTY', 0),
        buildCategoryRow('FRONTEND', 30, { parentKey: 'AI' }),
        buildCategoryRow('NONE', 500),
      ]),
      formatNumber,
    });

    expect(mainRows.map(({ key }) => key)).toEqual(['AI', 'DESIGN', 'EMPTY']);
    expect(catchAllRows.map(({ label }) => label)).toEqual(['No position']);
  });

  it('keeps the top sources and names an unmapped raw value', () => {
    const { mainRows, catchAllRows } = buildCategoryBarRows({
      categories: buildCategories('SOURCE', [
        buildCategoryRow('A', 1),
        buildCategoryRow('B', 2),
        buildCategoryRow('C', 3),
        buildCategoryRow('D', 0),
        buildCategoryRow('OLD_SOURCE', 9, { isUnmapped: true }),
        buildCategoryRow('NONE', 7),
      ]),
      maximumRows: 2,
      formatNumber,
    });

    expect(mainRows.map(({ key }) => key)).toEqual(['C', 'B']);
    expect(catchAllRows.map(({ label }) => label)).toEqual([
      'Unmapped: OLD_SOURCE',
      'No source',
    ]);
  });
});

const buildPoint = (
  value: number | null,
  isPartial = false,
): AnalyticsTrendPoint => ({
  bucketStart: '2026-11-02',
  value,
  previousValue: null,
  size: null,
  previousSize: null,
  isPartial,
});

describe('buildAnalyticsSparkline', () => {
  const buildSparkline = (
    points: AnalyticsTrendPoint[],
    metric: AnalyticsTrendMetric = 'ACTIVE_PEOPLE',
  ) =>
    buildAnalyticsSparkline({
      points,
      metric,
      label: 'Figure',
      minimumSample: 30,
      formatNumber,
    });

  it('drops an unfinished period and the time before the first known value', () => {
    const { values, marks } = buildSparkline([
      buildPoint(null),
      buildPoint(4),
      buildPoint(null),
      buildPoint(6),
      buildPoint(1, true),
    ]);

    expect(values).toEqual([4, null, 6]);
    expect(marks).toHaveLength(3);
    expect(marks[0].tooltip.title).toContain('Week of');
    expect(marks[0].tooltip.rows).toEqual([{ label: 'Figure', value: '4' }]);
    expect(marks[1].tooltip.rows[0].value).toBe('Not enough data');
  });

  it('is empty when nothing is known', () => {
    expect(buildSparkline([buildPoint(null)]).values).toEqual([]);
  });

  it('gives a rate its count and draws a small group lighter', () => {
    const { marks } = buildSparkline(
      [
        { ...buildPoint(0.25), size: 4 },
        { ...buildPoint(0.5), size: 40 },
      ],
      'OVERALL_CONVERSION',
    );

    expect(marks[0].tooltip.rows[0].value).toBe('25% of 4 people');
    expect(marks[0].isLighter).toBe(true);
    expect(marks[1].isLighter).toBe(false);
  });
});
