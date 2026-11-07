import { render, screen, within } from '@testing-library/react';

import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
} from '@/crm-analytics/types/AnalyticsApi';

const buildRow = (
  row: Partial<AnalyticsFunnelRow> & { stageKey: string; label: string },
): AnalyticsFunnelRow => ({
  windowDays: 14,
  entered: 400,
  eligible: 300,
  reachedNext: 120,
  timedOut: 130,
  exited: 50,
  inWindow: 100,
  stepRate: 0.4,
  soFarRate: 0.5,
  dropOffRate: 0.6,
  isUnderMinimum: false,
  medianDays: 6,
  completedStays: 120,
  ...row,
});

const NEW_ROW = buildRow({ stageKey: 'NEW', label: 'New', entered: 1000 });
const CONTACTED_ROW = buildRow({
  stageKey: 'CONTACTED',
  label: 'Contacted',
  stepRate: 0.25,
});
const SIGNED_ROW = buildRow({
  stageKey: 'SIGNED',
  label: 'Signed',
  windowDays: null,
  entered: 60,
  eligible: 0,
  reachedNext: 0,
  timedOut: 0,
  exited: 0,
  inWindow: 0,
  stepRate: null,
  soFarRate: null,
  dropOffRate: null,
  medianDays: null,
  completedStays: 0,
});

const buildFunnel = (overrides: Partial<AnalyticsFunnel>): AnalyticsFunnel => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  cohortSize: 1000,
  cohortExcludedUnmapped: 0,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 800,
    reached: 40,
    rate: 0.05,
    soFarRate: null,
    isUnderMinimum: false,
  },
  rows: [NEW_ROW, CONTACTED_ROW, SIGNED_ROW],
  lowestStepStageKey: 'CONTACTED',
  ...overrides,
});

const getStageRow = (label: string) =>
  screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;

describe('AnalyticsStageLedger', () => {
  it('renders one table with a row per stage', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(
      screen
        .getAllByRole('rowheader')
        .map((rowHeader) => rowHeader.textContent),
    ).toEqual(['New', 'Contacted', 'Signed', 'Overall']);
    expect(
      screen
        .getAllByRole('columnheader')
        .map((columnHeader) => columnHeader.textContent),
    ).toEqual([
      'Stage',
      'Reached',
      'To next',
      'Stalled',
      'Left',
      'Still in progress',
      'Median days',
    ]);
  });

  it('labels exactly one row as the lowest step', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    expect(screen.getAllByText('Lowest step')).toHaveLength(1);
    expect(
      within(getStageRow('Contacted')).getByText('Lowest step'),
    ).toBeInTheDocument();
  });

  it('labels no row when there is no lowest step', () => {
    render(
      <AnalyticsStageLedger funnel={buildFunnel({ lowestStepStageKey: null })} />,
    );

    expect(screen.queryByText('Lowest step')).not.toBeInTheDocument();
  });

  it('keeps the rate to the next stage in the row it starts from', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    expect(within(getStageRow('New')).getByText('40%')).toBeInTheDocument();
    expect(
      within(getStageRow('Contacted')).getByText('25%'),
    ).toBeInTheDocument();
  });

  it('shows the same not yet known forms as every other rate', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({
          lowestStepStageKey: null,
          rows: [
            buildRow({
              stageKey: 'NEW',
              label: 'New',
              eligible: 0,
              stepRate: null,
              soFarRate: 0.12,
            }),
            buildRow({
              stageKey: 'CONTACTED',
              label: 'Contacted',
              eligible: 12,
              stepRate: 0.5,
              isUnderMinimum: true,
            }),
            buildRow({
              stageKey: 'ATTENDED',
              label: 'Attended',
              eligible: 0,
              stepRate: null,
              soFarRate: null,
            }),
            SIGNED_ROW,
          ],
        })}
      />,
    );

    expect(
      within(getStageRow('New')).getByText('12% so far'),
    ).toBeInTheDocument();
    expect(within(getStageRow('Contacted')).getByText('of 12 people')).toBeVisible();
    expect(
      within(getStageRow('Attended')).getByText('Not enough data'),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).not.toHaveTextContent(/(^|\D)0%/);
  });

  it('leaves the step columns of the last stage blank instead of showing zeros', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    const cells = within(getStageRow('Signed')).getAllByRole('cell');

    expect(cells.map((cell) => cell.textContent)).toEqual([
      '60',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('shows the median, muted with its sample size when small', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({
          rows: [
            buildRow({
              stageKey: 'NEW',
              label: 'New',
              medianDays: 5.5,
              completedStays: 120,
            }),
            buildRow({
              stageKey: 'CONTACTED',
              label: 'Contacted',
              medianDays: 9,
              completedStays: 4,
            }),
            buildRow({
              stageKey: 'ATTENDED',
              label: 'Attended',
              medianDays: null,
              completedStays: 0,
            }),
            SIGNED_ROW,
          ],
        })}
      />,
    );

    expect(within(getStageRow('New')).getByText('5.5')).toBeInTheDocument();
    expect(within(getStageRow('Contacted')).getByText('from 4 finished stays')).toBeVisible();
    expect(
      within(getStageRow('Attended')).getByText('Not enough data'),
    ).toBeInTheDocument();
  });

  it('closes with the overall line', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    const overallRow = getStageRow('Overall');

    expect(
      within(overallRow).getByText('40 of 800 reached Signed within 90 days'),
    ).toBeInTheDocument();
    expect(within(overallRow).getByText('5%')).toBeInTheDocument();
  });

  it('uses the so far form on the overall line before anyone passes the window', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({
          overall: {
            finalStageKey: 'SIGNED',
            windowDays: 90,
            eligible: 0,
            reached: 0,
            rate: null,
            soFarRate: 0.03,
            isUnderMinimum: true,
          },
        })}
      />,
    );

    const overallRow = getStageRow('Overall');

    expect(
      within(overallRow).getByText('No one has had 90 days to reach the end yet'),
    ).toBeInTheDocument();
    expect(within(overallRow).getByText('3% so far')).toBeInTheDocument();
  });

  it('has no overall line without a final stage', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({
          overall: {
            finalStageKey: null,
            windowDays: 90,
            eligible: 0,
            reached: 0,
            rate: null,
            soFarRate: null,
            isUnderMinimum: true,
          },
        })}
      />,
    );

    expect(
      screen.queryByRole('rowheader', { name: 'Overall' }),
    ).not.toBeInTheDocument();
  });

  it('gives cohort size, excluded unmapped people and the re-applicant rule', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({ cohortExcludedUnmapped: 12 })}
      />,
    );

    expect(
      screen.getByText(
        'People who applied: 1,000. Tracking started Oct 27, 2026. 12 left out because every stage they had is unmapped. Someone who applies again counts once, and their furthest stage carries over.',
      ),
    ).toBeInTheDocument();
  });

  it('does not mention excluded people when there are none', () => {
    render(<AnalyticsStageLedger funnel={buildFunnel({})} />);

    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it('shows the launch state instead of a table of zeros when the cohort is empty', () => {
    render(
      <AnalyticsStageLedger
        funnel={buildFunnel({ cohortSize: 0, cohortExcludedUnmapped: 7 })}
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'No one in this view has entered the funnel yet. The Overview tab shows where people are now.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/7 left out/)).toBeInTheDocument();
  });
});
