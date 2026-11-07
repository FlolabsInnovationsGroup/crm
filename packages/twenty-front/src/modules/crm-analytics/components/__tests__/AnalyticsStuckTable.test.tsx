import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AnalyticsStuckTable } from '@/crm-analytics/components/AnalyticsStuckTable';
import { type AnalyticsStuckRow } from '@/crm-analytics/types/AnalyticsApi';

const mockOpenRecordInSidePanel = jest.fn();

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

const PERSON_ID = '20202020-0000-4000-8000-000000000001';

const buildRow = (row: Partial<AnalyticsStuckRow>): AnalyticsStuckRow => ({
  personId: PERSON_ID,
  displayName: 'Ada Lovelace',
  stageKey: 'CONTACTED',
  stageLabel: 'Contacted',
  stageEnteredAt: '2026-10-01T00:00:00.000Z',
  daysInStage: 37,
  daysOverLimit: 23,
  isLowerBound: false,
  ...row,
});

describe('AnalyticsStuckTable', () => {
  beforeEach(() => {
    mockOpenRecordInSidePanel.mockClear();
  });

  it('opens the person on click', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsStuckTable
        stuck={{ rows: [buildRow({})], total: 1, hasLimits: true }}
      />,
    );

    await user.click(screen.getByRole('row', { name: /Ada Lovelace/ }));

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: PERSON_ID,
      objectNameSingular: 'person',
    });
  });

  it('opens the person on Enter', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsStuckTable
        stuck={{ rows: [buildRow({})], total: 1, hasLimits: true }}
      />,
    );

    await user.tab();
    expect(screen.getByRole('row', { name: /Ada Lovelace/ })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledTimes(1);
  });

  it('shows the at least form for a lower bound', () => {
    render(
      <AnalyticsStuckTable
        stuck={{
          rows: [buildRow({ isLowerBound: true, daysInStage: 40 })],
          total: 1,
          hasLimits: true,
        }}
      />,
    );

    expect(screen.getByText('at least 40')).toBeInTheDocument();
  });

  it('says how many of the total are shown', () => {
    render(
      <AnalyticsStuckTable
        stuck={{ rows: [buildRow({})], total: 120, hasLimits: true }}
      />,
    );

    expect(screen.getByText('Showing 1 of 120')).toBeInTheDocument();
  });

  it('explains the order when no stage has a limit', () => {
    render(
      <AnalyticsStuckTable
        stuck={{
          rows: [buildRow({ daysOverLimit: null })],
          total: 1,
          hasLimits: false,
        }}
      />,
    );

    expect(
      screen.getByText(
        'No stage limits are set, so this list is sorted by days in stage.',
      ),
    ).toBeInTheDocument();
  });

  it('says so when no one is past their limit', () => {
    render(
      <AnalyticsStuckTable stuck={{ rows: [], total: 0, hasLimits: true }} />,
    );

    expect(
      screen.getByText('No one is past their stage limit.'),
    ).toBeInTheDocument();
  });
});
