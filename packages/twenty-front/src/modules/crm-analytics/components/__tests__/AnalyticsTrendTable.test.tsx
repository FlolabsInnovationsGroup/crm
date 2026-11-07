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
  previousSize: null,
  isPartial: false,
  ...overrides,
});

const renderTable = (
  points: AnalyticsTrendPoint[],
  metric: AnalyticsTrendMetric = 'NEW_APPLICATIONS',
  trackingStartedAt = '2026-01-01T00:00:00.000Z',
) =>
  render(
    <AnalyticsTrendTable
      points={points}
      metric={metric}
      period="WEEK"
      base={{
        minimumSample: 30,
        trackingStartedAt,
        reportingTimeZone: 'UTC',
      }}
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

  it('shows no change for a running count still in progress', () => {
    renderTable([
      buildPoint({ bucketStart: '2026-10-26', value: 74, previousValue: 60 }),
      buildPoint({
        bucketStart: '2026-11-02',
        value: 2,
        previousValue: 52,
        isPartial: true,
      }),
    ]);

    const [, inProgressRow, finishedRow] = screen.getAllByRole('row');

    expect(within(inProgressRow).getByText('52')).toBeInTheDocument();
    expect(within(inProgressRow).queryByText('-50')).not.toBeInTheDocument();
    expect(within(finishedRow).getByText('+14')).toBeInTheDocument();
  });

  it('shows no change for a running count against a partly tracked period', () => {
    renderTable(
      [buildPoint({ value: 86, previousValue: 74 })],
      'NEW_APPLICATIONS',
      '2026-10-27T00:00:00.000Z',
    );

    expect(screen.getByText('74')).toBeInTheDocument();
    expect(screen.queryByText('+12')).not.toBeInTheDocument();
  });

  it('reaches back the whole window to decide if the period was tracked', () => {
    renderTable(
      [
        buildPoint({ bucketStart: '2026-11-09', value: 74, previousValue: 60 }),
        buildPoint({ bucketStart: '2026-11-16', value: 86, previousValue: 52 }),
      ],
      'NEW_APPLICATIONS',
      '2026-11-02T00:00:00.000Z',
    );

    const [, newestRow, olderRow] = screen.getAllByRole('row');

    expect(within(newestRow).getByText('+34')).toBeInTheDocument();
    expect(within(olderRow).queryByText('+14')).not.toBeInTheDocument();
  });

  it('keeps the change on a level against a partly tracked period', () => {
    renderTable(
      [buildPoint({ value: 86, previousValue: 74 })],
      'TOTAL_CONTACTS',
      '2026-10-27T00:00:00.000Z',
    );

    expect(screen.getByText('+12')).toBeInTheDocument();
  });

  it('keeps the change on a level still in progress', () => {
    renderTable(
      [buildPoint({ value: 86, previousValue: 74, isPartial: true })],
      'TOTAL_CONTACTS',
    );

    expect(screen.getByText('+12')).toBeInTheDocument();
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

  it('shows the sample beside a rate under the minimum', () => {
    renderTable(
      [buildPoint({ value: 0.5, previousValue: null, size: 4 })],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('of 4 people')).toBeInTheDocument();
  });

  it('mutes a small previous sample and leaves the change empty', () => {
    renderTable(
      [
        buildPoint({
          value: 0.4,
          previousValue: 0.9,
          size: 120,
          previousSize: 3,
        }),
      ],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('of 3 people')).toBeInTheDocument();
    expect(screen.queryByText(/points/)).not.toBeInTheDocument();
  });

  it('leaves the change empty when the current sample is small', () => {
    renderTable(
      [
        buildPoint({
          value: 4.5,
          previousValue: 3,
          size: 4,
          previousSize: 90,
        }),
      ],
      'MEDIAN_DAYS',
    );

    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.queryByText('+1.5')).not.toBeInTheDocument();
  });

  it('compares as before when the server has not sent a previous sample', () => {
    const { previousSize: _previousSize, ...pointFromOlderServer } = buildPoint({
      value: 0.4,
      previousValue: 0.3,
      size: 120,
    });

    renderTable(
      [pointFromOlderServer as AnalyticsTrendPoint],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('+10 points')).toBeInTheDocument();
  });

  it('prints no sign on a change that rounds to zero', () => {
    renderTable(
      [buildPoint({ value: 0.3, previousValue: 0.301, size: 120 })],
      'OVERALL_CONVERSION',
    );

    expect(screen.getByText('0 points')).toBeInTheDocument();
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
