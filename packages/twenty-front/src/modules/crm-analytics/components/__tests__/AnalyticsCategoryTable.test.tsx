import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';

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

const ROBOTICS_ROW = buildRow({
  key: 'ROBOTICS',
  label: 'Robotics',
  people: 400,
});
const SENSOR_ROW = buildRow({
  key: 'SENSOR_INTEGRATION_INTERN',
  label: 'Sensor integration',
  parentKey: 'ROBOTICS',
  people: 150,
});
const BUSINESS_ROW = buildRow({
  key: 'BUSINESS',
  label: 'Business',
  people: 500,
});

const buildCategories = (
  overrides: Partial<AnalyticsCategories>,
): AnalyticsCategories => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 800,
  peopleInSeveral: 20,
  peopleInSeveralTracks: 5,
  stepStageKeys: [],
  rows: [ROBOTICS_ROW, SENSOR_ROW, BUSINESS_ROW],
  ...overrides,
});

const STAGES: AnalyticsStageDefinition[] = [
  {
    stageKey: 'NEW',
    label: 'New',
    kind: 'MAIN',
    rank: 0,
    limitDays: 14,
    windowDays: 14,
    isSuccess: false,
  },
];

const getTableRow = (name: string) =>
  screen.getByText(name).closest('tr') as HTMLElement;

describe('AnalyticsCategoryTable', () => {
  it('expands a track to its programs with a real button', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsCategoryTable categories={buildCategories({})} stages={STAGES} />,
    );

    const button = screen.getByRole('button', { name: 'Robotics' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sensor integration')).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sensor integration')).toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sensor integration')).not.toBeInTheDocument();
  });

  it('only offers to expand a track that has programs', () => {
    render(
      <AnalyticsCategoryTable categories={buildCategories({})} stages={STAGES} />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Business')).toBeInTheDocument();
  });

  it('counts people in several tracks while every track is collapsed', () => {
    render(
      <AnalyticsCategoryTable categories={buildCategories({})} stages={STAGES} />,
    );

    expect(
      screen.getByText(
        '5 people count in several rows; rows do not add up to 800.',
      ),
    ).toBeInTheDocument();
  });

  it('counts people in several positions once programs are showing', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsCategoryTable categories={buildCategories({})} stages={STAGES} />,
    );

    await user.click(screen.getByRole('button', { name: 'Robotics' }));

    expect(
      screen.getByText(
        '20 people count in several rows; rows do not add up to 800.',
      ),
    ).toBeInTheDocument();
  });

  it('writes the note for a single person in the singular', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({ peopleInSeveralTracks: 1 })}
        stages={STAGES}
      />,
    );

    expect(
      screen.getByText(
        '1 person counts in several rows; rows do not add up to 800.',
      ),
    ).toBeInTheDocument();
  });

  it('has no note when no one counts in several rows', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          groupBy: 'SOURCE',
          peopleInSeveral: 0,
          peopleInSeveralTracks: 0,
          rows: [buildRow({ key: 'LINKEDIN', label: 'LinkedIn' })],
        })}
        stages={STAGES}
      />,
    );

    expect(screen.queryByText(/do not add up/)).not.toBeInTheDocument();
  });

  it('always names an unmapped value', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          rows: [
            ROBOTICS_ROW,
            buildRow({
              key: 'UNMAPPED',
              label: 'Unmapped',
              isUnmapped: true,
              people: 900,
            }),
            buildRow({
              key: 'LEGACY_INTERN',
              label: 'LEGACY_INTERN',
              parentKey: 'UNMAPPED',
              isUnmapped: true,
              people: 900,
            }),
          ],
        })}
        stages={STAGES}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Unmapped' }));

    expect(screen.getByText('Unmapped: LEGACY_INTERN')).toBeInTheDocument();
  });

  it.each([
    ['TRACK_PROGRAM', 'NONE', 'No position'],
    ['TRACK_PROGRAM', 'UNMAPPED', 'Unmapped'],
    ['SOURCE', 'NONE', 'No source'],
  ] as const)(
    'labels the %s row %s by its key, not the stored text',
    (groupBy, key, expectedLabel) => {
      render(
        <AnalyticsCategoryTable
          categories={buildCategories({
            groupBy,
            rows: [buildRow({ key, label: 'Stored server text' })],
          })}
          stages={STAGES}
        />,
      );

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      expect(screen.queryByText('Stored server text')).not.toBeInTheDocument();
    },
  );

  it('keeps a raw unknown source readable', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          groupBy: 'SOURCE',
          rows: [
            buildRow({ key: 'TikTok', label: 'TikTok', isUnmapped: true }),
          ],
        })}
        stages={STAGES}
      />,
    );

    expect(screen.getByText('Unmapped: TikTok')).toBeInTheDocument();
  });

  it('shows n/a in the grid and keeps the full phrase for screen readers', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          rows: [
            buildRow({
              key: 'BUSINESS',
              label: 'Business',
              overallEligible: 0,
              overallRate: null,
            }),
          ],
        })}
        stages={STAGES}
      />,
    );

    const row = getTableRow('Business');

    expect(within(row).getByText('n/a')).toHaveAttribute('aria-hidden', 'true');
    expect(within(row).getByText('Not enough data')).toBeInTheDocument();
    expect(within(row).getByTitle('Not enough data')).toBeInTheDocument();
  });

  it('keeps a program visible when its track is not in the payload', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({ rows: [SENSOR_ROW] })}
        stages={STAGES}
      />,
    );

    expect(screen.getByText('Sensor integration')).toBeInTheDocument();
  });

  it('lists the largest named row first and catch-all rows last', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          rows: [
            buildRow({ key: 'NONE', label: 'No position', people: 900 }),
            ROBOTICS_ROW,
            BUSINESS_ROW,
          ],
        })}
        stages={STAGES}
      />,
    );

    const [, ...bodyRows] = screen.getAllByRole('row');

    expect(
      bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent),
    ).toEqual(['Business', 'Robotics', 'No position']);
  });

  it('gives one column per step, named after its stage', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          stepStageKeys: ['NEW'],
          rows: [
            buildRow({
              key: 'BUSINESS',
              label: 'Business',
              stepRates: [
                { stageKey: 'NEW', eligible: 40, rate: 0.5, soFarRate: 0.6 },
              ],
            }),
            buildRow({
              key: 'ROBOTICS',
              label: 'Robotics',
              stepRates: [
                { stageKey: 'NEW', eligible: 4, rate: 0.25, soFarRate: 0.5 },
              ],
            }),
            buildRow({
              key: 'DESIGN',
              label: 'Design',
              stepRates: [
                { stageKey: 'NEW', eligible: 0, rate: null, soFarRate: 0.12 },
              ],
            }),
          ],
        })}
        stages={STAGES}
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'New to next' }),
    ).toBeInTheDocument();
    expect(within(getTableRow('Business')).getByText('50%')).toBeInTheDocument();
    expect(within(getTableRow('Robotics')).getByText('of 4 people')).toBeInTheDocument();
    expect(
      within(getTableRow('Design')).getByText('12% so far'),
    ).toBeInTheDocument();
  });

  it('never shows a count or a rate for something unknown', () => {
    render(
      <AnalyticsCategoryTable
        categories={buildCategories({
          stepStageKeys: ['NEW'],
          rows: [
            buildRow({
              key: 'BUSINESS',
              label: 'Business',
              newApplications: null,
              overallEligible: 0,
              overallRate: null,
              overallSoFarRate: null,
              stepRates: [],
            }),
          ],
        })}
        stages={STAGES}
      />,
    );

    const row = getTableRow('Business');

    expect(within(row).getByText('Not available')).toBeInTheDocument();
    expect(within(row).getAllByText('Not enough data')).toHaveLength(2);
    expect(row).not.toHaveTextContent('0%');
  });
});
