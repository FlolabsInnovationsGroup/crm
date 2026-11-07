import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildCategoriesTakeaway } from '@/crm-analytics/utils/buildCategoriesTakeaway';

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

const buildCategories = (rows: AnalyticsCategoryRow[]): AnalyticsCategories => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 300,
  peopleInSeveral: 20,
  peopleInSeveralTracks: 5,
  stepStageKeys: [],
  rows,
});

describe('buildCategoriesTakeaway', () => {
  it('names the largest row and the best converting row', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({ key: 'ROBOTICS', label: 'Robotics', people: 400 }),
          buildRow({ key: 'BUSINESS', label: 'Business', overallRate: 0.25 }),
        ]),
      ),
    ).toBe('Robotics is largest; Business converts best, 25%.');
  });

  it('does not let a row under the minimum sample convert best', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({ key: 'ROBOTICS', label: 'Robotics', people: 400 }),
          buildRow({
            key: 'DESIGN',
            label: 'Design',
            overallRate: 0.9,
            overallEligible: 3,
          }),
        ]),
      ),
    ).toBe('Robotics is largest; Robotics converts best, 10%.');
  });

  it('does not let a row under the minimum sample be largest', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({ key: 'ROBOTICS', label: 'Robotics', people: 5 }),
        ]),
      ),
    ).toBe('Not enough people in any group to compare yet.');
  });

  it('ignores programs and unmapped rows', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({ key: 'ROBOTICS', label: 'Robotics', people: 200 }),
          buildRow({
            key: 'SENSOR_INTEGRATION',
            label: 'Sensor integration',
            parentKey: 'ROBOTICS',
            people: 900,
            overallRate: 0.9,
          }),
          buildRow({
            key: 'UNMAPPED',
            label: 'Unmapped',
            isUnmapped: true,
            people: 950,
            overallRate: 0.95,
          }),
        ]),
      ),
    ).toBe('Robotics is largest; Robotics converts best, 10%.');
  });

  it('never names the row of people with no value', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({ key: 'ROBOTICS', label: 'Robotics', people: 200 }),
          buildRow({
            key: 'NONE',
            label: 'No position',
            people: 43000,
            overallRate: 0.95,
          }),
        ]),
      ),
    ).toBe('Robotics is largest; Robotics converts best, 10%.');
  });

  it('stays neutral about conversion when no rate qualifies', () => {
    expect(
      buildCategoriesTakeaway(
        buildCategories([
          buildRow({
            key: 'ROBOTICS',
            label: 'Robotics',
            overallRate: null,
            overallEligible: 0,
          }),
        ]),
      ),
    ).toBe(
      'Robotics is largest; no group has enough people to compare conversion yet.',
    );
  });
});
