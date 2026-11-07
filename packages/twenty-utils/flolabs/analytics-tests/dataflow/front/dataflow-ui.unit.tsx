import { type ErrorLike } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { join } from 'path';
import { type ComponentProps, type ReactElement, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AnalyticsCategoryTable } from '@/crm-analytics/components/AnalyticsCategoryTable';
import { AnalyticsCohortTable } from '@/crm-analytics/components/AnalyticsCohortTable';
import { AnalyticsContent } from '@/crm-analytics/components/AnalyticsContent';
import { AnalyticsFiguresRow } from '@/crm-analytics/components/AnalyticsFiguresRow';
import { AnalyticsFilterBar } from '@/crm-analytics/components/AnalyticsFilterBar';
import { AnalyticsMovementTable } from '@/crm-analytics/components/AnalyticsMovementTable';
import { AnalyticsOverviewTab } from '@/crm-analytics/components/AnalyticsOverviewTab';
import { AnalyticsReportsTab } from '@/crm-analytics/components/AnalyticsReportsTab';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import { AnalyticsStageTotalsTable } from '@/crm-analytics/components/AnalyticsStageTotalsTable';
import { AnalyticsStuckTable } from '@/crm-analytics/components/AnalyticsStuckTable';
import { AnalyticsSyncLine } from '@/crm-analytics/components/AnalyticsSyncLine';
import { AnalyticsTrendChart } from '@/crm-analytics/components/AnalyticsTrendChart';
import { AnalyticsTrendTable } from '@/crm-analytics/components/AnalyticsTrendTable';
import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { GET_CRM_ANALYTICS_META } from '@/crm-analytics/graphql/getCrmAnalyticsMeta';
import { GET_CRM_ANALYTICS_OVERVIEW } from '@/crm-analytics/graphql/getCrmAnalyticsOverview';
import { GET_CRM_ANALYTICS_REPORT } from '@/crm-analytics/graphql/getCrmAnalyticsReport';
import { GET_CRM_ANALYTICS_REPORTS } from '@/crm-analytics/graphql/getCrmAnalyticsReports';
import {
  type AnalyticsCategories,
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsMeta,
  type AnalyticsOverview,
  type AnalyticsReport,
  type AnalyticsReportListItem,
  type AnalyticsStageDefinition,
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildTrendChartSeries } from '@/crm-analytics/utils/buildTrendChartSeries';

const mockOpenRecordInSidePanel = jest.fn();

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('@/apollo/components/ToastOnQueryErrorEffect', () => ({
  ToastOnQueryErrorEffect: ({ error: _error }: { error?: ErrorLike }) => null,
}));

jest.mock(
  '@/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart',
  () => ({ GraphWidgetLineChart: () => null }),
);

type GraphEdge = { id: string; from: string; to: string; field: string };

const graph: { edges: GraphEdge[] } = JSON.parse(
  readFileSync(join(__dirname, '..', 'dataflow-graph.json'), 'utf8'),
);

const BASE = {
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

// Every field holds its own number, so a field wired to the wrong place fails its test.
const FIGURES: AnalyticsOverview['figures'] = {
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
};

const STUCK_ROW = {
  personId: '20202020-0000-4000-8000-000000000001',
  displayName: 'Ada Lovelace',
  stageKey: 'CONTACTED',
  stageLabel: 'Contacted',
  stageEnteredAt: '2026-10-01T00:00:00.000Z',
  daysInStage: 37,
  daysOverLimit: 23,
  isLowerBound: false,
};

const buildFunnelRow = (
  row: Partial<AnalyticsFunnel['rows'][number]> & { stageKey: string; label: string },
): AnalyticsFunnel['rows'][number] => ({
  windowDays: 14,
  entered: 0,
  eligible: 0,
  reachedNext: 0,
  timedOut: 0,
  exited: 0,
  inWindow: 0,
  stepRate: null,
  soFarRate: null,
  dropOffRate: null,
  isUnderMinimum: true,
  medianDays: null,
  completedStays: 0,
  ...row,
});

const FUNNEL: AnalyticsFunnel = {
  ...BASE,
  cohortSize: 1000,
  cohortExcludedUnmapped: 7,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 40,
    reached: 10,
    rate: 0.25,
    soFarRate: 0.09,
    isUnderMinimum: false,
  },
  rows: [
    buildFunnelRow({
      stageKey: 'NEW',
      label: 'New',
      entered: 1000,
      eligible: 300,
      reachedNext: 120,
      timedOut: 130,
      exited: 50,
      inWindow: 100,
      stepRate: 0.4,
      soFarRate: 0.5,
      dropOffRate: 0.6,
      isUnderMinimum: false,
      medianDays: 6.5,
      completedStays: 7,
    }),
    buildFunnelRow({
      stageKey: 'CONTACTED',
      label: 'Contacted',
      entered: 400,
      eligible: 12,
      reachedNext: 3,
      timedOut: 9,
      stepRate: 0.25,
      soFarRate: 0.3,
      dropOffRate: 0.75,
    }),
    buildFunnelRow({
      stageKey: 'BEFORE_MEETING',
      label: 'Before meeting',
      entered: 5,
      inWindow: 5,
      soFarRate: 0.2,
    }),
    buildFunnelRow({ stageKey: 'SIGNED', label: 'Signed', windowDays: null, entered: 3 }),
  ],
  lowestStepStageKey: 'CONTACTED',
};

const buildCategoryRow = (
  row: Partial<AnalyticsCategories['rows'][number]> & { key: string; label: string },
): AnalyticsCategories['rows'][number] => ({
  parentKey: null,
  isUnmapped: false,
  people: 1,
  activePeople: 1,
  newApplications: 1,
  cohortSize: 1,
  overallEligible: 0,
  overallRate: null,
  overallSoFarRate: null,
  stepRates: [],
  ...row,
});

const CATEGORIES: AnalyticsCategories = {
  ...BASE,
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 800,
  peopleInSeveral: 20,
  peopleInSeveralTracks: 5,
  stepStageKeys: ['NEW', 'CONTACTED'],
  rows: [
    buildCategoryRow({
      key: 'BUSINESS',
      label: 'Business',
      people: 500,
      activePeople: 321,
      newApplications: 45,
      cohortSize: 67,
      overallEligible: 89,
      overallRate: 0.27,
      stepRates: [
        { stageKey: 'NEW', eligible: 44, rate: 0.41, soFarRate: 0.61 },
        { stageKey: 'CONTACTED', eligible: 0, rate: null, soFarRate: 0.15 },
      ],
    }),
    buildCategoryRow({ key: 'ROBOTICS', label: 'Robotics', people: 400, overallSoFarRate: 0.11 }),
    buildCategoryRow({ key: 'SENSOR', label: 'Sensor', parentKey: 'ROBOTICS', people: 150 }),
    buildCategoryRow({ key: 'OLD_TRACK', label: 'OLD_TRACK', isUnmapped: true, people: 3 }),
  ],
};

const STAGES: AnalyticsStageDefinition[] = ['New', 'Contacted'].map((label, rank) => ({
  stageKey: label.toUpperCase(),
  label,
  kind: 'MAIN',
  rank,
  limitDays: 14,
  windowDays: 14,
  isSuccess: false,
}));

const POINTS: AnalyticsTrendPoint[] = [
  { bucketStart: '2026-11-02', value: 86, previousValue: 52, size: null, isPartial: true },
  { bucketStart: '2026-10-26', value: 40, previousValue: 26, size: null, isPartial: false },
];

const RATE_POINTS: AnalyticsTrendPoint[] = [
  { bucketStart: '2026-10-26', value: 0.25, previousValue: 0.125, size: 44, isPartial: false },
];

const COHORT_ROWS: AnalyticsTrends['cohorts'] = [
  {
    bucketStart: '2026-10-01',
    size: 120,
    cells: [
      { stageKey: 'NEW', entered: 120, eligible: 120, rate: 0.42, soFarRate: 0.42, isMature: true },
      { stageKey: 'CONTACTED', entered: 50, eligible: 20, rate: null, soFarRate: 0.12, isMature: false },
    ],
    overallRate: 0.33,
    overallSoFarRate: 0.33,
  },
  {
    bucketStart: '2026-09-01',
    size: 77,
    cells: [],
    overallRate: null,
    overallSoFarRate: 0.05,
  },
];

const MOVEMENT_ROWS = [
  { stageKey: 'CONTACTED', label: 'Contacted', enteredInPeriod: 31, leftInPeriod: 17, countNow: 205 },
];

const META: AnalyticsMeta = {
  ...BASE,
  state: 'READY',
  isProvisional: false,
  showSignedFigure: false,
  sync: {
    lastSuccessfulSyncAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    lastReconciliationAt: null,
    lastAttemptAt: null,
    lastAttemptStatus: 'OK',
    isStale: false,
    restoredInLastReconciliation: 0,
  },
  fields: {
    stage: 'OK',
    isStageAuditLogged: true,
    positionsAppliedFor: 'OK',
    applicantSource: 'OK',
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
  },
  stages: STAGES,
  tracks: [{ key: 'ROBOTICS', label: 'Robotics track' }],
  programs: [{ key: 'SENSOR', label: 'Sensor program', trackKey: 'ROBOTICS' }],
  sources: [{ key: 'LINKEDIN', label: 'LinkedIn source' }],
};

const OVERVIEW: AnalyticsOverview = {
  ...BASE,
  importedExcludedByDate: 2000,
  figures: FIGURES,
  stageTotals: [],
  stuck: { rows: [], total: 0, hasLimits: true },
};

const REPORT_ITEM: AnalyticsReportListItem = {
  periodType: 'WEEK',
  periodStart: '2026-10-26',
  periodEnd: '2026-11-02',
  generatedAt: '2026-11-02T02:30:00.000Z',
};

const REPORT: AnalyticsReport = {
  ...REPORT_ITEM,
  ...BASE,
  newApplications: 86,
  newApplicationsPrevious: 74,
  categories: CATEGORIES,
  funnel: FUNNEL,
  movement: MOVEMENT_ROWS,
  stuckByStage: [{ stageKey: 'NEW', label: 'New', count: 214 }],
  comparisons: [
    { metricKey: 'NEW_APPLICATIONS', label: 'New applications', current: 88, previous: 40, isSignificant: true },
    { metricKey: 'ENTERED_NEW', label: 'Entered New', current: 3, previous: 2, isSignificant: false },
  ],
  cohorts: COHORT_ROWS,
};

const payloadMock = (query: unknown, rootField: string, variables: object, payload: unknown) => ({
  request: { query, variables },
  result: { data: { [rootField]: { __typename: 'CrmAnalyticsPayload', payload } } },
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const renderWithClient = (ui: ReactElement, mocks: ComponentProps<typeof MockedProvider>['mocks']) =>
  render(
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter>{ui}</MemoryRouter>
      </MockedProvider>
    </JotaiProvider>,
  );

const rowOf = (name: string) => screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement;
const textRowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;
const shows = (text: string | RegExp) => expect(screen.getByText(text)).toBeInTheDocument();

const renderFigures = () =>
  render(<AnalyticsFiguresRow figures={FIGURES} hasLimits showSignedFigure />);
const renderTotals = () =>
  render(
    <AnalyticsStageTotalsTable
      rows={[
        { rowKey: 'NEW', label: 'New', rowKind: 'MAIN', parentStageKey: null, count: 900, pastLimitCount: 120 },
        { rowKey: 'UNMAPPED:OLD', label: 'OLD', rowKind: 'UNMAPPED', parentStageKey: null, count: 3, pastLimitCount: null },
      ]}
    />,
  );
const renderStuck = (overrides: Partial<typeof STUCK_ROW> = {}, total = 1, hasLimits = true) =>
  render(<AnalyticsStuckTable stuck={{ rows: [{ ...STUCK_ROW, ...overrides }], total, hasLimits }} />);
const renderLedger = (funnel: AnalyticsFunnel = FUNNEL) => render(<AnalyticsStageLedger funnel={funnel} />);
const renderCategories = () => render(<AnalyticsCategoryTable categories={CATEGORIES} stages={STAGES} />);
const renderTrendTable = () =>
  render(<AnalyticsTrendTable points={POINTS} metric="NEW_APPLICATIONS" period="WEEK" minimumSample={30} />);
const renderCohorts = () =>
  render(<AnalyticsCohortTable rows={COHORT_ROWS} stages={STAGES} period="MONTH" minimumSample={30} />);
const renderMovement = () => render(<AnalyticsMovementTable rows={MOVEMENT_ROWS} />);

const renderContent = (meta: Partial<AnalyticsMeta>) =>
  renderWithClient(<AnalyticsContent />, [
    payloadMock(GET_CRM_ANALYTICS_META, 'getCrmAnalyticsMeta', {}, { ...META, ...meta }),
    payloadMock(GET_CRM_ANALYTICS_OVERVIEW, 'getCrmAnalyticsOverview', { filter: CRM_ANALYTICS_DEFAULT_FILTER }, OVERVIEW),
  ]);

const renderReports = async () => {
  renderWithClient(<AnalyticsReportsTab meta={META} />, [
    payloadMock(GET_CRM_ANALYTICS_REPORTS, 'getCrmAnalyticsReports', {}, [REPORT_ITEM]),
    payloadMock(
      GET_CRM_ANALYTICS_REPORT,
      'getCrmAnalyticsReport',
      { periodType: REPORT_ITEM.periodType, periodStart: REPORT_ITEM.periodStart },
      REPORT,
    ),
  ]);

  await screen.findByText('Weekly report, Oct 26 to Nov 1, 2026');
};

const FilterBarHarness = ({
  meta = META,
  isPeriodEnabled = false,
  onChange,
}: {
  meta?: AnalyticsMeta;
  isPeriodEnabled?: boolean;
  onChange?: (filter: AnalyticsFilter) => void;
}) => {
  const [filter, setFilter] = useState(CRM_ANALYTICS_DEFAULT_FILTER);
  const [store] = useState(() => createStore());

  return (
    <JotaiProvider store={store}>
      <AnalyticsFilterBar
        filter={filter}
        meta={meta}
        isPeriodEnabled={isPeriodEnabled}
        onChange={(nextFilter) => {
          setFilter(nextFilter);
          onChange?.(nextFilter);
        }}
        onReset={() => setFilter(CRM_ANALYTICS_DEFAULT_FILTER)}
      />
    </JotaiProvider>
  );
};

const chooseInFilterBar = async (placeholder: string, option: string, isPeriodEnabled = false) => {
  const user = userEvent.setup();
  const onChange = jest.fn();

  render(<FilterBarHarness onChange={onChange} isPeriodEnabled={isPeriodEnabled} />);
  await user.click(screen.getByText(placeholder));
  await user.click(await screen.findByText(option));

  return onChange.mock.calls.at(-1)?.[0] as AnalyticsFilter;
};

const showsInReport = (text: string | RegExp) => async () => {
  await renderReports();
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
};

const CHECKS: Record<string, () => void | Promise<void>> = {
  'overview.figures.totalContacts': () => { renderFigures(); shows('42,975'); },
  'overview.figures.activePeople': () => { renderFigures(); shows('1,284'); },
  'overview.figures.newApplications': () => { renderFigures(); shows('86'); },
  'overview.figures.newApplicationsPrevious': () => { renderFigures(); shows('+12 against the previous period'); },
  'overview.figures.newApplicationsFrom': () => { renderFigures(); shows(/^Nov 1 to/); },
  'overview.figures.newApplicationsTo': () => { renderFigures(); shows(/to Nov 7$/); },
  'overview.figures.importedApplications': () => { renderFigures(); shows('42,371 imported, dates unknown'); },
  'overview.figures.stuckPeople': () => { renderFigures(); shows('214'); },
  'overview.figures.inactivePeople': () => { renderFigures(); shows('3,810 inactive'); },
  'overview.figures.signedPeople': () => { renderFigures(); shows('Signed'); shows('12'); },

  'overview.stageTotals[].label': () => { renderTotals(); shows('New'); },
  'overview.stageTotals[].count': () => { renderTotals(); expect(within(textRowOf('New')).getByText('900')).toBeInTheDocument(); },
  'overview.stageTotals[].pastLimitCount': () => { renderTotals(); expect(within(textRowOf('New')).getByText('120')).toBeInTheDocument(); },
  'overview.stageTotals[].rowKind': () => { renderTotals(); shows('Unmapped: OLD'); },

  'overview.stuck.rows[].displayName': () => { renderStuck(); shows('Ada Lovelace'); },
  'overview.stuck.rows[].stageLabel': () => { renderStuck(); shows('Contacted'); },
  'overview.stuck.rows[].daysInStage': () => { renderStuck(); shows('37'); },
  'overview.stuck.rows[].daysOverLimit': () => { renderStuck(); shows('23'); },
  'overview.stuck.rows[].isLowerBound': () => { renderStuck({ isLowerBound: true }); shows('at least 37'); },
  'overview.stuck.rows[].personId': async () => {
    const user = userEvent.setup();

    mockOpenRecordInSidePanel.mockClear();
    renderStuck();
    await user.click(screen.getByText('Ada Lovelace'));
    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: STUCK_ROW.personId,
      objectNameSingular: 'person',
    });
  },
  'overview.stuck.total': () => { renderStuck({}, 150); shows('Showing 1 of 150'); },
  'overview.stuck.hasLimits': () => { renderStuck({}, 1, false); shows('No stage limits are set, so this list is sorted by days in stage.'); },
  'overview.importedExcludedByDate': async () => {
    renderWithClient(
      <AnalyticsOverviewTab filter={CRM_ANALYTICS_DEFAULT_FILTER} meta={META} onResetFilter={jest.fn()} />,
      [payloadMock(GET_CRM_ANALYTICS_OVERVIEW, 'getCrmAnalyticsOverview', { filter: CRM_ANALYTICS_DEFAULT_FILTER }, OVERVIEW)],
    );
    expect(await screen.findByText('2,000 imported people have no known application date and are not shown.')).toBeInTheDocument();
  },

  'funnel.rows[].label': () => { renderLedger(); expect(screen.getByRole('rowheader', { name: 'Before meeting' })).toBeInTheDocument(); },
  'funnel.rows[].entered': () => { renderLedger(); expect(within(rowOf('New')).getByText('1,000')).toBeInTheDocument(); },
  'funnel.rows[].eligible': () => { renderLedger(); expect(within(rowOf('Contacted')).getByText('n=12')).toBeInTheDocument(); },
  'funnel.rows[].timedOut': () => { renderLedger(); expect(within(rowOf('New')).getByText('130')).toBeInTheDocument(); },
  'funnel.rows[].exited': () => { renderLedger(); expect(within(rowOf('New')).getByText('50')).toBeInTheDocument(); },
  'funnel.rows[].inWindow': () => { renderLedger(); expect(within(rowOf('New')).getByText('100')).toBeInTheDocument(); },
  'funnel.rows[].stepRate': () => { renderLedger(); expect(within(rowOf('New')).getByText('40%')).toBeInTheDocument(); },
  'funnel.rows[].soFarRate': () => { renderLedger(); expect(within(rowOf('Before meeting')).getByText('20% so far')).toBeInTheDocument(); },
  'funnel.rows[].isUnderMinimum': () => {
    renderLedger();
    expect(within(rowOf('New')).queryByText('n=300')).not.toBeInTheDocument();
    expect(within(rowOf('Contacted')).getByText('n=12')).toBeInTheDocument();
  },
  'funnel.rows[].medianDays': () => { renderLedger(); expect(within(rowOf('New')).getByText('6.5')).toBeInTheDocument(); },
  'funnel.rows[].completedStays': () => { renderLedger(); expect(within(rowOf('New')).getByText('n=7')).toBeInTheDocument(); },
  'funnel.lowestStepStageKey': () => {
    renderLedger();
    expect(screen.getAllByText('Lowest step')).toHaveLength(1);
    expect(within(rowOf('Contacted')).getByText('Lowest step')).toBeInTheDocument();
  },
  'funnel.overall.rate': () => { renderLedger(); expect(within(rowOf('Overall')).getByText('25%')).toBeInTheDocument(); },
  'funnel.overall.soFarRate': () => {
    renderLedger({ ...FUNNEL, overall: { ...FUNNEL.overall, eligible: 0, reached: 0, rate: null } });
    expect(within(rowOf('Overall')).getByText('9% so far')).toBeInTheDocument();
  },
  'funnel.overall.eligible': () => { renderLedger(); shows('10 of 40 reached Signed within 90 days'); },
  'funnel.cohortSize': () => { renderLedger(); shows(/Cohort size: 1,000, counted from/); },
  'funnel.cohortExcludedUnmapped': () => { renderLedger(); shows(/7 left out because every stage they had is unmapped\./); },

  'categories.rows[].label': () => { renderCategories(); shows('Business'); },
  'categories.rows[].isUnmapped': () => { renderCategories(); shows('Unmapped: OLD_TRACK'); },
  'categories.rows[].people': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('500')).toBeInTheDocument(); },
  'categories.rows[].activePeople': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('321')).toBeInTheDocument(); },
  'categories.rows[].newApplications': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('45')).toBeInTheDocument(); },
  'categories.rows[].cohortSize': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('67')).toBeInTheDocument(); },
  'categories.rows[].overallRate': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('27%')).toBeInTheDocument(); },
  'categories.rows[].overallSoFarRate': () => { renderCategories(); expect(within(textRowOf('Robotics')).getByText('11% so far')).toBeInTheDocument(); },
  'categories.rows[].stepRates[].rate': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('41%')).toBeInTheDocument(); },
  'categories.rows[].stepRates[].soFarRate': () => { renderCategories(); expect(within(textRowOf('Business')).getByText('15% so far')).toBeInTheDocument(); },
  'categories.distinctPeople': () => { renderCategories(); shows(/rows do not add up to 800\.$/); },
  'categories.peopleInSeveralTracks': () => { renderCategories(); shows(/^5 people count in several rows/); },
  'categories.peopleInSeveral': async () => {
    const user = userEvent.setup();

    renderCategories();
    await user.click(screen.getByRole('button', { name: 'Robotics' }));
    shows(/^20 people count in several rows/);
  },

  'trends.series[].bucketStart': () => { renderTrendTable(); shows('Nov 2, 2026'); },
  'trends.series[].value': () => { renderTrendTable(); expect(within(screen.getByText('Nov 2, 2026').closest('tr') as HTMLElement).getByText('86')).toBeInTheDocument(); },
  'trends.series[].previousValue': () => { renderTrendTable(); expect(within(screen.getByText('Nov 2, 2026').closest('tr') as HTMLElement).getByText('52')).toBeInTheDocument(); },
  'trends.series[].isPartial': () => { renderTrendTable(); expect(screen.getAllByText('in progress')).toHaveLength(1); },
  'trends.series[].size': () => {
    render(<AnalyticsTrendTable points={RATE_POINTS} metric="DROP_OFF" period="WEEK" minimumSample={30} />);
    shows('44');
  },
  'trends.unavailableReason': () => {
    render(
      <AnalyticsTrendChart
        title="Drop-off"
        trends={{ ...BASE, metric: 'DROP_OFF', stageKey: 'NEW', period: 'DAY', unavailableReason: 'DAILY_RATE', series: [], cohorts: [], movement: { from: '', to: '', rows: [] } }}
      />,
    );
    shows('Daily rates are not offered. Choose weeks or months in the Period filter.');
  },
  'trends.cohorts[].bucketStart': () => { renderCohorts(); shows('Oct 2026'); },
  'trends.cohorts[].size': () => { renderCohorts(); shows('77'); },
  'trends.cohorts[].overallRate': () => { renderCohorts(); shows('33%'); },
  'trends.cohorts[].overallSoFarRate': () => { renderCohorts(); shows('5% so far'); },
  'trends.cohorts[].cells[].rate': () => { renderCohorts(); shows('42%'); },
  'trends.cohorts[].cells[].soFarRate': () => { renderCohorts(); shows('12% so far'); },
  'trends.cohorts[].cells[].entered': () => { renderCohorts(); shows('n=50'); },
  'trends.movement.rows[].label': () => { renderMovement(); shows('Contacted'); },
  'trends.movement.rows[].enteredInPeriod': () => { renderMovement(); shows('31'); },
  'trends.movement.rows[].leftInPeriod': () => { renderMovement(); shows('17'); },
  'trends.movement.rows[].countNow': () => { renderMovement(); shows('205'); },

  'meta.sync.lastSuccessfulSyncAt': () => { render(<AnalyticsSyncLine sync={META.sync} />); shows(/^Last successful sync .*12 min/); },
  'meta.sync.lastAttemptStatus': () => { render(<AnalyticsSyncLine sync={{ ...META.sync, lastAttemptStatus: 'FAILED' }} />); shows(/The last attempt failed\.$/); },
  'meta.sync.isStale': async () => {
    renderContent({ sync: { ...META.sync, isStale: true } });
    expect(await screen.findByText('No successful sync in the last hour. Numbers may be out of date.')).toBeInTheDocument();
    expect(await screen.findByText('1,284')).toBeInTheDocument();
  },
  'meta.state': async () => {
    renderContent({ state: 'NEVER_SYNCED' });
    expect(await screen.findByText('The first sync has not finished.')).toBeInTheDocument();
    expect(screen.queryByText('1,284')).not.toBeInTheDocument();
  },
  'meta.isProvisional': async () => {
    renderContent({ isProvisional: true });
    expect(await screen.findByText('Definitions are provisional until recruiting confirms them.')).toBeInTheDocument();
  },
  'meta.fields.isStageAuditLogged': async () => {
    renderContent({ fields: { ...META.fields, isStageAuditLogged: false } });
    expect(await screen.findByText('Stage changes are not being recorded on the timeline.')).toBeInTheDocument();
  },
  'meta.stages[].label': () => { renderCohorts(); shows('Contacted to next'); },
  'meta.tracks[].label': async () => {
    const user = userEvent.setup();

    render(<FilterBarHarness />);
    await user.click(screen.getByText('All tracks'));
    expect(await screen.findByText('Robotics track')).toBeInTheDocument();
  },
  'meta.programs[].label': async () => {
    const user = userEvent.setup();

    render(<FilterBarHarness />);
    await user.click(screen.getByText('All programs'));
    expect(await screen.findByText('Sensor program')).toBeInTheDocument();
  },
  'meta.sources[].label': async () => {
    const user = userEvent.setup();

    render(<FilterBarHarness />);
    await user.click(screen.getByText('All sources'));
    expect(await screen.findByText('LinkedIn source')).toBeInTheDocument();
  },
  'meta.fields.positionsAppliedFor': () => {
    render(<FilterBarHarness meta={{ ...META, fields: { ...META.fields, positionsAppliedFor: 'MISSING' } }} />);
    expect(screen.getByRole('group', { name: /^Track:/ })).toHaveAttribute('aria-disabled', 'true');
  },
  'meta.fields.applicantSource': () => {
    render(<FilterBarHarness meta={{ ...META, fields: { ...META.fields, applicantSource: 'WRONG_TYPE' } }} />);
    expect(screen.getByRole('group', { name: /^Source:/ })).toHaveAttribute('aria-disabled', 'true');
  },

  'reports[].periodType': showsInReport('Weekly'),
  'reports[].periodStart': showsInReport('Oct 26 to Nov 1, 2026'),
  'report.generatedAt': showsInReport(/^Generated Nov 2, 2026/),
  'report.newApplications': showsInReport(/^86 new applications/),
  'report.newApplicationsPrevious': showsInReport(/\+12 against the previous period/),
  'report.comparisons[].label': showsInReport('Entered New'),
  'report.comparisons[].current': showsInReport('88'),
  'report.comparisons[].previous': showsInReport('40'),
  'report.comparisons[].isSignificant': async () => {
    await renderReports();
    expect(screen.getAllByText('Significant change')).toHaveLength(1);
    expect(within(textRowOf('Entered New')).queryByText('Significant change')).not.toBeInTheDocument();
  },
  'report.stuckByStage[]': showsInReport('214'),
  'report.movement[]': showsInReport('205'),
  'report.funnel': showsInReport('Lowest step'),
  'report.categories': showsInReport('Business'),
  'report.cohorts[]': showsInReport('Oct 2026'),
};

const CHART_CHECKS: Record<string, () => void> = {
  'trends.series[].value': () => {
    const [series] = buildTrendChartSeries({ points: POINTS, metric: 'NEW_APPLICATIONS', formatBucketLabel: (bucket) => bucket }).slice(-1);

    expect(series.data.map(({ y }) => y)).toEqual([86, 40]);

    const [rateSeries] = buildTrendChartSeries({ points: RATE_POINTS, metric: 'DROP_OFF', formatBucketLabel: (bucket) => bucket }).slice(-1);

    // The one place a fraction becomes a percent on its way to the chart.
    expect(rateSeries.data.map(({ y }) => y)).toEqual([25]);

    const [nullSeries] = buildTrendChartSeries({
      points: [{ ...RATE_POINTS[0], value: null }],
      metric: 'DROP_OFF',
      formatBucketLabel: (bucket) => bucket,
    }).slice(-1);

    expect(nullSeries.data.map(({ y }) => y)).toEqual([null]);
  },
  'trends.series[].previousValue': () => {
    const [previous] = buildTrendChartSeries({ points: RATE_POINTS, metric: 'DROP_OFF', formatBucketLabel: (bucket) => bucket });

    expect([previous.key, previous.color]).toEqual(['previous', 'gray']);
    expect(previous.data.map(({ y }) => y)).toEqual([12.5]);
  },
};

const FILTER_CHECKS: Record<string, () => Promise<void>> = {
  'api.filter.status': async () => {
    expect((await chooseInFilterBar('All statuses', 'Unmapped')).status).toBe('UNMAPPED');
  },
  'api.filter.trackKey': async () => {
    expect((await chooseInFilterBar('All tracks', 'Robotics track')).trackKey).toBe('ROBOTICS');
  },
  'api.filter.programKey': async () => {
    expect((await chooseInFilterBar('All programs', 'Sensor program')).programKey).toBe('SENSOR');
  },
  'api.filter.sourceKey': async () => {
    expect((await chooseInFilterBar('All sources', 'LinkedIn source')).sourceKey).toBe('LINKEDIN');
  },
  'api.filter.dateRange': async () => {
    const filter = await chooseInFilterBar('All dates', 'Last 7 days');

    expect(filter.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filter.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  },
  'api.filter.period': async () => {
    expect((await chooseInFilterBar('By week', 'By month', true)).period).toBe('MONTH');
  },
};

const findCheck = ({ from, to }: GraphEdge) => {
  if (from === 'ui.AnalyticsFilterBar') {
    return FILTER_CHECKS[to];
  }

  const payloadNode = from.replace(/^payload\./, '');

  return to === 'ui.buildTrendChartSeries' ? CHART_CHECKS[payloadNode] : CHECKS[payloadNode];
};

const REAL_PAYLOADS_FILE = process.env.DATAFLOW_REAL_PAYLOADS;

// The numbers are the hand calculation of seedDistinct in lib/seed.cjs.
const real: {
  meta: AnalyticsMeta;
  overview: AnalyticsOverview;
  funnel: AnalyticsFunnel;
  categories: AnalyticsCategories;
  categoriesWithUnknownSource: AnalyticsCategories;
  dropOff: AnalyticsTrends;
  volumeAroundStart: AnalyticsTrends;
  reports: AnalyticsReportListItem[];
  report: AnalyticsReport;
} = REAL_PAYLOADS_FILE ? JSON.parse(readFileSync(REAL_PAYLOADS_FILE, 'utf8')) : null;

(real === null ? describe.skip : describe)('From a CRM row to the screen, on real payloads', () => {
  it('PATH-01 figures: 17 contacts, 12 active, 5 new against 2, 8 stuck, 1 inactive, 9 imported', () => {
    render(<AnalyticsFiguresRow figures={real.overview.figures} hasLimits={real.overview.stuck.hasLimits} showSignedFigure={real.meta.showSignedFigure} />);

    shows('17');
    shows('12');
    shows('5');
    shows('+3 against the previous period');
    shows('8');
    shows('1 inactive');
    shows('9 imported, dates unknown');
    expect(screen.queryByText('Signed')).not.toBeInTheDocument();
  });

  it('PATH-02 stage totals: counts and past limit on the right rows, both signed values nested', () => {
    render(<AnalyticsStageTotalsTable rows={real.overview.stageTotals} />);

    expect(within(textRowOf('Not interested')).getByText('3')).toBeInTheDocument();
    expect(within(textRowOf('New')).getByText('5')).toBeInTheDocument();
    expect(within(textRowOf('Signed')).getByText('2')).toBeInTheDocument();
    shows('SIGNED_PAID');
    shows('SIGNED_NON_PAID');
  });

  it('PATH-03 stuck list: the live name, days in stage and days over limit', () => {
    render(<AnalyticsStuckTable stuck={real.overview.stuck} />);

    const row = textRowOf('old2 Sample');

    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText('100')).toBeInTheDocument();
    expect(within(row).getByText('86')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(real.overview.stuck.total + 1);
  });

  it('PATH-04 ledger: 16 reached, 54% with n=13, 4 timed out, 2 exited, 3 too recent, median 5 with n=12', () => {
    render(<AnalyticsStageLedger funnel={real.funnel} />);

    const row = rowOf('New');

    expect(within(row).getByText('16')).toBeInTheDocument();
    expect(within(row).getByText('54%')).toBeInTheDocument();
    expect(within(row).getByText('n=13')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText(/^5(\.0)?$/)).toBeInTheDocument();
    expect(within(row).getByText('n=12')).toBeInTheDocument();
    shows('1 of 3 reached Signed within 90 days');
    shows(/^Cohort size: 16, counted from/);
    expect(screen.queryByText('Lowest step')).not.toBeInTheDocument();
  });

  it('PATH-05 categories: people, active, new, cohort and rates on the track row', () => {
    render(<AnalyticsCategoryTable categories={real.categories} stages={real.meta.stages} />);

    const row = textRowOf('Business Management, Growth & Entrepreneurship');

    expect(within(row).getByText('17')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('16')).toBeInTheDocument();
    expect(within(row).getByText('33%')).toBeInTheDocument();
    expect(within(row).getByText('54%')).toBeInTheDocument();
  });

  it('PATH-06 trends: drop-off shows as a percent, an immature week stays unknown, never 0%', () => {
    render(
      <AnalyticsTrendTable
        points={real.dropOff.series}
        metric="DROP_OFF"
        period="WEEK"
        minimumSample={real.dropOff.minimumSample}
      />,
    );

    // r1 to r7, x1, x2 and late applied together: 3 of 10 did not move on in time.
    shows('30%');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('PATH-07 cohorts: the mature cell of the 40 day old week, 7 of 10', () => {
    render(
      <AnalyticsCohortTable
        rows={real.dropOff.cohorts}
        stages={real.meta.stages}
        period="WEEK"
        minimumSample={real.dropOff.minimumSample}
      />,
    );

    shows('70%');
    expect(screen.getAllByText('n=10').length).toBeGreaterThan(0);
  });

  it('PATH-08 movement: what is in each stage now', () => {
    render(<AnalyticsMovementTable rows={real.dropOff.movement.rows} />);

    expect(within(textRowOf('Contacted')).getAllByText('6').length).toBeGreaterThan(0);
    expect(within(textRowOf('New')).getByText('5')).toBeInTheDocument();
  });

  it('PATH-09 sync line and filter options come from the real meta', async () => {
    const user = userEvent.setup();

    render(<AnalyticsSyncLine sync={real.meta.sync} />);
    shows(/^Last successful sync /);

    render(<FilterBarHarness meta={real.meta} />);
    await user.click(screen.getByText('All tracks'));
    expect(await screen.findByText('Robotics & Intelligent Systems')).toBeInTheDocument();
  });

  it('PATH-10 a stored report opens from the list and shows its tables', async () => {
    const { periodType, periodStart } = real.report;

    renderWithClient(<AnalyticsReportsTab meta={real.meta} />, [
      payloadMock(GET_CRM_ANALYTICS_REPORTS, 'getCrmAnalyticsReports', {}, real.reports),
      payloadMock(GET_CRM_ANALYTICS_REPORT, 'getCrmAnalyticsReport', { periodType, periodStart }, real.report),
    ]);

    expect(await screen.findByText(periodType === 'MONTH' ? /^Monthly report, / : /^Weekly report, /)).toBeInTheDocument();
    shows(/^Generated /);
    shows(/^Cohort size: \d+, counted from/);
  });

  it('PATH-11 new applications: a week before tracking start shows no number and no comparison, a tracked week its real 0', () => {
    const { minimumSample, series } = real.volumeAroundStart;
    const tracked = series.filter(({ value }) => value !== null);

    expect(tracked).toHaveLength(tracked.filter(({ value }) => value === 0).length);
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked.length).toBeLessThan(series.length);

    render(<AnalyticsTrendTable points={series} metric="NEW_APPLICATIONS" period="WEEK" minimumSample={minimumSample} />);

    expect(screen.getAllByText('Not enough data')).toHaveLength(series.length - tracked.length);
    expect(screen.getAllByText('0')).toHaveLength(tracked.length);
    expect(screen.queryByText('Change')).not.toBeInTheDocument();

    const chartSeries = buildTrendChartSeries({ points: series, metric: 'NEW_APPLICATIONS', period: 'WEEK', formatBucketLabel: (bucket) => bucket });

    expect(chartSeries.map(({ key }) => key)).toEqual(['current']);
    expect(chartSeries[0].data.map(({ y }) => y)).toEqual(series.map(({ value }) => value));
  });

  it('PATH-12 sources: a value the field no longer lists shows as Unmapped with its raw value', () => {
    render(<AnalyticsCategoryTable categories={real.categoriesWithUnknownSource} stages={real.meta.stages} />);

    shows('Unmapped: LINKEDIN');
  });
});

describe('Payload fields to components', () => {
  for (const edge of graph.edges.filter(({ from, to }) => to.startsWith('ui.') || from.startsWith('ui.'))) {
    it(`${edge.id} ${edge.from} -> ${edge.to} [${edge.field}]`, async () => {
      const check = findCheck(edge);

      if (check === undefined) {
        throw new Error(`No check for ${edge.from} -> ${edge.to}. A new UI edge needs one here.`);
      }

      await check();
    });
  }
});
