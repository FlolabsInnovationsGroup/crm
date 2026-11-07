import { render, screen } from '@testing-library/react';

import { AnalyticsSyncLine } from '@/crm-analytics/components/AnalyticsSyncLine';
import { type AnalyticsSyncState } from '@/crm-analytics/types/AnalyticsApi';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const buildSync = (overrides: Partial<AnalyticsSyncState>): AnalyticsSyncState => ({
  lastSuccessfulSyncAt: minutesAgo(12),
  lastReconciliationAt: null,
  lastAttemptAt: minutesAgo(12),
  lastAttemptStatus: 'OK',
  isStale: false,
  restoredInLastReconciliation: null,
  ...overrides,
});

describe('AnalyticsSyncLine', () => {
  it('says when the last successful sync was', () => {
    render(<AnalyticsSyncLine sync={buildSync({})} />);

    expect(
      screen.getByText(/^Last successful sync .*12 min.*\.$/),
    ).toBeInTheDocument();
  });

  it('keeps the time and adds the failure when the last attempt failed', () => {
    render(
      <AnalyticsSyncLine sync={buildSync({ lastAttemptStatus: 'FAILED' })} />,
    );

    expect(
      screen.getByText(/^Last successful sync .*12 min.*The last attempt failed\.$/),
    ).toBeInTheDocument();
  });

  it('never invents a time when no sync has succeeded', () => {
    render(
      <AnalyticsSyncLine
        sync={buildSync({ lastSuccessfulSyncAt: null, lastAttemptStatus: null })}
      />,
    );

    expect(screen.getByText('No successful sync yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Last successful sync/)).not.toBeInTheDocument();
  });

  it('says so when no sync has succeeded and the last attempt failed', () => {
    render(
      <AnalyticsSyncLine
        sync={buildSync({
          lastSuccessfulSyncAt: null,
          lastAttemptStatus: 'FAILED',
          isStale: true,
        })}
      />,
    );

    expect(
      screen.getByText('No successful sync yet. The last attempt failed.'),
    ).toBeInTheDocument();
  });
});
