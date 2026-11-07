import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ComponentProps } from 'react';

import { AnalyticsReportsTab } from '@/crm-analytics/components/AnalyticsReportsTab';
import { GET_CRM_ANALYTICS_REPORT } from '@/crm-analytics/graphql/getCrmAnalyticsReport';
import { GET_CRM_ANALYTICS_REPORTS } from '@/crm-analytics/graphql/getCrmAnalyticsReports';
import {
  type AnalyticsReport,
  type AnalyticsReportListItem,
} from '@/crm-analytics/types/AnalyticsApi';

const mockToast = jest.fn();
const mockDownloadPdf = jest.fn();

jest.mock('@/crm-analytics/report-pdf/downloadAnalyticsReportPdf', () => ({
  downloadAnalyticsReportPdf: (report: AnalyticsReport) =>
    mockDownloadPdf(report),
}));

jest.mock('@/apollo/components/ToastOnQueryErrorEffect', () => ({
  ToastOnQueryErrorEffect: ({ error }: { error?: ErrorLike }) => {
    if (error !== undefined) {
      mockToast(error);
    }

    return null;
  },
}));

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
  trackingStartedAt: '2026-08-01T00:00:00.000Z',
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
        <AnalyticsReportsTab />
      </MockedProvider>
    </JotaiProvider>,
  );

describe('AnalyticsReportsTab', () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockDownloadPdf.mockReset();
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

  it('opens with answers, the notes and a chart for each view', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    expect(
      await screen.findByText(/^Generated Nov 2, 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tracking started Aug 1, 2026. Imported people count in current totals only, never in rates.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('+12 against the previous period').parentElement,
    ).toHaveTextContent('New applications86');
    expect(screen.getByText('Significant changes')).toBeInTheDocument();
    expect(screen.getByText('From new to signed')).toBeInTheDocument();
    expect(screen.getByText('Conversion at each step')).toBeInTheDocument();
    expect(
      screen.getByText('How many people are in each track?'),
    ).toBeInTheDocument();
    expect(screen.getByText('What moved this period?')).toBeInTheDocument();
    expect(
      screen.getByText('Who is past their stage limit?'),
    ).toBeInTheDocument();
  });

  it('keeps each table behind Show numbers until asked', async () => {
    const user = userEvent.setup();

    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    const card = await screen.findByRole('region', {
      name: 'Who is past their stage limit?',
    });

    expect(
      screen.queryByRole('table', { name: 'People past their stage limit' }),
    ).not.toBeInTheDocument();

    await user.click(
      within(card).getByRole('button', { name: 'Show numbers' }),
    );

    expect(
      await screen.findByRole('table', {
        name: 'People past their stage limit',
      }),
    ).toHaveTextContent('214');
  });

  it('shows a dash, never 0%, for an overall conversion it does not know', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    const answer = (await screen.findByText('Overall conversion')).parentElement;

    expect(answer).toHaveTextContent('Not enough data');
    expect(answer).not.toHaveTextContent('0%');
  });

  it('draws stored history as line charts and leaves them out when absent', async () => {
    const user = userEvent.setup();

    renderTab([
      listMock([LATEST_WEEK, EARLIER_WEEK]),
      reportMock(buildReport(EARLIER_WEEK)),
      reportMock(
        buildReport(LATEST_WEEK, {
          trendSeries: [
            {
              metric: 'NEW_APPLICATIONS',
              stageKey: null,
              groupKey: null,
              groupLabel: null,
              unavailableReason: null,
              points: [
                {
                  bucketStart: '2026-10-26',
                  value: 86,
                  previousValue: null,
                  size: null,
                  previousSize: null,
                  isPartial: false,
                },
              ],
            },
          ],
        }),
      ),
    ]);

    expect(
      await screen.findByText('New applications over time'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Oct 19 to Oct 25, 2026' }),
    );

    await screen.findByText('Weekly report, Oct 19 to Oct 25, 2026');

    expect(
      screen.queryByText('New applications over time'),
    ).not.toBeInTheDocument();
  });

  describe('the PDF download', () => {
    const getDownloadButton = () =>
      screen.findByRole('button', { name: 'Download PDF' });

    it('downloads the report that is open', async () => {
      const user = userEvent.setup();
      const report = buildReport(LATEST_WEEK);

      mockDownloadPdf.mockResolvedValue(undefined);

      renderTab([listMock([LATEST_WEEK]), reportMock(report)]);

      await user.click(await getDownloadButton());

      await waitFor(() =>
        expect(mockDownloadPdf).toHaveBeenCalledWith(
          expect.objectContaining({ periodStart: report.periodStart }),
        ),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says so when it fails, and can be tried again', async () => {
      const user = userEvent.setup();

      mockDownloadPdf.mockRejectedValueOnce(new Error('No fonts'));
      mockDownloadPdf.mockResolvedValueOnce(undefined);

      renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

      await user.click(await getDownloadButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The PDF could not be made. Please try again.',
      );

      await user.click(await getDownloadButton());

      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
      );
    });

    it('does not carry a failure over to another report', async () => {
      const user = userEvent.setup();

      mockDownloadPdf.mockRejectedValueOnce(new Error('No fonts'));

      renderTab([
        listMock([LATEST_WEEK, LATEST_MONTH]),
        reportMock(buildReport(LATEST_WEEK)),
        reportMock(buildReport(LATEST_MONTH)),
      ]);

      await user.click(await getDownloadButton());

      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'October 2026' }));

      expect(
        await screen.findByText('Monthly report, October 2026'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('marks only the significant comparison', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    const significantRow = (await screen.findByText('+46')).closest('tr');

    expect(significantRow).toHaveTextContent('Significant change');
    expect(screen.getAllByText('Significant change')).toHaveLength(1);
  });

  describe('the first report, whose previous period starts before tracking', () => {
    const expectNoComparison = () => {
      expect(
        screen.getByText('There is no earlier period to compare with yet.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('table', {
          name: 'Compared with the previous period',
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Significant change')).not.toBeInTheDocument();
    };

    it('shows a weekly report with no comparison and no significant count', async () => {
      renderTab([
        listMock([LATEST_WEEK]),
        reportMock(
          buildReport(LATEST_WEEK, {
            trackingStartedAt: '2026-10-26T00:00:00.000Z',
          }),
        ),
      ]);

      expect(await screen.findByText('86')).toBeInTheDocument();
      expect(screen.getByText('No earlier period yet')).toBeInTheDocument();
      expect(screen.queryByText(/against the previous/)).not.toBeInTheDocument();
      expectNoComparison();
    });

    it('shows a monthly report with a few tracked days before it the same way', async () => {
      renderTab([
        listMock([LATEST_MONTH]),
        reportMock(
          buildReport(LATEST_MONTH, {
            trackingStartedAt: '2026-09-26T00:00:00.000Z',
          }),
        ),
      ]);

      expect(await screen.findByText('86')).toBeInTheDocument();
      expectNoComparison();
    });

    it('says only that when new applications are not known either', async () => {
      renderTab([
        listMock([LATEST_WEEK]),
        reportMock(
          buildReport(LATEST_WEEK, {
            trackingStartedAt: '2026-10-26T00:00:00.000Z',
            newApplications: null,
            newApplicationsPrevious: null,
          }),
        ),
      ]);

      expect(
        await screen.findByText(
          'There is no earlier period to compare with yet.',
        ),
      ).toBeInTheDocument();
      expect(
        (await screen.findByText('New applications')).parentElement,
      ).toHaveTextContent('Not enough data');
      expect(screen.queryByText(/^Significant change$/)).not.toBeInTheDocument();
    });
  });

  it('marks a report built on provisional definitions', async () => {
    renderTab([
      listMock([LATEST_WEEK]),
      reportMock(buildReport(LATEST_WEEK, { isProvisional: true })),
    ]);

    expect(
      await screen.findByText(
        'Built on provisional definitions. It will be rebuilt once they are confirmed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stays as generated/)).not.toBeInTheDocument();
  });

  it('has no provisional marker on a confirmed report or one from before the field', async () => {
    renderTab([listMock([LATEST_WEEK]), reportMock(buildReport(LATEST_WEEK))]);

    expect(await screen.findByText(/stays as generated/)).toBeInTheDocument();
    expect(screen.queryByText(/provisional/)).not.toBeInTheDocument();
  });

  it('translates known measures by key and keeps the stored label for others', async () => {
    renderTab([
      listMock([LATEST_WEEK]),
      reportMock(
        buildReport(LATEST_WEEK, {
          comparisons: [
            {
              metricKey: 'NEW_APPLICATIONS',
              label: 'Stored applications text',
              current: 86,
              previous: 40,
              isSignificant: false,
            },
            {
              metricKey: 'ENTERED_NEW',
              label: 'Stored stage text',
              current: 31,
              previous: 30,
              isSignificant: false,
            },
            {
              metricKey: 'SOMETHING_NEWER',
              label: 'Stored newer text',
              current: 1,
              previous: 2,
              isSignificant: false,
            },
          ],
        }),
      ),
    ]);

    const table = await screen.findByRole('table', {
      name: 'Compared with the previous period',
    });

    expect(within(table).getByText('New applications')).toBeInTheDocument();
    expect(within(table).getByText('Entered New')).toBeInTheDocument();
    expect(within(table).getByText('Stored newer text')).toBeInTheDocument();
    expect(within(table).queryByText(/^Stored applications/)).toBeNull();
  });

  it('reads stage headers from the report, not from today', async () => {
    const user = userEvent.setup();

    renderTab([
      listMock([LATEST_WEEK]),
      reportMock(
        buildReport(LATEST_WEEK, {
          categories: {
            ...BASE,
            groupBy: 'TRACK_PROGRAM',
            distinctPeople: 0,
            peopleInSeveral: 0,
            peopleInSeveralTracks: 0,
            stepStageKeys: ['NEW'],
            rows: [
              {
                key: 'ROBOTICS',
                parentKey: null,
                label: 'Robotics',
                isUnmapped: false,
                people: 1,
                activePeople: 1,
                newApplications: 1,
                cohortSize: 1,
                overallEligible: 0,
                overallRate: null,
                overallSoFarRate: null,
                stepRates: [
                  { stageKey: 'NEW', eligible: 0, rate: null, soFarRate: null },
                ],
              },
            ],
          },
          funnel: {
            ...BASE,
            cohortSize: 1,
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
            rows: [
              {
                stageKey: 'NEW',
                label: 'New as it was then',
                windowDays: 14,
                entered: 1,
                eligible: 0,
                reachedNext: 0,
                timedOut: 0,
                exited: 0,
                inWindow: 1,
                stepRate: null,
                soFarRate: null,
                dropOffRate: null,
                isUnderMinimum: true,
                medianDays: null,
                completedStays: 0,
              },
            ],
            lowestStepStageKey: null,
          },
        }),
      ),
    ]);

    const card = await screen.findByRole('region', {
      name: 'How many people are in each track?',
    });

    await user.click(
      within(card).getByRole('button', { name: 'Show numbers' }),
    );

    expect(
      await within(card).findByRole('columnheader', {
        name: 'New as it was then to next',
      }),
    ).toBeInTheDocument();
  });

  describe('an old report the page can no longer read', () => {
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      consoleError = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    it('stays inside the viewer, and the other reports still open', async () => {
      const user = userEvent.setup();
      const { comparisons: _comparisons, ...reportWithoutComparisons } =
        buildReport(LATEST_WEEK);

      renderTab([
        listMock([LATEST_WEEK, EARLIER_WEEK]),
        reportMock(reportWithoutComparisons as AnalyticsReport),
        reportMock(buildReport(EARLIER_WEEK)),
      ]);

      expect(
        await screen.findByText('This report cannot be displayed'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', { name: 'Reports' }),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Oct 19 to Oct 25, 2026' }),
      );

      expect(
        await screen.findByText('Weekly report, Oct 19 to Oct 25, 2026'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('This report cannot be displayed'),
      ).not.toBeInTheDocument();
    });
  });

  it('compares with a previous period that starts the day tracking started', async () => {
    renderTab([
      listMock([LATEST_WEEK]),
      reportMock(
        buildReport(LATEST_WEEK, {
          trackingStartedAt: '2026-10-19T00:00:00.000Z',
        }),
      ),
    ]);

    expect(await screen.findByText('+46')).toBeInTheDocument();
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
      screen.queryByText('Are newer groups converting better?'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'October 2026' }));

    expect(
      await screen.findByText('Monthly report, October 2026'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Are newer groups converting better?'),
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
