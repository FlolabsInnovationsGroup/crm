// Answers the analytics queries with contract section 7 shaped data and known numbers, so
// the page's rendering rules can be checked exactly. Everything else stays the real CRM.
// The real-server journey lives in analytics-real-server.pw.ts.
import { type Page, type Request } from '@playwright/test';

const MINUTE_MS = 60_000;

type Person = { personId: string; displayName: string };

export type AnalyticsField =
  | 'getCrmAnalyticsMeta'
  | 'getCrmAnalyticsOverview'
  | 'getCrmAnalyticsFunnel'
  | 'getCrmAnalyticsCategories'
  | 'getCrmAnalyticsTrends'
  | 'getCrmAnalyticsReports'
  | 'getCrmAnalyticsReport';

const ANALYTICS_FIELDS: AnalyticsField[] = [
  'getCrmAnalyticsMeta',
  'getCrmAnalyticsOverview',
  'getCrmAnalyticsFunnel',
  'getCrmAnalyticsCategories',
  'getCrmAnalyticsTrends',
  'getCrmAnalyticsReports',
  'getCrmAnalyticsReport',
];

type AnalyticsFilter = {
  dateFrom?: string | null;
  dateTo?: string | null;
  trackKey?: string | null;
  programKey?: string | null;
  sourceKey?: string | null;
  status?: string;
  period?: string;
};

export type AnalyticsVariables = {
  filter?: AnalyticsFilter;
  groupBy?: string;
  metric?: string;
  stageKey?: string | null;
  periodType?: string;
  periodStart?: string;
};

type Overrides = Record<string, unknown> & {
  sync?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  figures?: Record<string, unknown>;
};

type GraphqlErrorAnswer = { graphqlError: string };

type Answer = (variables: AnalyticsVariables) => unknown;

export type AnalyticsCall = {
  field: AnalyticsField;
  variables: AnalyticsVariables;
  pathname: string;
};

export const FORBIDDEN_ANSWER: GraphqlErrorAnswer = { graphqlError: 'FORBIDDEN' };
export const SERVER_ERROR_ANSWER: GraphqlErrorAnswer = {
  graphqlError: 'INTERNAL_SERVER_ERROR',
};

export const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * MINUTE_MS).toISOString();

const base = (minimumSample = 3) => ({
  asOf: new Date().toISOString(),
  trackingStartedAt: '2026-08-01T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample,
});

const STAGES = [
  { stageKey: 'NEW', label: 'New', kind: 'MAIN', rank: 0, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'CONTACTED', label: 'Contacted', kind: 'MAIN', rank: 1, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'BEFORE_MEETING', label: 'Before meeting', kind: 'MAIN', rank: 2, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'SATURDAY_MEETING', label: 'Saturday meeting', kind: 'MAIN', rank: 3, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'ATTENDED', label: 'Attended', kind: 'MAIN', rank: 4, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'SECOND_MEETING', label: 'Second meeting', kind: 'MAIN', rank: 5, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'AGREEMENT_SENT', label: 'Agreement sent', kind: 'MAIN', rank: 6, limitDays: 14, windowDays: 14, isSuccess: false },
  { stageKey: 'SIGNED', label: 'Signed', kind: 'MAIN', rank: 7, limitDays: null, windowDays: null, isSuccess: true },
  { stageKey: 'NO_ANSWER', label: 'No answer', kind: 'EXIT', rank: null, limitDays: null, windowDays: null, isSuccess: false },
  { stageKey: 'NOT_INTERESTED', label: 'Not interested', kind: 'EXIT', rank: null, limitDays: null, windowDays: null, isSuccess: false },
  { stageKey: 'REJECTED_BY_US', label: 'Rejected by us', kind: 'EXIT', rank: null, limitDays: null, windowDays: null, isSuccess: false },
  { stageKey: 'INTERESTED', label: 'Interested', kind: 'OTHER', rank: null, limitDays: null, windowDays: null, isSuccess: false },
];

export const buildMeta = (overrides: Overrides = {}) => ({
  ...base(),
  state: 'READY',
  isProvisional: false,
  showSignedFigure: false,
  stages: STAGES,
  tracks: [
    { key: 'BUSINESS', label: 'Business' },
    { key: 'ROBOTICS', label: 'Robotics' },
  ],
  programs: [
    { key: 'FINANCE_INTERN', label: 'Finance intern', trackKey: 'BUSINESS' },
    { key: 'MARKETING_INTERN', label: 'Marketing intern', trackKey: 'BUSINESS' },
    { key: 'SENSOR_INTEGRATION_INTERN', label: 'Sensor intern', trackKey: 'ROBOTICS' },
  ],
  sources: [
    { key: 'LINKEDIN', label: 'Linked network' },
    { key: 'REFERRAL', label: 'Referral network' },
  ],
  ...overrides,
  sync: {
    lastSuccessfulSyncAt: minutesAgo(12),
    lastReconciliationAt: minutesAgo(600),
    lastAttemptAt: minutesAgo(12),
    lastAttemptStatus: 'OK',
    isStale: false,
    restoredInLastReconciliation: 0,
    ...overrides.sync,
  },
  fields: {
    stage: 'OK',
    isStageAuditLogged: true,
    positionsAppliedFor: 'OK',
    applicantSource: 'OK',
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
    ...overrides.fields,
  },
});

const stuckRow = (
  { personId, displayName }: Person,
  daysInStage: number,
  isLowerBound = false,
) => ({
  personId,
  displayName,
  stageKey: 'CONTACTED',
  stageLabel: 'Contacted',
  stageEnteredAt: new Date(Date.now() - daysInStage * 1440 * MINUTE_MS).toISOString(),
  daysInStage,
  daysOverLimit: daysInStage - 14,
  isLowerBound,
});

const fillerPerson = (index: number): Person => ({
  personId: `20202020-eeee-4000-8000-${String(index).padStart(12, '0')}`,
  displayName: `Filler person ${index}`,
});

// Numbers are all different and under 1000, so a text match can only be the intended one.
export const buildOverview = (
  [firstPerson, secondPerson]: Person[],
  overrides: Overrides = {},
) => ({
  ...base(),
  importedExcludedByDate: 0,
  stageTotals: [
    { rowKey: 'NEW', label: 'New', rowKind: 'MAIN', parentStageKey: null, count: 164, pastLimitCount: 9 },
    { rowKey: 'CONTACTED', label: 'Contacted', rowKind: 'MAIN', parentStageKey: null, count: 152, pastLimitCount: 114 },
    { rowKey: 'SIGNED', label: 'Signed', rowKind: 'MAIN', parentStageKey: null, count: 11, pastLimitCount: null },
    { rowKey: 'SIGNED:SIGNED_PAID', label: 'Signed paid', rowKind: 'NESTED', parentStageKey: 'SIGNED', count: 8, pastLimitCount: null },
    { rowKey: 'SIGNED:SIGNED_NON_PAID', label: 'Signed non paid', rowKind: 'NESTED', parentStageKey: 'SIGNED', count: 3, pastLimitCount: null },
    { rowKey: 'NOT_INTERESTED', label: 'Not interested', rowKind: 'EXIT', parentStageKey: null, count: 19, pastLimitCount: null },
    { rowKey: 'INTERESTED', label: 'Interested', rowKind: 'OTHER', parentStageKey: null, count: 21, pastLimitCount: null },
    { rowKey: 'UNMAPPED:LEGACY_TEST', label: 'LEGACY_TEST', rowKind: 'UNMAPPED', parentStageKey: null, count: 5, pastLimitCount: null },
    { rowKey: 'NO_STAGE', label: 'No stage', rowKind: 'NO_STAGE', parentStageKey: null, count: 432, pastLimitCount: null },
  ],
  stuck: {
    rows: [
      stuckRow(firstPerson, 131),
      stuckRow(secondPerson, 129, true),
      ...Array.from({ length: 98 }, (_, index) =>
        stuckRow(fillerPerson(index), 100 - index),
      ),
    ],
    total: 123,
    hasLimits: true,
  },
  ...overrides,
  figures: {
    totalContacts: 804,
    activePeople: 337,
    newApplications: 58,
    newApplicationsPrevious: 46,
    newApplicationsFrom: '2026-11-01',
    newApplicationsTo: '2026-11-07',
    importedApplications: 900,
    stuckPeople: 123,
    inactivePeople: 41,
    signedPeople: null,
    ...overrides.figures,
  },
});

const funnelRow = (stageKey: string, label: string, numbers: Overrides) => ({
  stageKey,
  label,
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
  ...numbers,
});

// The two first rows are the hand-calculated sample of contract section 9.
export const buildFunnel = (overrides: Overrides = {}) => ({
  ...base(),
  cohortSize: 7,
  cohortExcludedUnmapped: 2,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 40,
    reached: 6,
    rate: 0.15,
    soFarRate: 0.2,
    isUnderMinimum: false,
  },
  rows: [
    funnelRow('NEW', 'New', {
      entered: 7, eligible: 5, reachedNext: 2, timedOut: 2, exited: 1, inWindow: 2,
      stepRate: 0.4, soFarRate: 4 / 7, dropOffRate: 0.6, isUnderMinimum: false,
      medianDays: 5, completedStays: 5,
    }),
    funnelRow('CONTACTED', 'Contacted', {
      entered: 4, eligible: 3, reachedNext: 1, timedOut: 2, exited: 0, inWindow: 1,
      stepRate: 1 / 3, soFarRate: 1 / 4, dropOffRate: 2 / 3, isUnderMinimum: false,
    }),
    funnelRow('BEFORE_MEETING', 'Before meeting', {
      entered: 2, inWindow: 2, soFarRate: 0.12,
    }),
    funnelRow('SATURDAY_MEETING', 'Saturday meeting', {
      entered: 1, eligible: 1, reachedNext: 1, stepRate: 1, soFarRate: 1,
      dropOffRate: 0,
    }),
    funnelRow('ATTENDED', 'Attended', {}),
    funnelRow('SECOND_MEETING', 'Second meeting', {}),
    funnelRow('AGREEMENT_SENT', 'Agreement sent', {}),
    funnelRow('SIGNED', 'Signed', { windowDays: null }),
  ],
  lowestStepStageKey: 'CONTACTED',
  ...overrides,
});

export const buildEmptyFunnel = () =>
  buildFunnel({
    cohortSize: 0,
    cohortExcludedUnmapped: 0,
    lowestStepStageKey: null,
    overall: {
      finalStageKey: 'SIGNED',
      windowDays: 90,
      eligible: 0,
      reached: 0,
      rate: null,
      soFarRate: null,
      isUnderMinimum: true,
    },
    rows: STAGES.filter((stage) => stage.rank !== null).map((stage) =>
      funnelRow(stage.stageKey, stage.label, {
        windowDays: stage.windowDays,
      }),
    ),
  });

const categoryRow = (
  key: string,
  label: string,
  parentKey: string | null,
  people: number,
  rates: Overrides = {},
) => ({
  key,
  parentKey,
  label,
  isUnmapped: false,
  people,
  activePeople: Math.floor(people / 2),
  newApplications: Math.floor(people / 5),
  cohortSize: Math.floor(people / 2),
  overallEligible: 0,
  overallRate: null,
  overallSoFarRate: null,
  stepRates: [
    { stageKey: 'NEW', eligible: 0, rate: null, soFarRate: null },
    { stageKey: 'CONTACTED', eligible: 0, rate: null, soFarRate: null },
  ],
  ...rates,
});

const TRACK_PROGRAM_CATEGORIES = () => ({
  ...base(),
  groupBy: 'TRACK_PROGRAM',
  distinctPeople: 100,
  peopleInSeveral: 9,
  peopleInSeveralTracks: 4,
  stepStageKeys: ['NEW', 'CONTACTED'],
  rows: [
    categoryRow('BUSINESS', 'Business', null, 60, {
      overallEligible: 20,
      overallRate: 0.25,
      overallSoFarRate: 0.3,
      stepRates: [
        { stageKey: 'NEW', eligible: 20, rate: 0.55, soFarRate: 0.6 },
        { stageKey: 'CONTACTED', eligible: 0, rate: null, soFarRate: 0.12 },
      ],
    }),
    categoryRow('FINANCE_INTERN', 'Finance intern', 'BUSINESS', 35),
    categoryRow('MARKETING_INTERN', 'Marketing intern', 'BUSINESS', 28),
    categoryRow('ROBOTICS', 'Robotics', null, 25),
    categoryRow('SENSOR_INTEGRATION_INTERN', 'Sensor intern', 'ROBOTICS', 25),
    categoryRow('UNMAPPED', 'Unmapped', null, 6, { isUnmapped: true }),
    categoryRow('LEGACY_POSITION', 'LEGACY_POSITION', 'UNMAPPED', 6, { isUnmapped: true }),
    categoryRow('NONE', 'No position', null, 13),
  ],
});

const SOURCE_CATEGORIES = () => ({
  ...base(),
  groupBy: 'SOURCE',
  distinctPeople: 100,
  peopleInSeveral: 0,
  peopleInSeveralTracks: 0,
  stepStageKeys: ['NEW', 'CONTACTED'],
  rows: [
    categoryRow('LINKEDIN', 'Linked network', null, 70),
    categoryRow('REFERRAL', 'Referral network', null, 26),
    // An unknown source keeps its raw value as its key (contract, decisions from testing).
    categoryRow('LEGACY_SOURCE', 'LEGACY_SOURCE', null, 4, { isUnmapped: true }),
  ],
});

export const buildCategories = ({ groupBy }: AnalyticsVariables) =>
  groupBy === 'SOURCE' ? SOURCE_CATEGORIES() : TRACK_PROGRAM_CATEGORIES();

const trendPoint = (
  bucketStart: string,
  value: number | null,
  previousValue: number | null,
  isPartial = false,
) => ({ bucketStart, value, previousValue, size: value === null ? null : 40, isPartial });

const movement = {
  from: '2026-11-01',
  to: '2026-11-07',
  rows: [
    { stageKey: 'NEW', label: 'New', enteredInPeriod: 17, leftInPeriod: 13, countNow: 164 },
    { stageKey: 'CONTACTED', label: 'Contacted', enteredInPeriod: 13, leftInPeriod: 6, countNow: 152 },
  ],
};

const cohortRows = [
  {
    bucketStart: '2026-09-01',
    size: 80,
    overallRate: null,
    overallSoFarRate: 0.05,
    cells: [
      { stageKey: 'NEW', entered: 80, eligible: 80, rate: 0.45, soFarRate: 0.5, isMature: true },
      { stageKey: 'CONTACTED', entered: 36, eligible: 20, rate: null, soFarRate: 0.12, isMature: false },
    ],
  },
];

export const buildTrends = ({ metric, stageKey, filter }: AnalyticsVariables) => {
  const period = filter?.period ?? 'WEEK';
  const isRate = metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF';

  const series = isRate
    ? [
        trendPoint('2026-09-07', 0.25, null),
        trendPoint('2026-09-14', 0.3, null),
        trendPoint('2026-09-21', null, null),
      ]
    : [
        trendPoint('2026-10-12', 40, 35),
        trendPoint('2026-10-19', 44, 36),
        trendPoint('2026-10-26', null, 38),
        trendPoint('2026-11-02', 52, 39, true),
      ];

  if (isRate && period === 'DAY') {
    return {
      ...base(),
      metric,
      stageKey: stageKey ?? null,
      period,
      unavailableReason: 'DAILY_RATE',
      series: [],
      cohorts: [],
      movement,
    };
  }

  return {
    ...base(),
    metric,
    stageKey: stageKey ?? null,
    period,
    unavailableReason: null,
    series,
    cohorts: cohortRows,
    movement,
  };
};

const REPORT_LIST = [
  { periodType: 'WEEK', periodStart: '2026-10-19', periodEnd: '2026-10-26', generatedAt: minutesAgo(9000) },
  { periodType: 'WEEK', periodStart: '2026-10-26', periodEnd: '2026-11-02', generatedAt: minutesAgo(600) },
  { periodType: 'MONTH', periodStart: '2026-10-01', periodEnd: '2026-11-01', generatedAt: minutesAgo(800) },
];

export const buildReportList = () => REPORT_LIST;

export const buildReport = ({ periodType, periodStart }: AnalyticsVariables) => {
  const listItem = REPORT_LIST.find(
    (item) => item.periodType === periodType && item.periodStart === periodStart,
  );

  if (listItem === undefined) {
    return null;
  }

  return {
    ...listItem,
    ...base(),
    newApplications: 58,
    newApplicationsPrevious: 46,
    categories: SOURCE_CATEGORIES(),
    funnel: buildFunnel(),
    movement: movement.rows,
    stuckByStage: [{ stageKey: 'CONTACTED', label: 'Contacted', count: 114 }],
    comparisons: [
      { metricKey: 'NEW_APPLICATIONS', label: 'New applications', current: 58, previous: 46, isSignificant: true },
      { metricKey: 'ENTERED_CONTACTED', label: 'Entered Contacted', current: 13, previous: 12, isSignificant: false },
    ],
    cohorts: periodType === 'MONTH' ? cohortRows : [],
  };
};

export const defaultAnswers = (
  people: Person[],
): Record<AnalyticsField, Answer> => ({
  getCrmAnalyticsMeta: () => buildMeta(),
  getCrmAnalyticsOverview: () => buildOverview(people),
  getCrmAnalyticsFunnel: () => buildFunnel(),
  getCrmAnalyticsCategories: (variables) => buildCategories(variables),
  getCrmAnalyticsTrends: (variables) => buildTrends(variables),
  getCrmAnalyticsReports: () => buildReportList(),
  getCrmAnalyticsReport: (variables) => buildReport(variables),
});

const isGraphqlError = (answer: unknown): answer is GraphqlErrorAnswer =>
  typeof answer === 'object' && answer !== null && 'graphqlError' in answer;

const readBody = (request: Request): { query?: string; variables?: AnalyticsVariables } | null => {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
};

// Only /graphql is answered: a query sent to the wrong endpoint reaches the real server,
// fails there, and the page shows it.
export const answerAnalyticsQueries = async (
  page: Page,
  answers: Partial<Record<AnalyticsField, Answer>> & { people: Person[] },
): Promise<AnalyticsCall[]> => {
  const { people, ...overrides } = answers;
  const handlers = { ...defaultAnswers(people), ...overrides };
  const calls: AnalyticsCall[] = [];

  await page.route('**/graphql', async (route) => {
    const request = route.request();
    const body = readBody(request);
    const field = ANALYTICS_FIELDS.find((candidate) =>
      new RegExp(`\\b${candidate}\\b`).test(body?.query ?? ''),
    );

    if (field === undefined) {
      await route.fallback();

      return;
    }

    const variables = body?.variables ?? {};

    calls.push({ field, variables, pathname: new URL(request.url()).pathname });

    const answer = handlers[field](variables);

    if (isGraphqlError(answer)) {
      await route.fulfill({
        json: {
          data: null,
          errors: [
            {
              message:
                answer.graphqlError === 'FORBIDDEN'
                  ? 'User does not have permission.'
                  : 'Something broke on the server.',
              extensions: { code: answer.graphqlError },
            },
          ],
        },
      });

      return;
    }

    await route.fulfill({
      json: {
        data: { [field]: { __typename: 'CrmAnalyticsPayload', payload: answer } },
      },
    });
  });

  return calls;
};
