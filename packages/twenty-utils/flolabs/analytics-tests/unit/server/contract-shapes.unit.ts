import * as shapes from '../../blackbox/lib/contract-shapes.cjs';
import {
  buildCategories,
  buildEmptyFunnel,
  buildFunnel,
  buildMeta,
  buildOverview,
  buildReport,
  buildReportList,
  buildTrends,
} from '../../ui/lib/contract-api';

const PEOPLE = [
  { personId: '20202020-eeee-4000-8000-000000000101', displayName: 'First Person' },
  { personId: '20202020-eeee-4000-8000-000000000102', displayName: 'Second Person' },
];

describe('the UI layer answers with contract section 7 payloads', () => {
  it.each([
    ['meta', shapes.META, () => buildMeta()],
    ['meta with overrides', shapes.META, () => buildMeta({ state: 'DISABLED', fields: { stage: 'MISSING' } })],
    ['overview', shapes.OVERVIEW, () => buildOverview(PEOPLE)],
    ['funnel', shapes.FUNNEL, () => buildFunnel()],
    ['empty funnel', shapes.FUNNEL, () => buildEmptyFunnel()],
    ['categories by track', shapes.CATEGORIES, () => buildCategories({ groupBy: 'TRACK_PROGRAM' })],
    ['categories by source', shapes.CATEGORIES, () => buildCategories({ groupBy: 'SOURCE' })],
    ['count trends', shapes.TRENDS, () => buildTrends({ metric: 'TOTAL_CONTACTS', filter: { period: 'WEEK' } })],
    ['rate trends', shapes.TRENDS, () => buildTrends({ metric: 'OVERALL_CONVERSION', filter: { period: 'MONTH' } })],
    ['refused daily rate', shapes.TRENDS, () => buildTrends({ metric: 'DROP_OFF', filter: { period: 'DAY' } })],
    ['report list', shapes.REPORT_LIST, () => buildReportList()],
    ['weekly report', shapes.REPORT, () => buildReport({ periodType: 'WEEK', periodStart: '2026-10-26' })],
    ['monthly report', shapes.REPORT, () => buildReport({ periodType: 'MONTH', periodStart: '2026-10-01' })],
  ])('%s', (_name, shape, build) => {
    expect(shapes.check(shape, build())).toEqual([]);
  });

  it('keeps the numbers the fixtures promise: top rows sum to total contacts', () => {
    const { figures, stageTotals } = buildOverview(PEOPLE);

    expect(
      stageTotals
        .filter((row) => row.rowKind !== 'NESTED')
        .reduce((sum, row) => sum + row.count, 0),
    ).toBe(figures.totalContacts);
    expect(
      stageTotals
        .filter((row) => ['NEW', 'CONTACTED', 'INTERESTED'].includes(row.rowKey))
        .reduce((sum, row) => sum + row.count, 0),
    ).toBe(figures.activePeople);
  });

  it('holds the hand-calculated sample of contract section 9', () => {
    const [newRow, contactedRow] = buildFunnel().rows;

    expect(newRow).toMatchObject({ entered: 7, eligible: 5, reachedNext: 2, exited: 1, timedOut: 2, inWindow: 2, medianDays: 5, completedStays: 5 });
    expect(contactedRow).toMatchObject({ entered: 4, eligible: 3, reachedNext: 1, exited: 0, timedOut: 2, inWindow: 1 });
  });
});

describe('the contract shape check itself', () => {
  const funnel = () => buildFunnel();

  it('reports a missing key', () => {
    const { cohortSize: _cohortSize, ...payload } = funnel();

    expect(shapes.check(shapes.FUNNEL, payload)).toEqual(['payload.cohortSize: missing']);
  });

  it('reports a key the contract does not have', () => {
    expect(shapes.check(shapes.FUNNEL, { ...funnel(), surprise: 1 })).toEqual([
      'payload.surprise: not in contract section 7',
    ]);
  });

  it.each([
    ['a rate above 1', { stepRate: 40 }, 'payload.rows[0].stepRate: expected a fraction from 0 to 1, got 40'],
    ['a negative count', { entered: -1 }, 'payload.rows[0].entered: expected a whole count, got -1'],
    ['a fractional count', { entered: 1.5 }, 'payload.rows[0].entered: expected a whole count, got 1.5'],
    ['a null where null is not allowed', { entered: null }, 'payload.rows[0].entered: expected a whole count, got null'],
    ['a string for a number', { medianDays: '5' }, 'payload.rows[0].medianDays: expected a number, got "5"'],
    ['a string for a boolean', { isUnderMinimum: 'no' }, 'payload.rows[0].isUnderMinimum: expected a boolean, got "no"'],
  ])('reports %s', (_name, change, message) => {
    const payload = funnel();

    Object.assign(payload.rows[0], change);

    expect(shapes.check(shapes.FUNNEL, payload)).toEqual([message]);
  });

  it('reports a value outside a literal union', () => {
    expect(
      shapes.check(shapes.META, buildMeta({ state: 'MAYBE' })),
    ).toEqual([
      'payload.state: expected one of DISABLED, NO_STAGE_FIELD, NEVER_SYNCED, READY, got "MAYBE"',
    ]);
  });
});
