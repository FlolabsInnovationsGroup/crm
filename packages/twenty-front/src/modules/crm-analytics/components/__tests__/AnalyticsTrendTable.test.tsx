import { render, screen, within } from '@testing-library/react';

import { AnalyticsTrendTable } from '@/crm-analytics/components/AnalyticsTrendTable';
import {
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
} from '@/crm-analytics/types/AnalyticsApi';

const buildPoint = (
  overrides: Partial<AnalyticsTrendPoint>,
): AnalyticsTrendPoint => ({
  bucketStart: '2026-11-02',
  value: 86,
  previousValue: 74,
  size: null,
  isPartial: false,
  ...overrides,
});

const renderTable = (
  points: AnalyticsTrendPoint[],
  metric: AnalyticsTrendMetric = 'NEW_APPLICATIONS',
) =>
  render(
    <AnalyticsTrendTable
      points={points}
      metric={metric}
      period="WEEK"
      minimumSample={30}
    />,
  );

describe('AnalyticsTrendTable', () => {
  it('lists the newest period first with its change', () => {
    renderTable([
      buildPoint({ bucketStart: '2026-10-26', value: 74, previousValue: 60 }),
      buildPoint({ bucketStart: '2026-11-02', value: 86, previousValue: 52 }),
    ]);

    const [, newestRow, olderRow] = screen.getAllByRole('row');

    expect(within(newestRow).getByText('Nov 2, 2026')).toBeInTheDocument();
    expect(within(newestRow).getByText('+34')).toBeInTheDocument();
    expect(within(olderRow).getByText('Oct 26, 2026')).toBeInTheDocument();
    expect(within(olderRow).getByText('+14')).toBeInTheDocument();
  });

  it('names the comparison column by how far back it reaches', () => {
    renderTable([
      buildPoint({ bucketStart: '2026-10-26', value: 74, previousValue: 60 }),
      buildPoint({ bucketStart: '2026-11-02', value: 86, previousValue: 52 }),
    ]);

    expect(
      screen.getByRole('columnheader', { name: '2 weeks earlier' }),
    ).toBeInTheDocument();
  });

  it('marks a period that is still in progress', () => {
    renderTable([buildPoint({ isPartial: true })]);

    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('has no previous or change column in the first period', () => {
    renderTable([buildPoint({ previousValue: null })]);

    expect(screen.queryByText('1 week earlier')).not.toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });

  it('never shows 0% for a rate that is not known yet', () => {
    const { container } = renderTable(
      [buildPoint({ value: null, previousValue: 0.25, size: null })],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('0%');
  });

  it('treats a rate over no people as unknown', () => {
    renderTable(
      [buildPoint({ value: 0, previousValue: null, size: 0 })],
      'DROP_OFF',
    );

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('shows a measured rate, its change in points and its sample', () => {
    renderTable(
      [buildPoint({ value: 0.4, previousValue: 0.3, size: 120 })],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('+10 points')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('keeps one decimal on median days', () => {
    renderTable(
      [buildPoint({ value: 4.5, previousValue: 3, size: 40 })],
      'MEDIAN_DAYS',
    );

    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('+1.5')).toBeInTheDocument();
    expect(screen.getByText('Completed stays')).toBeInTheDocument();
  });
});
