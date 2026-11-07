import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsTrendsTab } from '@/crm-analytics/components/AnalyticsTrendsTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_TRENDS } from '@/crm-analytics/graphql/getCrmAnalyticsTrends';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';

const mockToast = jest.fn();

jest.mock('@/apollo/components/ToastOnQueryErrorEffect', () => ({
  ToastOnQueryErrorEffect: ({ error }: { error?: ErrorLike }) => {
    if (error !== undefined) {
      mockToast(error);
    }

    return null;
  },
}));

// nivo's d3 dependencies are ESM, which this jest config does not transform.
jest.mock(
  '@/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart',
  () => ({
    GraphWidgetLineChart: () => <div>Line chart</div>,
  }),
);

const META = {
  fields: { hasFormSubmissionObject: true },
  stages: [
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
    {
      stageKey: 'SIGNED',
      label: 'Signed',
      kind: 'MAIN',
      rank: 2,
      limitDays: null,
      windowDays: null,
      isSuccess: true,
    },
    {
      stageKey: 'REJECTED_BY_US',
      label: 'Rejected by us',
      kind: 'EXIT',
      rank: null,
      limitDays: null,
      windowDays: null,
      isSuccess: false,
    },
  ],
} as AnalyticsMeta;

const buildTrends = (overrides: Partial<AnalyticsTrends>): AnalyticsTrends => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-09-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  metric: 'NEW_APPLICATIONS',
  stageKey: null,
  period: 'WEEK',
  unavailableReason: null,
  series: [
    {
      bucketStart: '2026-10-26',
      value: 74,
      previousValue: 60,
      size: null,
      previousSize: null,
      isPartial: false,
    },
    {
      bucketStart: '2026-11-02',
      value: 86,
      previousValue: 52,
      size: null,
      previousSize: null,
      isPartial: true,
    },
  ],
  cohorts: [
    {
      bucketStart: '2026-10-26',
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
      ],
      overallRate: null,
      overallSoFarRate: null,
    },
  ],
  movement: {
    from: '2026-11-02',
    to: '2026-11-07',
    rows: [
      {
        stageKey: 'NEW',
        label: 'New',
        enteredInPeriod: 31,
        leftInPeriod: 17,
        countNow: 900,
      },
    ],
  },
  ...overrides,
});

const REQUEST = {
  query: GET_CRM_ANALYTICS_TRENDS,
  variables: {
    filter: CRM_ANALYTICS_DEFAULT_FILTER,
    metric: 'NEW_APPLICATIONS',
    stageKey: null,
  },
};

const trendsMock = (trends: AnalyticsTrends | null) => ({
  request: REQUEST,
  result: {
    data: {
      getCrmAnalyticsTrends: {
        __typename: 'CrmAnalyticsPayload',
        payload: trends,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const metricMock = (
  metric: AnalyticsTrends['metric'],
  stageKey: string | null,
) => ({
  request: {
    query: GET_CRM_ANALYTICS_TRENDS,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER, metric, stageKey },
  },
  result: {
    data: {
      getCrmAnalyticsTrends: {
        __typename: 'CrmAnalyticsPayload',
        payload: buildTrends({ metric, stageKey, cohorts: [] }),
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const errorMock = (code: string) => ({
  request: REQUEST,
  result: { errors: [{ message: 'Query failed', extensions: { code } }] },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderTab = (
  mocks: ComponentProps<typeof MockedProvider>['mocks'],
  onResetFilter: () => void = jest.fn(),
  filter: AnalyticsFilter = CRM_ANALYTICS_DEFAULT_FILTER,
) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <AnalyticsTrendsTab
          filter={filter}
          meta={META}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

const filteredTrendsMock = (
  filter: AnalyticsFilter,
  trends: AnalyticsTrends,
) => ({
  request: {
    query: GET_CRM_ANALYTICS_TRENDS,
    variables: { filter, metric: 'NEW_APPLICATIONS', stageKey: null },
  },
  result: trendsMock(trends).result,
  maxUsageCount: Number.POSITIVE_INFINITY,
});

describe('AnalyticsTrendsTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows skeletons on first load', () => {
    renderTab([trendsMock(buildTrends({}))]);

    expect(screen.getAllByRole('status', { name: 'Loading' })).not.toHaveLength(
      0,
    );
  });

  it('shows the takeaway, chart and all three views', async () => {
    renderTab([trendsMock(buildTrends({}))]);

    expect(
      await screen.findByText(
        '86 new applications so far in this week; the previous one had 74.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Each period is compared with the one 2 weeks earlier\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /New applications by week/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Line chart')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getByText('n=120')).toBeInTheDocument();
    expect(screen.getByText('Stage movement')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
  });

  it('shows the plain reason in place of the chart and keeps the other views', async () => {
    renderTab([
      trendsMock(
        buildTrends({
          unavailableReason: 'SNAPSHOT_FILTER_COMBINATION',
          series: [],
        }),
      ),
    ]);

    expect(
      await screen.findByText(
        'Stored daily counts use one category at a time. Keep only one of Track, Program or Source.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Values for each period' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Stage movement')).toBeInTheDocument();
  });

  it('gives a plain reason when twelve weeks of a rate have no value, and keeps the table', async () => {
    const twelveWeeksStillInsideTheWindow = Array.from(
      { length: 12 },
      (_, index) => ({
        bucketStart: `2026-08-${String(10 + index).padStart(2, '0')}`,
        value: null,
        previousValue: 0.25,
        size: 40,
        previousSize: 40,
        isPartial: false,
      }),
    );

    renderTab([
      trendsMock(
        buildTrends({
          metric: 'OVERALL_CONVERSION',
          series: twelveWeeksStillInsideTheWindow,
        }),
      ),
    ]);

    expect(
      await screen.findByText(
        'No period in this view has fully passed the window yet.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tracking started Sep 1, 2026. No period here has a rate to draw. Try By month or a longer date range.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Line chart')).not.toBeInTheDocument();

    const valuesTable = screen.getByRole('table', {
      name: 'Values for each period',
    });

    expect(within(valuesTable).getAllByText('Not enough data')).toHaveLength(12);
    expect(within(valuesTable).getAllByText('25%')).toHaveLength(12);
  });

  it('says nothing about dates or status without those filters', async () => {
    renderTab([trendsMock(buildTrends({}))]);

    await screen.findByText('New applications by week');

    expect(screen.queryByText(/Dates widen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rates ignore/)).not.toBeInTheDocument();
  });

  it('says dates widen to whole periods, and when a long range was cut', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      dateFrom: '2026-01-14',
      dateTo: '2026-11-07',
    };

    renderTab(
      [filteredTrendsMock(filter, buildTrends({}))],
      jest.fn(),
      filter,
    );

    expect(
      await screen.findByText(
        /Dates widen to whole weeks on this tab\. Showing the latest 2 periods\./,
      ),
    ).toBeInTheDocument();
  });

  it('does not call a range cut when it starts in the first bucket', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      dateFrom: '2026-10-28',
      dateTo: '2026-11-07',
    };

    renderTab(
      [filteredTrendsMock(filter, buildTrends({}))],
      jest.fn(),
      filter,
    );

    expect(await screen.findByText(/Dates widen/)).toBeInTheDocument();
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });

  it('says rates ignore the status filter on the cohort table', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      status: 'ACTIVE',
    };

    renderTab(
      [filteredTrendsMock(filter, buildTrends({}))],
      jest.fn(),
      filter,
    );

    expect(
      await screen.findByText(/Rates ignore the status filter\./),
    ).toBeInTheDocument();
  });

  it('calls the movement numbers moves, not people', async () => {
    renderTab([trendsMock(buildTrends({}))]);

    expect(
      await screen.findByText(/^Moves into or out of each stage from/),
    ).toBeInTheDocument();
  });

  it('has no stage control on a metric that does not use one', async () => {
    renderTab([trendsMock(buildTrends({}))]);

    await screen.findByText('New applications by week');

    expect(
      screen.queryByRole('group', { name: 'Stage' }),
    ).not.toBeInTheDocument();
  });

  it('asks for a stage on the stage metric, starting at the first', async () => {
    const user = userEvent.setup();

    renderTab([
      trendsMock(buildTrends({})),
      metricMock('STAGE_COUNT', 'NEW'),
      metricMock('STAGE_COUNT', 'CONTACTED'),
    ]);

    await screen.findByText('New applications by week');
    await user.click(screen.getByText('New applications'));
    await user.click(await screen.findByText('People in a stage'));

    expect(
      await screen.findByText('People in New by week'),
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Stage' })).getByText('New'),
    );
    await user.click(await screen.findByText('Contacted'));

    expect(
      await screen.findByText('People in Contacted by week'),
    ).toBeInTheDocument();
  });

  it('offers only stages with a next step on drop-off', async () => {
    const user = userEvent.setup();

    renderTab([trendsMock(buildTrends({})), metricMock('DROP_OFF', 'NEW')]);

    await screen.findByText('New applications by week');
    await user.click(screen.getByText('New applications'));
    await user.click(await screen.findByText('Drop-off'));

    expect(
      await screen.findByText('Drop-off from New by week'),
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Stage' })).getByText('New'),
    );

    expect(await screen.findByText('Contacted')).toBeInTheDocument();
    expect(screen.queryByText('Signed')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected by us')).not.toBeInTheDocument();
  });

  it('starts median days on all stages and offers the ranked ones', async () => {
    const user = userEvent.setup();

    renderTab([trendsMock(buildTrends({})), metricMock('MEDIAN_DAYS', null)]);

    await screen.findByText('New applications by week');
    await user.click(screen.getByText('New applications'));
    await user.click(await screen.findByText('Median days in stage'));

    expect(
      await screen.findByText('Median days in stage by week'),
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Stage' })).getByText(
        'All stages',
      ),
    );

    expect(await screen.findByText('Signed')).toBeInTheDocument();
    expect(screen.queryByText('Rejected by us')).not.toBeInTheDocument();
  });

  it('offers a reset when nothing matches the filters', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();

    renderTab(
      [
        trendsMock(
          buildTrends({
            series: [],
            cohorts: [],
            movement: { from: '2026-11-02', to: '2026-11-07', rows: [] },
          }),
        ),
      ],
      onResetFilter,
    );

    expect(
      await screen.findByText('No people match these filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(onResetFilter).toHaveBeenCalledTimes(1);
  });

  it('shows the access message without a toast when forbidden', async () => {
    renderTab([errorMock('FORBIDDEN')]);

    expect(
      await screen.findByText(
        'You do not have access to analytics. Ask an admin.',
      ),
    ).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows retry and a toast on another error', async () => {
    renderTab([errorMock('INTERNAL_SERVER_ERROR')]);

    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalled();
  });

  it('treats a null payload as switched off', async () => {
    renderTab([trendsMock(null)]);

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });
});
