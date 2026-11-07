import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { type AnalyticsCategoryRow } from '@/crm-analytics/types/AnalyticsApi';
import { getAnalyticsCategoryChartRows } from '@/crm-analytics/utils/getAnalyticsCategoryChartRows';
import { getAnalyticsCategoryClickFilter } from '@/crm-analytics/utils/getAnalyticsCategoryClickFilter';

const buildRow = (
  key: string,
  parentKey: string | null = null,
): AnalyticsCategoryRow => ({
  key,
  parentKey,
  label: key,
  isUnmapped: false,
  people: 10,
  activePeople: 5,
  newApplications: null,
  cohortSize: 5,
  overallEligible: 5,
  overallRate: null,
  overallSoFarRate: null,
  stepRates: [],
});

const ROWS = [buildRow('AI'), buildRow('ML', 'AI'), buildRow('DESIGN')];

const getKeys = (rows: AnalyticsCategoryRow[]) => rows.map(({ key }) => key);

describe('getAnalyticsCategoryChartRows', () => {
  it('draws tracks only, so nobody counts twice', () => {
    expect(
      getKeys(
        getAnalyticsCategoryChartRows(
          { groupBy: 'TRACK_PROGRAM', rows: ROWS },
          CRM_ANALYTICS_DEFAULT_FILTER,
        ),
      ),
    ).toEqual(['AI', 'DESIGN']);
  });

  it('expands a chosen track to its programs', () => {
    expect(
      getKeys(
        getAnalyticsCategoryChartRows(
          { groupBy: 'TRACK_PROGRAM', rows: ROWS.slice(0, 2) },
          { trackKey: 'AI', programKey: null },
        ),
      ),
    ).toEqual(['ML']);
  });

  it('keeps the track when it has no programs to expand to', () => {
    expect(
      getKeys(
        getAnalyticsCategoryChartRows(
          { groupBy: 'TRACK_PROGRAM', rows: [buildRow('NONE')] },
          { trackKey: 'NONE', programKey: null },
        ),
      ),
    ).toEqual(['NONE']);
  });

  it('keeps a program whose track is not in the payload', () => {
    expect(
      getKeys(
        getAnalyticsCategoryChartRows(
          { groupBy: 'TRACK_PROGRAM', rows: [buildRow('ML', 'AI')] },
          CRM_ANALYTICS_DEFAULT_FILTER,
        ),
      ),
    ).toEqual(['ML']);
  });

  it('draws every source', () => {
    expect(
      getKeys(
        getAnalyticsCategoryChartRows(
          { groupBy: 'SOURCE', rows: [buildRow('ADS'), buildRow('BOARD')] },
          CRM_ANALYTICS_DEFAULT_FILTER,
        ),
      ),
    ).toEqual(['ADS', 'BOARD']);
  });
});

describe('getAnalyticsCategoryClickFilter', () => {
  it('sets a track and clears its program', () => {
    expect(
      getAnalyticsCategoryClickFilter(buildRow('AI'), 'TRACK_PROGRAM', {
        ...CRM_ANALYTICS_DEFAULT_FILTER,
        programKey: 'OTHER',
      }),
    ).toMatchObject({ trackKey: 'AI', programKey: null });
  });

  it('sets a program with its own track', () => {
    expect(
      getAnalyticsCategoryClickFilter(
        buildRow('ML', 'AI'),
        'TRACK_PROGRAM',
        CRM_ANALYTICS_DEFAULT_FILTER,
      ),
    ).toMatchObject({ trackKey: 'AI', programKey: 'ML' });
  });

  it('clears a program clicked again and keeps its track', () => {
    expect(
      getAnalyticsCategoryClickFilter(buildRow('ML', 'AI'), 'TRACK_PROGRAM', {
        ...CRM_ANALYTICS_DEFAULT_FILTER,
        trackKey: 'AI',
        programKey: 'ML',
      }),
    ).toMatchObject({ trackKey: 'AI', programKey: null });
  });

  it('sets and clears a source without touching tracks', () => {
    const filter = { ...CRM_ANALYTICS_DEFAULT_FILTER, trackKey: 'AI' };

    expect(
      getAnalyticsCategoryClickFilter(buildRow('ADS'), 'SOURCE', filter),
    ).toMatchObject({ trackKey: 'AI', sourceKey: 'ADS' });
    expect(
      getAnalyticsCategoryClickFilter(buildRow('ADS'), 'SOURCE', {
        ...filter,
        sourceKey: 'ADS',
      }),
    ).toMatchObject({ trackKey: 'AI', sourceKey: null });
  });
});
