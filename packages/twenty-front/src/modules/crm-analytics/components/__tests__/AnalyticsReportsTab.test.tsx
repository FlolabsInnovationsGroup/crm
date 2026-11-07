import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsReportsTab } from '@/crm-analytics/components/AnalyticsReportsTab';
import { GET_CRM_ANALYTICS_REPORT } from '@/crm-analytics/graphql/getCrmAnalyticsReport';
import { GET_CRM_ANALYTICS_REPORTS } from '@/crm-analytics/graphql/getCrmAnalyticsReports';
import {
  type AnalyticsMeta,
  type AnalyticsReport,
  type AnalyticsReportListItem,
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

const META = { stages: [] as AnalyticsMeta['stages'] } as AnalyticsMeta;

const LATEST_WEEK: AnalyticsReportListItem = {
  periodType: 'WEEK',
  periodStart: '2026-10-26',
  periodEnd: '2026-11-02',
  generatedAt: '2026-11-02T02:30:00.000Z',
};

const EARLIER_WEEK: AnalyticsReportListItem = {
  periodType: 'WEEK',
  periodStart: '2026-10-19',
  periodEnd: '2026-10-26',
  generatedAt: '2026-10-26T02:30:00.000Z',
};

const LATEST_MONTH: AnalyticsReportListItem = {
  periodType: 'MONTH',
  periodStart: '2026-10-01',
  periodEnd: '2026-11-01',
  generatedAt: '2026-11-01T02:30:00.000Z',
};

const BASE = {
  asOf: '2026-11-02T02:30:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

const buildReport = (
  listItem: AnalyticsReportListItem,
  overrides: Partial<AnalyticsReport> = {},
): AnalyticsReport => ({
  ...listItem,
  ...BASE,
  newApplications: 86,
  newApplicationsPrevious: 74,
  categories: {
    ...BASE,
    groupBy: 'TRACK_PROGRAM',
    distinctPeople: 0,
    peopleInSeveral: 0,
    peopleInSeveralTracks: 0,
    stepStageKeys: [],
    rows: [],
  },
  funnel: {
    ...BASE,
    cohortSize: 0,
    cohortExcludedUnmapped: 0,
    overall: {
      finalStageKey: null,
      windowDays: 90,
      eligible: 0,
      reached: 0,
      rate: null,
      soFarRate: null,
      isUnderMinimum: true,
    },
    rows: [],
    lowestStepStageKey: null,
  },
  movement: [
    {
      stageKey: 'NEW',
      label: 'New',
      enteredInPeriod: 31,
      leftInPeriod: 17,
      countNow: 900,
    },
  ],
  stuckByStage: [{ stageKey: 'CONTACTED', label: 'Contacted', count: 214 }],
  comparisons: [
    {
      metricKey: 'NEW_APPLICATIONS',
      label: 'New applications',
      current: 86,
      previous: 40,
      isSignificant: true,
    },
    {
      metricKey: 'ENTERED_NEW',
      label: 'Entered New',
      current: 31,
      previous: 30,
      isSignificant: false,
    },
  ],
  cohorts: [],
  ...overrides,
});

const listMock = (reports: AnalyticsReportListItem[] | null) => ({
  request: { query: GET_CRM_ANALYTICS_REPORTS },
  result: {
    data: {
      getCrmAnalyticsReports: {
        __typename: 'CrmAnalyticsPayload',
        payload: reports,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const reportMock = (report: AnalyticsReport) => ({
  request: {
    query: GET_CRM_ANALYTICS_REPORT,
    variables: {
      periodType: report.periodType,
      periodStart: report.periodStart,
    },
  },
  result: {
    data: {
      getCrmAnalyticsReport: {
        __typename: 'CrmAnalyticsPayload',
        payload: report,
      },
    },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderTab = (mocks: ComponentProps<typeof MockedProvider>['mocks']) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <AnalyticsReportsTab meta={META} />
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsReportsTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('lists each period type newest first and opens the newest report', async () => {
    renderTab([
      listMock([EARLIER_WEEK, LATEST_MONTH, LATEST_WEEK]),
      reportMock(buildReport(LATEST_WEEK)),
    ]);

    expect(
      await screen.findByText('Weekly report, Oct 26 to Nov 1, 2026'),
    ).toBeInTheDocument();

    const reportButtons = within(
      screen.getByRole('navigation', { name: 'Reports' }),
    ).getAllByRole('button');

    expect(reportButtons.map((button) => button.textContent)).toEqual([
      'Oct 26 to Nov 1, 2026',
      'Oct 19 to Oct 25, 2026',
      'October 2026',
    ]);
    expect(reportButtons[0]).toHaveAttribute('aria-current', 'true');
    expect(reportButtons[1]).not.toHaveAttribute('aria-current');
  });

  it('shows the generated time, the tracking caveat and the shared tables', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    expect(
      await screen.findByText(/^Generated Nov 2, 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tracking started Oct 27, 2026. Imported people count in current totals only, never in rates.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '86 new applications, +12 against the previous period. 1 significant change.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Stage by stage')).toBeInTheDocument();
    expect(screen.getByText('Tracks and programs')).toBeInTheDocument();
    expect(screen.getByText('Stage movement')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
  });

  it('marks only the significant comparison', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    const significantRow = (await screen.findByText('+46')).closest('tr');

    expect(significantRow).toHaveTextContent('Significant change');
    expect(screen.getAllByText('Significant change')).toHaveLength(1);
  });

  it('opens the report that is picked, with its cohorts when it has them', async () => {
    const user = userEvent.setup();

    renderTab([
      listMock([LATEST_WEEK, LATEST_MONTH]),
      reportMock(buildReport(LATEST_WEEK)),
      reportMock(
        buildReport(LATEST_MONTH, {
          cohorts: [
            {
              bucketStart: '2026-10-01',
              size: 120,
              cells: [],
              overallRate: null,
              overallSoFarRate: null,
            },
          ],
        }),
      ),
    ]);

    await screen.findByText('Weekly report, Oct 26 to Nov 1, 2026');

    expect(
      screen.queryByText('Conversion by application month'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'October 2026' }));

    expect(
      await screen.findByText('Monthly report, October 2026'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Conversion by application month'),
    ).toBeInTheDocument();
  });

  it('says when there are no reports yet', async () => {
    renderTab([listMock([])]);

    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
  });

  it('treats a null list as switched off', async () => {
    renderTab([listMock(null)]);

    expect(
      await screen.findByText('Analytics is switched off.'),
    ).toBeInTheDocument();
  });

  it('shows the access message without a toast when forbidden', async () => {
    renderTab([
      {
        request: { query: GET_CRM_ANALYTICS_REPORTS },
        result: {
          errors: [
            { message: 'Query failed', extensions: { code: 'FORBIDDEN' } },
          ],
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
      },
    ]);

    expect(
      await screen.findByText(
        'You do not have access to analytics. Ask an admin.',
      ),
    ).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
