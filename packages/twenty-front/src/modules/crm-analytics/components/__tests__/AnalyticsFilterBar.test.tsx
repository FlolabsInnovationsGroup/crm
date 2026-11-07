import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  isStatusEnabled = true,
  onFilterChange,
}: {
  initialFilter?: AnalyticsFilter;
  meta?: AnalyticsMeta;
  isStatusEnabled?: boolean;
  onFilterChange?: (filter: AnalyticsFilter) => void;
}) => {
  const [filter, setFilter] = useState(initialFilter);
  const [store] = useState(() => createStore());

  return (
    <JotaiProvider store={store}>
      <AnalyticsFilterBar
        filter={filter}
        meta={meta}
        isStatusEnabled={isStatusEnabled}
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

  it('never offers a period, which lives on the Trends tab', () => {
    render(<AnalyticsFilterBarHarness />);

    expect(screen.queryByText('By week')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Period' }),
    ).not.toBeInTheDocument();
  });

  it('hides the status where it is not applied rather than disabling it', () => {
    render(<AnalyticsFilterBarHarness isStatusEnabled={false} />);

    expect(screen.queryByText('All statuses')).not.toBeInTheDocument();
  });

  it('uses plain words for the status options', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness />);

    await user.click(screen.getByText('All statuses'));

    expect(await screen.findByText('Left')).toBeInTheDocument();
    expect(screen.getByText('Not mapped')).toBeInTheDocument();
    expect(screen.queryByText('Exited')).not.toBeInTheDocument();
  });

  it('names every enabled filter for assistive technology', () => {
    render(<AnalyticsFilterBarHarness />);

    ['Dates', 'Track', 'Program', 'Source', 'Status'].forEach((label) => {
      expect(
        screen.getByRole('group', { name: label }),
      ).not.toHaveAttribute('aria-disabled');
    });
  });

  it('names the success status after the success stage', async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsFilterBarHarness
        meta={{
          ...buildMeta({}),
          stages: [
            {
              stageKey: 'SIGNED',
              label: 'Agreement signed',
              kind: 'MAIN',
              rank: 8,
              limitDays: null,
              windowDays: null,
              isSuccess: true,
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByText('All statuses'));

    expect(await screen.findByText('Agreement signed')).toBeInTheDocument();
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

  it('shows two date inputs for a custom range, then hides them on Clear all', async () => {
    const user = userEvent.setup();

    render(<AnalyticsFilterBarHarness />);

    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

    await user.click(screen.getByText('All dates'));
    await user.click(await screen.findByText('Custom dates'));

    expect(await screen.findByLabelText('From date')).toHaveValue('2026-10-27');
    expect(screen.getByLabelText('To date')).toBeInTheDocument();

    await user.click(screen.getByText('Clear all'));

    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    expect(screen.getByText('All dates')).toBeInTheDocument();
  });

  describe('active filter chips', () => {
    const ACTIVE_FILTER: AnalyticsFilter = {
      ...CUSTOM_RANGE_FILTER,
      trackKey: 'ROBOTICS',
      programKey: 'SENSOR_INTEGRATION',
      sourceKey: 'LINKEDIN',
      status: 'EXITED',
    };

    it('shows none and no Clear all when nothing is active', () => {
      render(<AnalyticsFilterBarHarness />);

      expect(
        screen.queryByRole('group', { name: 'Active filters' }),
      ).not.toBeInTheDocument();
    });

    it('names each active filter', () => {
      render(<AnalyticsFilterBarHarness initialFilter={ACTIVE_FILTER} />);

      const chips = within(
        screen.getByRole('group', { name: 'Active filters' }),
      );

      expect(chips.getByText('Oct 27, 2026 to Nov 5, 2026')).toBeInTheDocument();
      expect(chips.getByText('Track: Robotics')).toBeInTheDocument();
      expect(chips.getByText('Program: Sensor integration')).toBeInTheDocument();
      expect(chips.getByText('Source: LinkedIn')).toBeInTheDocument();
      expect(chips.getByText('Status: Left')).toBeInTheDocument();
    });

    it('removes one filter and keeps the others', async () => {
      const user = userEvent.setup();
      const onFilterChange = jest.fn();

      render(
        <AnalyticsFilterBarHarness
          initialFilter={ACTIVE_FILTER}
          onFilterChange={onFilterChange}
        />,
      );

      await user.click(
        screen.getByRole('button', {
          name: 'Remove filter Source: LinkedIn',
        }),
      );

      expect(onFilterChange).toHaveBeenCalledWith({
        ...ACTIVE_FILTER,
        sourceKey: null,
      });
      expect(screen.queryByText('Source: LinkedIn')).not.toBeInTheDocument();
      expect(screen.getByText('Track: Robotics')).toBeInTheDocument();
    });

    it('has no chip for a status the tab does not apply', () => {
      render(
        <AnalyticsFilterBarHarness
          isStatusEnabled={false}
          initialFilter={{ ...CRM_ANALYTICS_DEFAULT_FILTER, status: 'EXITED' }}
        />,
      );

      expect(screen.queryByText('Status: Left')).not.toBeInTheDocument();
      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    });

    it('names a value from a chart click that the options do not list', () => {
      render(
        <AnalyticsFilterBarHarness
          initialFilter={{
            ...CRM_ANALYTICS_DEFAULT_FILTER,
            trackKey: 'NONE',
            sourceKey: 'Old fair',
          }}
        />,
      );

      expect(screen.getByText('Track: No position')).toBeInTheDocument();
      expect(screen.getByText('Source: Unmapped: Old fair')).toBeInTheDocument();
      expect(screen.queryByText('All tracks')).not.toBeInTheDocument();
      expect(screen.queryByText('All sources')).not.toBeInTheDocument();
    });
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

    it('waits while typing, then applies at once when the field is left', async () => {
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

    it('keeps the range when Custom dates is chosen again', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      await user.click(screen.getByText('Custom dates'));
      await user.click((await screen.findAllByText('Custom dates')).at(-1)!);

      expect(onFilterChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText('From date')).toHaveValue('2026-10-27');
    });

    it('moves To along when From passes it', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      await retypeDate(user, 'From date', '2026-11-20');
      await user.tab();

      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateFrom: '2026-11-20',
        dateTo: '2026-11-20',
      });
      expect(screen.getByLabelText('To date')).toHaveValue('2026-11-20');
    });

    it('moves From along when To goes before it', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      await retypeDate(user, 'To date', '2026-10-01');
      await user.tab();

      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-01',
      });
      expect(screen.getByLabelText('From date')).toHaveValue('2026-10-01');
    });

    it('keeps the last applied date for a year the server refuses', async () => {
      const user = userEvent.setup();
      const { onFilterChange } = renderCustomRange();

      const input = await retypeDate(user, 'To date', '2206-11-08');

      await user.tab();

      expect(onFilterChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('2026-11-05');
    });

    it('offers only years the filter accepts in the calendar', () => {
      renderCustomRange();

      expect(screen.getByLabelText('From date')).toHaveAttribute(
        'min',
        '2026-01-01',
      );
      expect(screen.getByLabelText('To date')).toHaveAttribute(
        'max',
        '2100-12-31',
      );
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

  // A calendar pick fires change and leaves focus in the input, so nothing blurs.
  describe('picking a date from the calendar', () => {
    const IDLE_DELAY_IN_MS = 600;

    const renderCustomRange = () => {
      const onFilterChange = jest.fn();

      const { unmount } = render(
        <AnalyticsFilterBarHarness
          initialFilter={CUSTOM_RANGE_FILTER}
          onFilterChange={onFilterChange}
        />,
      );

      return { onFilterChange, unmount };
    };

    const pickDate = (label: string, date: string) => {
      const input = screen.getByLabelText(label);

      fireEvent.change(input, { target: { value: date } });

      return input;
    };

    const waitFor = (milliseconds: number) =>
      act(() => {
        jest.advanceTimersByTime(milliseconds);
      });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('applies after a short idle, with no blur', () => {
      const { onFilterChange } = renderCustomRange();

      const input = pickDate('From date', '2026-10-30');

      waitFor(IDLE_DELAY_IN_MS - 1);

      expect(onFilterChange).not.toHaveBeenCalled();

      waitFor(1);

      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateFrom: '2026-10-30',
      });
      expect(input).toHaveValue('2026-10-30');
    });

    it('applies only the last of several quick picks', () => {
      const { onFilterChange } = renderCustomRange();

      pickDate('From date', '2026-10-28');
      waitFor(IDLE_DELAY_IN_MS - 1);
      pickDate('From date', '2026-10-30');
      waitFor(IDLE_DELAY_IN_MS);

      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange).toHaveBeenCalledWith({
        ...CUSTOM_RANGE_FILTER,
        dateFrom: '2026-10-30',
      });
    });

    it('does not apply a second time after Enter', () => {
      const { onFilterChange } = renderCustomRange();

      const input = pickDate('To date', '2026-11-03');

      fireEvent.keyDown(input, { key: 'Enter' });
      waitFor(IDLE_DELAY_IN_MS);

      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });

    it('holds back a year before tracking started and one past the limit', () => {
      const { onFilterChange } = renderCustomRange();

      pickDate('From date', '0202-10-15');
      waitFor(IDLE_DELAY_IN_MS);
      pickDate('To date', '2206-11-08');
      waitFor(IDLE_DELAY_IN_MS);

      expect(onFilterChange).not.toHaveBeenCalled();
    });

    it('drops a pending pick when the field goes away', () => {
      const { onFilterChange, unmount } = renderCustomRange();

      pickDate('From date', '2026-10-30');
      unmount();
      waitFor(IDLE_DELAY_IN_MS);

      expect(onFilterChange).not.toHaveBeenCalled();
    });
  });
});
