import { type AnalyticsCategoryRow } from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsCategoryAnswers } from '@/crm-analytics/utils/buildAnalyticsCategoryAnswers';

const buildRow = (
  row: Partial<AnalyticsCategoryRow> & { key: string; label: string },
): AnalyticsCategoryRow => ({
  parentKey: null,
  isUnmapped: false,
  people: 100,
  activePeople: 80,
  newApplications: 12,
  cohortSize: 60,
  overallEligible: 50,
  overallRate: 0.1,
  overallSoFarRate: null,
  stepRates: [],
  ...row,
});

const build = (rows: AnalyticsCategoryRow[]) =>
  buildAnalyticsCategoryAnswers({
    rows,
    groupBy: 'SOURCE',
    minimumSample: 30,
    stages: [{ stageKey: 'NEW', label: 'New' }],
    formatNumber: (value) => String(value),
  });

describe('buildAnalyticsCategoryAnswers', () => {
  it('names the largest, best and biggest drop', () => {
    const [largest, best, drop] = build([
      buildRow({ key: 'A', label: 'Ads', people: 300, overallRate: 0.1 }),
      buildRow({
        key: 'B',
        label: 'Board',
        people: 200,
        overallRate: 0.3,
        stepRates: [
          { stageKey: 'NEW', eligible: 40, rate: 0.2, soFarRate: 0.2 },
        ],
      }),
    ]);

    expect(largest).toMatchObject({ value: '300 people', detail: 'Ads' });
    expect(best).toMatchObject({ value: '30%', detail: 'Board, of 50 people' });
    expect(drop).toMatchObject({
      value: '80%',
      detail: 'Board: did not move on from New, of 40 people',
    });
  });

  it('does not crown a small group', () => {
    const [, best, drop] = build([
      buildRow({
        key: 'A',
        label: 'Ads',
        overallEligible: 12,
        overallRate: 0.9,
        stepRates: [
          { stageKey: 'NEW', eligible: 12, rate: 0.1, soFarRate: 0.1 },
        ],
      }),
    ]);

    expect(best.value).toBeNull();
    expect(drop.value).toBeNull();
  });

  it('never names the no-value or unmapped rows', () => {
    const [largest, best] = build([
      buildRow({ key: 'NONE', label: 'No source', people: 900 }),
      buildRow({
        key: 'raw',
        label: 'raw',
        isUnmapped: true,
        people: 800,
        overallRate: 0.9,
      }),
      buildRow({ key: 'A', label: 'Ads', people: 40, overallRate: 0.1 }),
    ]);

    expect(largest.detail).toBe('Ads');
    expect(best.detail).toBe('Ads, of 50 people');
  });

  it('has a dash and a reason when there is nothing to name', () => {
    const answers = build([]);

    expect(answers.map(({ value }) => value)).toEqual([null, null, null]);
    expect(answers[0].detail).toBe(
      'Not enough people in any group to compare yet',
    );
  });

  it('does not call a small group the largest', () => {
    const [largest] = build([
      buildRow({ key: 'A', label: 'Ads', people: 3 }),
      buildRow({ key: 'B', label: 'Board', people: 2 }),
    ]);

    expect(largest.value).toBeNull();
  });

  it('names no best group when none has converted', () => {
    const [, best] = build([
      buildRow({ key: 'A', label: 'Ads', overallRate: 0 }),
      buildRow({ key: 'B', label: 'Board', overallRate: 0 }),
    ]);

    expect(best).toMatchObject({
      value: null,
      detail: 'No group has converted yet',
    });
  });

  it('names no drop when everyone moved on', () => {
    const [, , drop] = build([
      buildRow({
        key: 'A',
        label: 'Ads',
        stepRates: [{ stageKey: 'NEW', eligible: 40, rate: 1, soFarRate: 1 }],
      }),
    ]);

    expect(drop).toMatchObject({
      value: null,
      detail: 'Everyone moved on at every step',
    });
  });

  it('says why when only catch-all rows are in view', () => {
    const answers = build([
      buildRow({ key: 'NONE', label: 'No source', people: 500 }),
    ]);

    expect(answers.map(({ detail }) => detail)).toEqual(
      Array(3).fill(
        'Only people with no value or an unmapped value are in view',
      ),
    );
  });

  it('reports a measured 0% conversion as a 100% drop', () => {
    const [, , drop] = build([
      buildRow({
        key: 'A',
        label: 'Ads',
        stepRates: [{ stageKey: 'NEW', eligible: 40, rate: 0, soFarRate: 0 }],
      }),
    ]);

    expect(drop.value).toBe('100%');
  });
});
