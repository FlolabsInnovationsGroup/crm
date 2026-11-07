import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsOverviewTab } from '@/crm-analytics/components/AnalyticsOverviewTab';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_CATEGORIES } from '@/crm-analytics/graphql/getCrmAnalyticsCategories';
import { GET_CRM_ANALYTICS_FUNNEL } from '@/crm-analytics/graphql/getCrmAnalyticsFunnel';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import { GET_CRM_ANALYTICS_SERIES } from '@/crm-analytics/graphql/getCrmAnalyticsSeries';
import {
  type AnalyticsCategories,
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsMeta,
  type AnalyticsOverview,
  type AnalyticsSeriesBundle,
  type AnalyticsStuckRow,
} from '@/crm-analytics/types/AnalyticsApi';

// d3-shape ships as ES modules only, which this jest setup does not transform.
jest.mock('d3-shape', () => ({
  arc: () => {
    const generator = () => 'M0,0';

    generator.innerRadius = () => generator;
    generator.outerRadius = () => generator;

    return generator;
  },
  pie: () => {
    const generator = (slices: unknown[]) => slices.map((data) => ({ data }));

    generator.value = () => generator;
    generator.sort = () => generator;
    generator.padAngle = () => generator;

    return generator;
  },
}));

const mockToast = jest.fn();

jest.mock('@/apollo/components/ToastOnQueryErrorEffect', () => ({
  ToastOnQueryErrorEffect: ({ error }: { error?: ErrorLike }) => {
    if (error !== undefined) {
      mockToast(error);
    }

    return null;
  },
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: jest.fn() }),
}));

const META = {
  showSignedFigure: false,
  fields: { positionsAppliedFor: 'OK', applicantSource: 'OK' },
  stages: [
    { stageKey: 'NEW', isSuccess: false },
    { stageKey: 'SIGNED', isSuccess: true },
  ],
} as AnalyticsMeta;

const buildOverview = (
  overrides: Partial<AnalyticsOverview>,
): AnalyticsOverview => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-25T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  importedExcludedByDate: 0,
  figures: {
    totalContacts: 42975,
    activePeople: 1284,
    newApplications: 86,
    newApplicationsPrevious: 74,
    newApplicationsFrom: '2026-11-01',
    newApplicationsTo: '2026-11-07',
    importedApplications: 42371,
    stuckPeople: 214,
    inactivePeople: 3810,
    signedPeople: 12,
  },
  stageTotals: [
    {
      rowKey: 'NEW',
      label: 'New',
      rowKind: 'MAIN',
      parentStageKey: null,
      count: 900,
      pastLimitCount: 120,
      inactiveCount: 0,
    },
    {
      rowKey: 'NEW_REMINDER',
      label: 'New reminder',
      rowKind: 'NESTED',
      parentStageKey: 'NEW',
      count: 40,
      pastLimitCount: null,
      inactiveCount: 0,
    },
    {
      rowKey: 'LEGACY_TEST',
      label: 'LEGACY_TEST',
      rowKind: 'UNMAPPED',
      parentStageKey: null,
      count: 3,
      pastLimitCount: null,
      inactiveCount: 0,
    },
  ],
  stuck: { rows: [], total: 0, hasLimits: true },
  ...overrides,
});

const overviewMock = (overview: AnalyticsOverview | null) => ({
  request: {
    query: GET_CRM_ANALYTICS_OVERVIEW,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: {
    data: {
      getCrmAnalyticsOverview: {
        __typename: 'CrmAnalyticsPayload',
        payload: overview,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const FUNNEL = {
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 80,
    reached: 8,
    rate: 0.1,
    soFarRate: 0.12,
    isUnderMinimum: false,
  },
  rows: [{ stageKey: 'SIGNED', label: 'Signed' }],
} as AnalyticsFunnel;

const funnelMock = (funnel: AnalyticsFunnel) => ({
  request: {
    query: GET_CRM_ANALYTICS_FUNNEL,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: {
    data: {
      getCrmAnalyticsFunnel: {
        __typename: 'CrmAnalyticsPayload',
        payload: funnel,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const buildSeries = (
  metric: AnalyticsSeriesBundle['series'][number]['metric'],
  values: (number | null)[],
) => ({
  metric,
  stageKey: null,
  groupKey: null,
  groupLabel: null,
  unavailableReason: null,
  points: values.map((value, index) => ({
    bucketStart: `2026-10-0${index + 1}`,
    value,
    previousValue: null,
    size: null,
    previousSize: null,
    isPartial: false,
  })),
});

const seriesMock = (series: AnalyticsSeriesBundle['series']) => ({
  request: {
    query: GET_CRM_ANALYTICS_SERIES,
    variables: {
      filter: CRM_ANALYTICS_DEFAULT_FILTER,
      requests: [
        { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'NONE' },
        { metric: 'ACTIVE_PEOPLE', stageKey: null, groupBy: 'NONE' },
        { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'NONE' },
        { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'NONE' },
      ],
    },
  },
  result: {
    data: {
      getCrmAnalyticsSeries: {
        __typename: 'CrmAnalyticsPayload',
        payload: { period: 'WEEK', series },
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const categoriesMock = (
  groupBy: AnalyticsCategories['groupBy'],
  rows: Partial<AnalyticsCategories['rows'][number]>[],
) => ({
  request: {
    query: GET_CRM_ANALYTICS_CATEGORIES,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER, groupBy },
  },
  result: {
    data: {
      getCrmAnalyticsCategories: {
        __typename: 'CrmAnalyticsPayload',
        payload: { groupBy, peopleInSeveralTracks: 0, rows },
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const CATEGORY_DEFAULTS = {
  parentKey: null,
  isUnmapped: false,
  activePeople: 5,
  newApplications: null,
};

const CHART_MOCKS = [
  funnelMock(FUNNEL),
  seriesMock([
    buildSeries('ACTIVE_PEOPLE', [1000, 1100, 1284]),
    buildSeries('NEW_APPLICATIONS', [70, 74, 86]),
  ]),
  categoriesMock('TRACK_PROGRAM', [
    { ...CATEGORY_DEFAULTS, key: 'AI', label: 'Robots and code', people: 70 },
  ]),
  categoriesMock('SOURCE', [
    { ...CATEGORY_DEFAULTS, key: 'LINKEDIN', label: 'LinkedIn', people: 40 },
  ]),
];

const errorMock = (code: string) => ({
  request: {
    query: GET_CRM_ANALYTICS_OVERVIEW,
    variables: { filter: CRM_ANALYTICS_DEFAULT_FILTER },
  },
  result: { errors: [{ message: 'Query failed', extensions: { code } }] },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderTab = (
  mocks: ComponentProps<typeof MockedProvider>['mocks'],
  onResetFilter: () => void = jest.fn(),
  onFilterChange?: (nextFilter: AnalyticsFilter) => void,
) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={[...(mocks ?? []), ...CHART_MOCKS]}>
        <AnalyticsOverviewTab
          filter={CRM_ANALYTICS_DEFAULT_FILTER}
          meta={META}
          onFilterChange={onFilterChange}
          onResetFilter={onResetFilter}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsOverviewTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows skeletons on first load', () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(screen.getAllByRole('status', { name: 'Loading' })).not.toHaveLength(
      0,
    );
  });

  it('shows the takeaway, figures and stage totals', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByText(
        '1,284 active people, 214 past their stage limit. 3 people have a stage not yet mapped and are not counted as active or past their limit.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'In the pipeline now, not signed or exited. Leaves out 3 with a stage not yet mapped.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('86')).toBeInTheDocument();
    expect(
      screen.getByText('+12 against the previous period'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('42,371 imported, dates unknown'),
    ).toBeInTheDocument();
    expect(screen.getByText('3,810 inactive')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('keeps the stage table behind Show numbers', async () => {
    const user = userEvent.setup();

    renderTab([overviewMock(buildOverview({}))]);

    await screen.findByText('1,284');

    expect(
      screen.queryByRole('table', { name: 'People by current stage' }),
    ).not.toBeInTheDocument();

    await user.click(
      within(
        screen.getByRole('region', { name: 'Where is everyone now?' }),
      ).getByText('Show numbers'),
    );

    expect(
      screen.getByRole('table', { name: 'People by current stage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('New reminder')).toBeInTheDocument();
  });

  it('shows the pipeline status with everyone in it', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    await screen.findByText('1,284');

    const pipelineStatus = screen.getByRole('region', {
      name: 'Pipeline status',
    });

    expect(within(pipelineStatus).getByText('Active')).toBeInTheDocument();
    expect(
      within(pipelineStatus).getByText('Not mapped or no stage'),
    ).toBeInTheDocument();
  });

  it('shows overall conversion from the funnel', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(
      screen.getByText('8 of 80 people reached Signed within 90 days.'),
    ).toBeInTheDocument();
  });

  it('never shows 0% when overall conversion is unknown', async () => {
    render(
      <JotaiProvider store={createStore()}>
        <MockedProvider
          mocks={[
            overviewMock(buildOverview({})),
            funnelMock({
              ...FUNNEL,
              overall: {
                ...FUNNEL.overall,
                eligible: 0,
                reached: 0,
                rate: null,
                soFarRate: 0,
                isUnderMinimum: true,
              },
            }),
          ]}
        >
          <AnalyticsOverviewTab
            filter={CRM_ANALYTICS_DEFAULT_FILTER}
            meta={META}
            onResetFilter={jest.fn()}
          />
        </MockedProvider>
      </JotaiProvider>,
    );

    expect(
      await screen.findByText('Shows once people have had 90 days to reach the end.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('draws a sparkline only where a series has enough points', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByRole('img', { name: 'Active people by week' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Total contacts by week' }),
    ).not.toBeInTheDocument();
  });

  it('draws new applications over time', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    await screen.findByText('1,284');

    expect(
      await within(
        screen.getByRole('region', { name: 'New applications over time' }),
      ).findByRole('img', { name: 'New applications by week' }),
    ).toBeInTheDocument();
  });

  it('sets the page filter when a track or source is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = jest.fn();

    renderTab([overviewMock(buildOverview({}))], jest.fn(), onFilterChange);

    await user.click(
      await screen.findByRole('button', { name: 'Robots and code: 70' }),
    );

    expect(onFilterChange).toHaveBeenLastCalledWith({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'AI',
      programKey: null,
    });

    await user.click(
      await screen.findByRole('button', { name: 'LinkedIn: 40' }),
    );

    expect(onFilterChange).toHaveBeenLastCalledWith({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      sourceKey: 'LINKEDIN',
    });
  });

  it('does not ask for a grouping whose field is missing', async () => {
    render(
      <JotaiProvider store={createStore()}>
        <MockedProvider mocks={[overviewMock(buildOverview({}))]}>
          <AnalyticsOverviewTab
            filter={CRM_ANALYTICS_DEFAULT_FILTER}
            meta={{
              ...META,
              fields: {
                ...META.fields,
                positionsAppliedFor: 'MISSING',
                applicantSource: 'WRONG_TYPE',
              },
            }}
            onResetFilter={jest.fn()}
          />
        </MockedProvider>
      </JotaiProvider>,
    );

    expect(
      await screen.findByText(
        'The positions field on People is missing or has the wrong type, so tracks cannot be shown.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The source field on People is missing or has the wrong type, so sources cannot be shown.',
      ),
    ).toBeInTheDocument();
  });

  it('lists ten people to follow up until asked for all', async () => {
    const user = userEvent.setup();
    const rows: AnalyticsStuckRow[] = Array.from(
      { length: 12 },
      (_, index) => ({
        personId: `person-${index}`,
        displayName: `Person number ${index}`,
        stageKey: 'NEW',
        stageLabel: 'New',
        stageEnteredAt: '2026-10-27T00:00:00.000Z',
        daysInStage: 20,
        daysOverLimit: 6,
        isLowerBound: false,
      }),
    );

    renderTab([
      overviewMock(
        buildOverview({ stuck: { rows, total: 12, hasLimits: true } }),
      ),
    ]);

    expect(await screen.findByText('Person number 9')).toBeInTheDocument();
    expect(screen.queryByText('Person number 10')).not.toBeInTheDocument();

    await user.click(screen.getByText('Show all'));

    expect(screen.getByText('Person number 11')).toBeInTheDocument();
  });

  describe('when the previous period starts before tracking', () => {
    it('hides the change on the default last 7 days', async () => {
      renderTab([
        overviewMock(
          buildOverview({ trackingStartedAt: '2026-10-26T00:00:00.000Z' }),
        ),
      ]);

      expect(await screen.findByText('86')).toBeInTheDocument();
      expect(
        screen.queryByText(/against the previous period/),
      ).not.toBeInTheDocument();
    });

    it('hides the change on a custom range starting at tracking start', async () => {
      const overview = buildOverview({
        trackingStartedAt: '2026-10-27T00:00:00.000Z',
      });

      renderTab([
        overviewMock({
          ...overview,
          figures: {
            ...overview.figures,
            newApplicationsFrom: '2026-10-27',
            newApplicationsTo: '2026-11-07',
          },
        }),
      ]);

      expect(await screen.findByText('Oct 27 to Nov 7')).toBeInTheDocument();
      expect(
        screen.queryByText(/against the previous period/),
      ).not.toBeInTheDocument();
    });
  });

  it('always shows an unmapped stage with its raw value', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByText('Unmapped: LEGACY_TEST'),
    ).toBeInTheDocument();
  });

  it('labels a row of people with no stage in the page language', async () => {
    renderTab([
      overviewMock(
        buildOverview({
          stageTotals: [
            {
              rowKey: 'NO_STAGE',
              label: 'Stored server text',
              rowKind: 'NO_STAGE',
              parentStageKey: null,
              count: 7,
              pastLimitCount: null,
              inactiveCount: 0,
            },
          ],
        }),
      ),
    ]);

    expect(await screen.findByText('No stage')).toBeInTheDocument();
    expect(screen.queryByText('Stored server text')).not.toBeInTheDocument();
  });

  it('says everyone without a filter and matching people with one', async () => {
    const filteredRequest = {
      query: GET_CRM_ANALYTICS_OVERVIEW,
      variables: {
        filter: { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'LINKEDIN' },
      },
    };

    const { unmount } = renderTab([overviewMock(buildOverview({}))]);

    expect(
      await screen.findByText('Everyone in People, including non-applicants'),
    ).toBeInTheDocument();

    unmount();

    render(
      <JotaiProvider store={createStore()}>
        <MockedProvider
          mocks={[
            {
              request: filteredRequest,
              result: overviewMock(buildOverview({})).result,
            },
          ]}
        >
          <AnalyticsOverviewTab
            filter={filteredRequest.variables.filter}
            meta={META}
            onResetFilter={jest.fn()}
          />
        </MockedProvider>
      </JotaiProvider>,
    );

    expect(
      await screen.findByText('People matching these filters'),
    ).toBeInTheDocument();
  });

  it('never shows a number for unknown new applications', async () => {
    const overview = buildOverview({});

    renderTab([
      overviewMock({
        ...overview,
        figures: {
          ...overview.figures,
          newApplications: null,
          newApplicationsPrevious: null,
          importedApplications: null,
        },
      }),
    ]);

    expect(await screen.findByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText('86')).not.toBeInTheDocument();
  });

  it('shows the signed figure only when asked to', async () => {
    renderTab([overviewMock(buildOverview({}))]);

    await screen.findByText('1,284');

    expect(screen.queryByText('Signed')).not.toBeInTheDocument();
  });

  it('reports imported people left out by the date filter', async () => {
    renderTab([overviewMock(buildOverview({ importedExcludedByDate: 42000 }))]);

    expect(
      await screen.findByText(
        '42,000 imported people have no known application date and are not shown.',
      ),
    ).toBeInTheDocument();
  });

  it('offers a reset when no people match', async () => {
    const user = userEvent.setup();
    const onResetFilter = jest.fn();
    const overview = buildOverview({});

    renderTab(
      [
        overviewMock({
          ...overview,
          figures: { ...overview.figures, totalContacts: 0, activePeople: 0 },
        }),
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
    renderTab([overviewMock(null)]);

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });
});
