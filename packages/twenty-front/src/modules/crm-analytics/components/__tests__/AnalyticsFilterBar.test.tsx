import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { useState } from 'react';

import { AnalyticsFilterBar } from '@/crm-analytics/components/AnalyticsFilterBar';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
} from '@/crm-analytics/types/AnalyticsApi';

const buildMeta = (fields: Partial<AnalyticsMeta['fields']>): AnalyticsMeta => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  state: 'READY',
  isProvisional: true,
  showSignedFigure: false,
  sync: {
    lastSuccessfulSyncAt: '2026-11-07T09:50:00.000Z',
    lastReconciliationAt: null,
    lastAttemptAt: null,
    lastAttemptStatus: 'OK',
    isStale: false,
    restoredInLastReconciliation: null,
  },
  fields: {
    stage: 'OK',
    isStageAuditLogged: true,
    positionsAppliedFor: 'OK',
    applicantSource: 'OK',
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
    ...fields,
  },
  stages: [],
  tracks: [
    { key: 'ROBOTICS', label: 'Robotics' },
    { key: 'BUSINESS', label: 'Business' },
  ],
  programs: [
    { key: 'SENSOR_INTEGRATION', label: 'Sensor integration', trackKey: 'ROBOTICS' },
    { key: 'FINANCE', label: 'Finance', trackKey: 'BUSINESS' },
  ],
  sources: [{ key: 'LINKEDIN', label: 'LinkedIn' }],
});

const CUSTOM_RANGE_FILTER: AnalyticsFilter = {
  ...CRM_ANALYTICS_DEFAULT_FILTER,
  dateFrom: '2026-10-27',
  dateTo: '2026-11-05',
};

const AnalyticsFilterBarHarness = ({
  initialFilter = CRM_ANALYTICS_DEFAULT_FILTER,
  meta = buildMeta({}),
  isPeriodEnabled = false,
  onFilterChange,
}: {
  initialFilter?: AnalyticsFilter;
  meta?: AnalyticsMeta;
  isPeriodEnabled?: boolean;
  onFilterChange?: (filter: AnalyticsFilter) => void;
}) => {
  const [filter, setFilter] = useState(initialFilter);
  const [store] = useState(() => createStore());

  return (
    <JotaiProvider store={store}>
      <AnalyticsFilterBar
        filter={filter}
        meta={meta}
        isPeriodEnabled={isPeriodEnabled}
        onChange={(nextFilter) => {
          setFilter(nextFilter);
          onFilterChange?.(nextFilter);
        }}
        onReset={() => setFilter(CRM_ANALYTICS_DEFAULT_FILTER)}
      />
    </JotaiProvider>
  );
};

describe('AnalyticsFilterBar', () => {
  it('lists every program without a track', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness />);

    await user.click(screen.getByText('All programs'));

    expect(await screen.findByText('Sensor integration')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('narrows the program list by track', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsFilterBarHarness
        initialFilter={{
          ...CRM_ANALYTICS_DEFAULT_FILTER,
          trackKey: 'ROBOTICS',
        }}
      />,
    );

    await user.click(screen.getByText('All programs'));

    expect(await screen.findByText('Sensor integration')).toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
  });

  it('clears a program that the new track does not list', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsFilterBarHarness
        initialFilter={{
          ...CRM_ANALYTICS_DEFAULT_FILTER,
          programKey: 'FINANCE',
        }}
      />,
    );

    expect(screen.getByText('Finance')).toBeInTheDocument();

    await user.click(screen.getByText('All tracks'));
    await user.click(await screen.findByText('Robotics'));

    expect(await screen.findByText('All programs')).toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
  });

  it('disables the period outside Trends and gives the reason', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness />);

    expect(
      screen.getByRole('group', {
        name: 'Period: Only the Trends tab uses a period.',
      }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByText('By week'));

    expect(screen.queryByText('By day')).not.toBeInTheDocument();
  });

  it('enables the period on Trends', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness isPeriodEnabled />);

    await user.click(screen.getByText('By week'));

    expect(await screen.findByText('By day')).toBeInTheDocument();
  });

  it('disables track and program when the positions field is missing', () => {
    render(
      <AnalyticsFilterBarHarness
        meta={buildMeta({ positionsAppliedFor: 'MISSING' })}
      />,
    );

    expect(screen.getByRole('group', { name: /^Track:/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('group', { name: /^Program:/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      screen.queryByRole('group', { name: /^Source:/ }),
    ).not.toBeInTheDocument();
  });

  it('disables the source when its field has the wrong type', () => {
    render(
      <AnalyticsFilterBarHarness
        meta={buildMeta({ applicantSource: 'WRONG_TYPE' })}
      />,
    );

    expect(screen.getByRole('group', { name: /^Source:/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows two date inputs for a custom range, then hides them on reset', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness />);

    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset filters')).not.toBeInTheDocument();

    await user.click(screen.getByText('All dates'));
    await user.click(await screen.findByText('Custom dates'));

    expect(await screen.findByLabelText('From date')).toHaveValue('2026-10-27');
    expect(screen.getByLabelText('To date')).toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    expect(screen.getByText('All dates')).toBeInTheDocument();
  });

  describe('typing a date', () => {
    const renderCustomRange = () => {
      const onFilterChange = jest.fn();

      render(
        <AnalyticsFilterBarHarness
          initialFilter={CUSTOM_RANGE_FILTER}
          onFilterChange={onFilterChange}
        />,
      );

      return { onFilterChange };
    };

    const retypeDate = async (
      user: ReturnType<typeof userEvent.setup>,
      label: string,
      date: string,
    ) => {
      const input = screen.getByLabelText(label);

      await user.clear(input);
      await user.type(input, date);

      return input;
    };

    it('applies only once the field is left', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      await retypeDate(user, 'From date', '2026-10-30');

      expect(onFilterChange).not.toHaveBeenCalled();

      await user.tab();

      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateFrom: '2026-10-30',
      });
    });

    it('applies on Enter', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      const input = await retypeDate(user, 'To date', '2026-11-03');

      await user.keyboard('{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateTo: '2026-11-03',
      });
      expect(input).toHaveValue('2026-11-03');
    });

    it('keeps the last applied date for a year before tracking started', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      const input = await retypeDate(user, 'From date', '0202-10-15');

      await user.tab();

      expect(onFilterChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('2026-10-27');
    });

    it('keeps the last applied date for a reversed range', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      const fromInput = await retypeDate(user, 'From date', '2026-11-20');

      await user.tab();

      const toInput = await retypeDate(user, 'To date', '2026-10-01');

      await user.tab();

      expect(onFilterChange).not.toHaveBeenCalled();
      expect(fromInput).toHaveValue('2026-10-27');
      expect(toInput).toHaveValue('2026-11-05');
    });

    it('keeps the last applied date when the field is left unfinished', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      const input = screen.getByLabelText('From date');

      await user.clear(input);
      await user.tab();

      expect(onFilterChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('2026-10-27');
    });
  });
});
