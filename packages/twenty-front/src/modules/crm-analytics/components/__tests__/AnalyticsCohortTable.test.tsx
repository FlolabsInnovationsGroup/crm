import { render, screen, within } from '@testing-library/react';

import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import {
  type AnalyticsCohortRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';

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
  {
    stageKey: 'CONTACTED',
    label: 'Contacted',
    kind: 'MAIN',
    rank: 1,
    limitDays: 14,
    windowDays: 14,
    isSuccess: false,
  },
];

const buildRow = (
  overrides: Partial<AnalyticsCohortRow>,
): AnalyticsCohortRow => ({
  bucketStart: '2026-10-01',
  size: 120,
  cells: [
    {
      stageKey: 'NEW',
      entered: 120,
      eligible: 120,
      rate: 0.42,
      soFarRate: 0.42,
      isMature: true,
    },
    {
      stageKey: 'CONTACTED',
      entered: 50,
      eligible: 20,
      rate: 0.2,
      soFarRate: 0.12,
      isMature: false,
    },
  ],
  overallRate: null,
  overallSoFarRate: 0.05,
  ...overrides,
});

const renderTable = (rows: AnalyticsCohortRow[]) =>
  render(
    <AnalyticsCohortTable
      rows={rows}
      stages={STAGES}
      period="MONTH"
      minimumSample={30}
    />,
  );

describe('AnalyticsCohortTable', () => {
  it('gives each step its number and n', () => {
    renderTable([buildRow({})]);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getAllByText('n=120')).toHaveLength(1);
  });

  it('shows the so far form until a cell is mature', () => {
    renderTable([buildRow({})]);

    expect(screen.getByText('12% so far')).toBeInTheDocument();
    expect(screen.getByText('n=50')).toBeInTheDocument();
    expect(screen.getByText('5% so far')).toBeInTheDocument();
    expect(screen.queryByText('20%')).not.toBeInTheDocument();
  });

  it('names each step column after the stage it leaves', () => {
    renderTable([buildRow({})]);

    expect(screen.getByText('New to next')).toBeInTheDocument();
    expect(screen.getByText('Contacted to next')).toBeInTheDocument();
  });

  it('never shows 0% for a step nobody has entered', () => {
    const { container } = renderTable([
      buildRow({
        size: 2,
        overallSoFarRate: null,
        cells: [
          {
            stageKey: 'NEW',
            entered: 0,
            eligible: 0,
            rate: 0,
            soFarRate: 0,
            isMature: true,
          },
        ],
      }),
    ]);

    expect(screen.getAllByText('Not enough data')).not.toHaveLength(0);
    expect(screen.getAllByText('n/a')).not.toHaveLength(0);
    expect(screen.queryByText('n=0')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('0%');
  });

  it('gives a small cohort its n beside the overall rate', () => {
    renderTable([
      buildRow({ size: 12, overallRate: 0.5, overallSoFarRate: null }),
    ]);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('n=12')).toBeInTheDocument();
  });

  it('lists the newest cohort first', () => {
    renderTable([
      buildRow({ bucketStart: '2026-09-01' }),
      buildRow({ bucketStart: '2026-10-01' }),
    ]);

    const [, newestRow] = screen.getAllByRole('row');

    expect(within(newestRow).getByText('Oct 2026')).toBeInTheDocument();
  });
});
