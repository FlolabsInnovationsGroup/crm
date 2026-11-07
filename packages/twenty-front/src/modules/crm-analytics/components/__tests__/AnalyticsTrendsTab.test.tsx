import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsTrendsTab } from '@/crm-analytics/components/AnalyticsTrendsTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_SERIES } from '@/crm-analytics/graphql/getCrmAnalyticsSeries';
import { GET_CRM_ANALYTICS_TRENDS } from '@/crm-analytics/graphql/getCrmAnalyticsTrends';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsSeries,
  type AnalyticsSeriesRequest,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
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

// jsdom has no PointerEvent, which the segmented control's radios dispatch on a click.
window.PointerEvent = window.MouseEvent as typeof PointerEvent;

const META = {
  fields: { hasFormSubmissionObject: true, positionsAppliedFor: 'OK' },
  tracks: [
    { key: 'AI', label: 'Artificial Intelligence' },
    { key: 'DESIGN', label: 'Design' },
  ],
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
      stageKey: 'SIGNED',
      label: 'Signed',
      kind: 'MAIN',
      rank: 1,
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

const BASE = {
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-09-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

const COUNT_POINTS: AnalyticsTrendPoint[] = [
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
];

const RATE_POINTS: AnalyticsTrendPoint[] = [
  {
    bucketStart: '2026-10-19',
    value: 0.2,
    previousValue: null,
    size: 40,
    previousSize: null,
    isPartial: false,
  },
  {
    bucketStart: '2026-10-26',
    value: 0.25,
    previousValue: null,
    size: 40,
    previousSize: null,
    isPartial: false,
  },
  {
    bucketStart: '2026-11-02',
    value: null,
    previousValue: null,
    size: 12,
    previousSize: null,
    isPartial: true,
  },
];

const buildSeries = (
  metric: AnalyticsTrendMetric,
  overrides: Partial<AnalyticsSeries> = {},
): AnalyticsSeries => ({
  metric,
  stageKey: metric === 'DROP_OFF' ? 'NEW' : null,
  groupKey: null,
  groupLabel: null,
  unavailableReason: null,
  points:
    metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF'
      ? RATE_POINTS
      : COUNT_POINTS,
  ...overrides,
});

const SMALL_REQUESTS: AnalyticsSeriesRequest[] = (
  [
    'NEW_APPLICATIONS',
    'TOTAL_CONTACTS',
    'ACTIVE_PEOPLE',
    'OVERALL_CONVERSION',
    'DROP_OFF',
    'MEDIAN_DAYS',
  ] as const
).map((metric) => ({ metric, stageKey: null, groupBy: 'NONE' }));

const TRACK_REQUESTS: AnalyticsSeriesRequest[] = [
  { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'TRACK' },
  { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'TRACK' },
];

const STAGE_REQUESTS: AnalyticsSeriesRequest[] = [
  { metric: 'STAGE_COUNT', stageKey: null, groupBy: 'STAGE' },
];

const buildTrends = (overrides: Partial<AnalyticsTrends>): AnalyticsTrends => ({
  ...BASE,
  metric: 'OVERALL_CONVERSION',
  stageKey: null,
  period: 'WEEK',
  unavailableReason: null,
  series: RATE_POINTS,
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
      overallSoFarRate: 0.05,
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

const TRACK_SERIES = [
  ...(['NEW_APPLICATIONS', 'OVERALL_CONVERSION'] as const).flatMap((metric) => [
    buildSeries(metric, {
      groupKey: 'AI',
      groupLabel: 'Artificial Intelligence',
    }),
    buildSeries(metric, { groupKey: 'DESIGN', groupLabel: 'Design' }),
  ]),
];

const STAGE_SERIES = [
  buildSeries('STAGE_COUNT', {
    stageKey: 'NEW',
    groupKey: 'NEW',
    groupLabel: 'New',
  }),
  buildSeries('STAGE_COUNT', {
    stageKey: 'REJECTED_BY_US',
    groupKey: 'REJECTED_BY_US',
    groupLabel: 'Rejected by us',
  }),
];

const seriesMock = (
  filter: AnalyticsFilter,
  requests: AnalyticsSeriesRequest[],
  series: AnalyticsSeries[],
) => ({
  request: {
    query: GET_CRM_ANALYTICS_SERIES,
    variables: { filter, requests },
  },
  result: {
    data: {
      getCrmAnalyticsSeries: {
        __typename: 'CrmAnalyticsPayload',
        payload: { ...BASE, period: filter.period, series },
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const trendsMock = (
  filter: AnalyticsFilter,
  trends: AnalyticsTrends | null,
) => ({
  request: {
    query: GET_CRM_ANALYTICS_TRENDS,
    variables: { filter, metric: 'OVERALL_CONVERSION', stageKey: null },
  },
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

const errorMock = (code: string) => ({
  request: {
    query: GET_CRM_ANALYTICS_TRENDS,
    variables: {
      filter: CRM_ANALYTICS_DEFAULT_FILTER,
      metric: 'OVERALL_CONVERSION',
      stageKey: null,
    },
  },
  result: { errors: [{ message: 'Query failed', extensions: { code } }] },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const buildSmallSeries = () =>
  SMALL_REQUESTS.map(({ metric }) => buildSeries(metric));

const allMocks = ({
  filter = CRM_ANALYTICS_DEFAULT_FILTER,
  trends = buildTrends({}),
  smallSeries = buildSmallSeries(),
  trackSeries = TRACK_SERIES,
  stageSeries = STAGE_SERIES,
}: {
  filter?: AnalyticsFilter;
  trends?: AnalyticsTrends | null;
  smallSeries?: AnalyticsSeries[];
  trackSeries?: AnalyticsSeries[];
  stageSeries?: AnalyticsSeries[];
} = {}) => [
  trendsMock(filter, trends),
  seriesMock(filter, SMALL_REQUESTS, smallSeries),
  seriesMock(filter, TRACK_REQUESTS, trackSeries),
  seriesMock(filter, STAGE_REQUESTS, stageSeries),
];

const renderTab = ({
  mocks,
  filter = CRM_ANALYTICS_DEFAULT_FILTER,
  onFilterChange = jest.fn(),
  onResetFilter = jest.fn(),
}: {
  mocks: ComponentProps<typeof MockedProvider>['mocks'];
  filter?: AnalyticsFilter;
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
  onResetFilter?: () => void;
}) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <AnalyticsTrendsTab
          filter={filter}
          meta={META}
          onFilterChange={onFilterChange}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

const getCard = (name: string) => screen.getByRole('region', { name });

describe('AnalyticsTrendsTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows skeletons on first load', () => {
    renderTab({ mocks: allMocks() });

    expect(screen.getAllByRole('status', { name: 'Loading' })).not.toHaveLength(
      0,
    );
  });

  it('shows all six small charts with their latest value and change', async () => {
    renderTab({ mocks: allMocks() });

    expect(
      await screen.findByText('So far this week. 74 the week before.'),
    ).toBeInTheDocument();

    expect(getCard('New applications')).toHaveTextContent('86');
    expect(getCard('Total contacts')).toBeInTheDocument();
    expect(getCard('Active people')).toBeInTheDocument();
    expect(getCard('Overall conversion')).toHaveTextContent('25%');
    expect(getCard('Drop-off from New')).toBeInTheDocument();
    expect(getCard('Median days in a stage')).toBeInTheDocument();
  });

  it('gives no waiting reason when the last period had no applicants', async () => {
    const lastPoint = RATE_POINTS[RATE_POINTS.length - 1];

    renderTab({
      mocks: allMocks({
        smallSeries: SMALL_REQUESTS.map(({ metric }) =>
          metric === 'OVERALL_CONVERSION'
            ? buildSeries(metric, {
                points: [
                  { ...lastPoint, value: 0.25, size: 40 },
                  { ...lastPoint, value: null, size: 0 },
                ],
              })
            : buildSeries(metric),
        ),
      }),
    });

    await screen.findByText('So far this week. 74 the week before.');

    expect(
      within(getCard('Overall conversion')).queryByText(
        /The line stops before recent periods/,
      ),
    ).not.toBeInTheDocument();
  });

  it('says the rate line stops before recent periods', async () => {
    renderTab({ mocks: allMocks() });

    await screen.findByText('So far this week. 74 the week before.');

    expect(
      within(getCard('Overall conversion')).getByText(
        /The line stops before recent periods/,
      ),
    ).toBeInTheDocument();
    expect(
      within(getCard('Overall conversion')).getByText(
        /40 people who applied in the week of/,
      ),
    ).toBeInTheDocument();
  });

  // Only the four bundled requests have mocks, so any other request would fail its card.
  it('fills every card from one request per bundle', async () => {
    renderTab({ mocks: allMocks() });

    await screen.findByText('So far this week. 74 the week before.');
    await screen.findAllByText('Artificial Intelligence');
    await screen.findAllByText('Rejected by us');
    await screen.findByText('31');

    expect(
      screen.queryByText('This chart could not load'),
    ).not.toBeInTheDocument();
  });

  it('changes the period through the page filter and keeps the rest', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      status: 'ACTIVE',
      trackKey: 'AI',
    };

    renderTab({
      mocks: allMocks({ filter: { ...filter, status: 'ALL' } }),
      filter,
      onFilterChange,
    });

    await user.click(screen.getByRole('radio', { name: 'By month' }));

    expect(onFilterChange).toHaveBeenCalledWith({
      ...filter,
      period: 'MONTH',
    });
  });

  it('keeps the hidden status filter away from the numbers', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      status: 'EXITED',
    };

    renderTab({ mocks: allMocks(), filter });

    expect(
      await screen.findByText('So far this week. 74 the week before.'),
    ).toBeInTheDocument();
  });

  it('shows the plain reason in a card where a metric cannot be drawn', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      period: 'DAY',
    };

    renderTab({
      filter,
      mocks: allMocks({
        filter,
        trends: buildTrends({
          period: 'DAY',
          unavailableReason: 'DAILY_RATE',
          series: [],
          cohorts: [],
        }),
        smallSeries: SMALL_REQUESTS.map(({ metric }) =>
          metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF'
            ? buildSeries(metric, {
                unavailableReason: 'DAILY_RATE',
                points: [],
              })
            : buildSeries(metric),
        ),
      }),
    });

    await screen.findAllByText(
      'A rate needs a whole group of people, so it has no daily line. Choose By week or By month.',
    );

    expect(
      within(getCard('Overall conversion')).getByText(/has no daily line/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Groups of applicants are compared by week or month. Choose By week or By month.',
      ),
    ).toBeInTheDocument();
  });

  it('gives a plain reason when a rate has no known value, never 0%', async () => {
    renderTab({
      mocks: allMocks({
        smallSeries: SMALL_REQUESTS.map(({ metric }) =>
          metric === 'OVERALL_CONVERSION'
            ? buildSeries(metric, {
                points: RATE_POINTS.map((point) => ({
                  ...point,
                  value: null,
                })),
              })
            : buildSeries(metric),
        ),
      }),
    });

    await screen.findByText('So far this week. 74 the week before.');

    const card = getCard('Overall conversion');

    expect(
      within(card).getByText(/No period here has a rate to draw yet/),
    ).toBeInTheDocument();
    expect(within(card).queryByText('0%')).not.toBeInTheDocument();
  });

  it('draws what moved as entered and left, with the table behind Show numbers', async () => {
    const user = userEvent.setup();

    renderTab({ mocks: allMocks() });

    const card = await screen.findByRole('region', {
      name: 'What moved this period?',
    });

    expect(await within(card).findByText('31')).toBeInTheDocument();
    expect(within(card).getByText('17')).toBeInTheDocument();
    expect(within(card).queryByText('900')).not.toBeInTheDocument();

    await user.click(
      within(card).getByRole('button', { name: 'Show numbers' }),
    );

    expect(within(card).getByText('900')).toBeInTheDocument();
  });

  it('says so far on a group still in progress and moves the cohort table behind Show numbers', async () => {
    const user = userEvent.setup();

    renderTab({ mocks: allMocks() });

    const card = await screen.findByRole('region', {
      name: 'Are newer groups converting better?',
    });

    expect(await within(card).findByText('42%')).toBeInTheDocument();
    expect(within(card).getByText('so far')).toBeInTheDocument();
    expect(within(card).queryByText('of 120 people')).not.toBeInTheDocument();

    await user.click(
      within(card).getByRole('button', { name: 'Show numbers' }),
    );

    expect(within(card).getByText('of 120 people')).toBeInTheDocument();
  });

  it('shows a dash for a period with no stored stage count', async () => {
    renderTab({
      mocks: allMocks({
        stageSeries: [
          buildSeries('STAGE_COUNT', {
            groupKey: 'NEW',
            groupLabel: 'New',
            points: [{ ...COUNT_POINTS[0], value: null }, COUNT_POINTS[1]],
          }),
        ],
      }),
    });

    const card = await screen.findByRole('region', {
      name: 'People in each stage over time',
    });

    expect(await within(card).findByText('-')).toBeInTheDocument();
  });

  it('filters the whole page from a track in the legend and keeps the stored status', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      status: 'EXITED',
    };

    renderTab({
      mocks: allMocks({ filter: { ...filter, status: 'ALL' } }),
      filter,
      onFilterChange,
    });

    const card = await screen.findByRole('region', {
      name: 'New applications by track',
    });

    await user.click(
      await within(card).findByRole('button', { name: 'Design' }),
    );

    expect(onFilterChange).toHaveBeenCalledWith({
      ...filter,
      trackKey: 'DESIGN',
      programKey: null,
    });
  });

  it('says why tracks cannot be shown and sends no query for them', async () => {
    render(
      <JotaiProvider store={createStore()}>
        <MockedProvider mocks={allMocks()}>
          <AnalyticsTrendsTab
            filter={CRM_ANALYTICS_DEFAULT_FILTER}
            meta={{
              ...META,
              fields: { ...META.fields, positionsAppliedFor: 'MISSING' },
            }}
            onResetFilter={jest.fn()}
          />
        </MockedProvider>
      </JotaiProvider>,
    );

    expect(
      await screen.findAllByText(
        'The positions field on People is missing or has the wrong type, so tracks cannot be shown.',
      ),
    ).toHaveLength(2);
  });

  it('says dates widen to whole periods, and when a long range was cut', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      dateFrom: '2026-01-14',
      dateTo: '2026-11-07',
    };

    renderTab({ mocks: allMocks({ filter }), filter });

    expect(
      await screen.findByText(
        /Dates widen to whole weeks on the charts\. Moves use the exact dates\. Showing the latest 2 periods\./,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing about dates without a date filter', async () => {
    renderTab({ mocks: allMocks() });

    await screen.findByText('So far this week. 74 the week before.');

    expect(screen.queryByText(/Dates widen/)).not.toBeInTheDocument();
  });

  it('does not call a range cut when it starts in the first bucket', async () => {
    const filter: AnalyticsFilter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      dateFrom: '2026-10-28',
      dateTo: '2026-11-07',
    };

    renderTab({ mocks: allMocks({ filter }), filter });

    expect(await screen.findByText(/Dates widen/)).toBeInTheDocument();
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });

  it('shows the error, not an empty panel, when a new filter fails', async () => {
    const nextFilter = { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'Y' };
    const failure = { errors: [{ message: 'Query failed' }] };
    const mocks = [
      ...allMocks({
        trends: buildTrends({
          series: [],
          cohorts: [],
          movement: { from: '2026-11-02', to: '2026-11-07', rows: [] },
        }),
        smallSeries: SMALL_REQUESTS.map(({ metric }) =>
          buildSeries(metric, { points: [] }),
        ),
      }),
      ...allMocks({ filter: nextFilter }).map((mock) => ({
        ...mock,
        result: failure,
      })),
    ];
    const jotaiStore = createStore();
    const renderWithFilter = (filter: AnalyticsFilter) => (
      <JotaiProvider store={jotaiStore}>
        <MockedProvider mocks={mocks}>
          <AnalyticsTrendsTab
            filter={filter}
            meta={META}
            onFilterChange={jest.fn()}
            onResetFilter={jest.fn()}
          />
        </MockedProvider>
      </JotaiProvider>
    );

    const { rerender } = render(renderWithFilter(CRM_ANALYTICS_DEFAULT_FILTER));

    await screen.findByText('No people match these filters');

    rerender(renderWithFilter(nextFilter));

    expect(
      (await screen.findAllByText('This chart could not load')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText('No people match these filters'),
    ).not.toBeInTheDocument();
  });

  it('offers a reset when nothing matches the filters', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();

    renderTab({
      onResetFilter,
      mocks: allMocks({
        trends: buildTrends({
          series: [],
          cohorts: [],
          movement: { from: '2026-11-02', to: '2026-11-07', rows: [] },
        }),
        smallSeries: SMALL_REQUESTS.map(({ metric }) =>
          buildSeries(metric, { points: [] }),
        ),
      }),
    });

    expect(
      await screen.findByText('No people match these filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Reset filters'));

    expect(onResetFilter).toHaveBeenCalledTimes(1);
  });

  it('shows the access message without a toast when forbidden', async () => {
    renderTab({ mocks: [errorMock('FORBIDDEN')] });

    expect(
      await screen.findByText(
        'You do not have access to analytics. Ask an admin.',
      ),
    ).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows retry in the cards that failed on another error', async () => {
    renderTab({
      mocks: [errorMock('INTERNAL_SERVER_ERROR'), ...allMocks().slice(1)],
    });

    const card = await screen.findByRole('region', {
      name: 'What moved this period?',
    });

    expect(
      await within(card).findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('So far this week. 74 the week before.'),
    ).toBeInTheDocument();
  });

  it('treats a null payload as switched off', async () => {
    renderTab({ mocks: allMocks({ trends: null }) });

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });
});
