import { Logger } from '@nestjs/common';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { type CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsMetricsService } from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';
import { type CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type AnalyticsFilter,
  type AnalyticsFunnelRow,
  type AnalyticsReport,
  type AnalyticsSeriesRequest,
  type AnalyticsTrendMetric,
} from 'src/modules/analytics/types/analytics-api.type';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import {
  addCrmAnalyticsLocalDays,
  addCrmAnalyticsPeriods,
} from 'src/modules/analytics/utils/compute-crm-analytics-report-periods.util';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const TRACKING_START = '2026-08-01T00:00:00.000Z';
const NOW = '2026-11-07T12:00:00.000Z';
const LOCAL_TODAY = '2026-11-07';

const DEFAULT_FILTER: AnalyticsFilter = {
  dateFrom: null,
  dateTo: null,
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
  period: 'WEEK',
};

const buildState = (
  overrides: Partial<CrmAnalyticsCrmState> = {},
): CrmAnalyticsCrmState => ({
  workspaceId: WORKSPACE_ID,
  stage: {
    status: 'OK',
    isAuditLogged: true,
    options: [{ value: 'SIGNED_PAID', label: 'Signed paid' }],
  },
  positionsAppliedFor: {
    status: 'OK',
    options: [{ value: 'FINANCE_INTERN', label: 'Finance intern' }],
  },
  applicantSource: {
    status: 'OK',
    options: [{ value: 'LINKEDIN', label: 'LinkedIn' }],
  },
  hasFormSubmissionObject: true,
  hasApplicationObject: true,
  ...overrides,
});

type SqlAnswer = [RegExp, Record<string, unknown>[]];
type RecordedStatement = { sql: string; parameters: unknown[] };

const setup = ({
  answers = [],
  isDisabled = false,
  hasStorage = true,
  state = buildState(),
  trackingStart = TRACKING_START,
  now = NOW,
  failingStatement,
  failureMessage = 'canceling statement due to statement timeout',
}: {
  answers?: SqlAnswer[];
  isDisabled?: boolean;
  hasStorage?: boolean;
  state?: CrmAnalyticsCrmState;
  trackingStart?: string;
  now?: string;
  failingStatement?: RegExp;
  failureMessage?: string;
} = {}) => {
  const statements: RecordedStatement[] = [];

  const run: CrmAnalyticsSqlRunner = async (sql, parameters) => {
    statements.push({ sql, parameters: [...parameters] });

    if (failingStatement?.test(sql) === true) {
      throw new Error(failureMessage);
    }

    if (sql.includes('to_regclass')) {
      return [
        {
          as_of: new Date(now),
          local_today: now.slice(0, 10),
          has_storage: hasStorage,
        },
      ];
    }

    return answers.find(([pattern]) => pattern.test(sql))?.[1] ?? [];
  };

  // The real facade, so its SQL is what the statement checks below read.
  const facadeService = new CrmAnalyticsFacadeService(
    {} as never,
    {} as never,
  );

  jest.spyOn(facadeService, 'getCrmState').mockResolvedValue(state);
  jest.spyOn(facadeService, 'countImportedApplications').mockResolvedValue(12);
  jest
    .spyOn(facadeService, 'getPersonDisplayNames')
    .mockResolvedValue(new Map([['person-1', 'Ada Lovelace']]));

  const runPageTransaction = jest.fn(
    async (_workspaceId: string, work: (run: CrmAnalyticsSqlRunner) => unknown) =>
      work(run),
  );
  const databaseService = {
    runPageTransaction,
  } as unknown as CrmAnalyticsDatabaseService;
  const settingsService = {
    isDisabled: jest.fn(async () => isDisabled),
    getTrackingStart: jest.fn(async () => trackingStart),
  } as unknown as CrmAnalyticsSettingsService;

  const metricsService = new CrmAnalyticsMetricsService(
    databaseService,
    facadeService,
    settingsService,
  );

  return {
    metricsService,
    reportService: new CrmAnalyticsReportService(
      databaseService,
      metricsService,
      settingsService,
    ),
    facadeService,
    runPageTransaction,
    run,
    statements,
  };
};

const STEP = /overall_total a/;
const FUNNEL_PLAIN = /''::text AS group_key[\s\S]*overall_total a/;
const DURATIONS = /GROUP BY cs\.stage_key/;
const EXCLUDED = /excluded_count/;
const STAGE_COUNTS = /GROUP BY s\.raw_stage/;
const CLOCK_TOTALS = /inactive_count/;
const STUCK_ROWS = /total_count/;
const NEW_APPLICATION_TOTALS = /current_count/;
const IMPORTED_PEOPLE = /imported_count/;
const CATEGORY_PEOPLE = /active_people/;
const CATEGORY_OVERLAP = /distinct_people/;
const CATEGORY_NEW_APPLICATIONS = /AS new_applications/;
const MOVEMENT = /entered_in_period/;
const SNAPSHOT_BUCKETS = /matching_row/;
const SUBMISSION_BUCKETS = /FROM submission sub[\s\S]*GROUP BY 1/;
const MEDIAN_BUCKETS = /FROM completed_stay cs\s+WHERE/;

// entered, eligible, reached_next, exited and reached_so_far per step, as person_step
// gives them for the hand-calculated sample in section 9 of the contract.
const HAND_SAMPLE_FUNNEL_ROW = {
  group_key: '',
  entered: 7,
  eligible: 0,
  reached: 0,
  reached_so_far: 0,
  steps: [
    {
      stage_key: 'NEW',
      entered: 7,
      eligible: 5,
      reached_next: 2,
      exited: 1,
      reached_so_far: 4,
    },
    {
      stage_key: 'CONTACTED',
      entered: 4,
      eligible: 3,
      reached_next: 1,
      exited: 0,
      reached_so_far: 1,
    },
    {
      stage_key: 'BEFORE_MEETING',
      entered: 1,
      eligible: 1,
      reached_next: 1,
      exited: 0,
      reached_so_far: 1,
    },
    {
      stage_key: 'SATURDAY_MEETING',
      entered: 1,
      eligible: 1,
      reached_next: 1,
      exited: 0,
      reached_so_far: 1,
    },
    {
      stage_key: 'ATTENDED',
      entered: 1,
      eligible: 1,
      reached_next: 0,
      exited: 0,
      reached_so_far: 0,
    },
  ],
};

const readFunnel = async (
  funnelRow: Record<string, unknown>,
  otherAnswers: SqlAnswer[] = [],
) => {
  const { metricsService } = setup({
    answers: [[STEP, [funnelRow]], ...otherAnswers],
  });
  const funnel = await metricsService.getFunnel({
    workspaceId: WORKSPACE_ID,
    filter: DEFAULT_FILTER,
  });

  if (funnel === null) {
    throw new Error('Expected a funnel payload');
  }

  return funnel;
};

const findStep = (rows: AnalyticsFunnelRow[], stageKey: string) => {
  const row = rows.find((candidate) => candidate.stageKey === stageKey);

  if (row === undefined) {
    throw new Error(`No funnel row for ${stageKey}`);
  }

  return row;
};

const expectStatementShape = ({ sql, parameters }: RecordedStatement) => {
  const referencedParameters = new Set(
    [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])),
  );

  // Postgres rejects a statement with an unused or skipped parameter.
  expect([...referencedParameters].sort((first, second) => first - second)).toEqual(
    parameters.map((_parameter, index) => index + 1),
  );
  expect(sql).not.toMatch(/,\s*SELECT\b/);
  expect(sql).not.toMatch(/,\s*\)/);
  expect(sql).not.toMatch(/,\s*,/);
};

describe('CrmAnalyticsMetricsService', () => {
  describe('off switch and missing storage', () => {
    const callEveryPageRead = (metricsService: CrmAnalyticsMetricsService) =>
      Promise.all([
        metricsService.getOverview({
          workspaceId: WORKSPACE_ID,
          filter: DEFAULT_FILTER,
        }),
        metricsService.getFunnel({
          workspaceId: WORKSPACE_ID,
          filter: DEFAULT_FILTER,
        }),
        metricsService.getCategories({
          workspaceId: WORKSPACE_ID,
          filter: DEFAULT_FILTER,
          groupBy: 'TRACK_PROGRAM',
        }),
        metricsService.getTrends({
          workspaceId: WORKSPACE_ID,
          filter: DEFAULT_FILTER,
          metric: 'TOTAL_CONTACTS',
          stageKey: null,
        }),
      ]);

    it('gives a null payload and reads nothing when switched off', async () => {
      const { metricsService, runPageTransaction, facadeService, statements } =
        setup({ isDisabled: true });

      await expect(callEveryPageRead(metricsService)).resolves.toEqual([
        null,
        null,
        null,
        null,
      ]);
      expect(runPageTransaction).not.toHaveBeenCalled();
      expect(facadeService.getCrmState).not.toHaveBeenCalled();
      expect(statements).toHaveLength(0);
    });

    it('checks for storage first and reads no analytics table without it', async () => {
      const { metricsService, statements } = setup({ hasStorage: false });

      await expect(callEveryPageRead(metricsService)).resolves.toEqual([
        null,
        null,
        null,
        null,
      ]);
      expect(statements).toHaveLength(4);
      statements.forEach(({ sql }) => {
        expect(sql).toContain(`to_regclass('analytics.sync_log')`);
        expect(sql).not.toMatch(/analytics\.(stage_transition|daily_snapshot)/);
      });
    });
  });

  describe('funnel', () => {
    it('matches the hand-calculated table', async () => {
      const funnel = await readFunnel(HAND_SAMPLE_FUNNEL_ROW, [
        [
          DURATIONS,
          [{ stage_key: 'NEW', median_days: 5, completed_stays: 5 }],
        ],
      ]);

      expect(funnel.cohortSize).toBe(7);
      expect(findStep(funnel.rows, 'NEW')).toEqual({
        stageKey: 'NEW',
        label: 'New',
        windowDays: 14,
        entered: 7,
        eligible: 5,
        reachedNext: 2,
        timedOut: 2,
        exited: 1,
        inWindow: 2,
        stepRate: 0.4,
        soFarRate: 4 / 7,
        dropOffRate: 0.6,
        isUnderMinimum: true,
        medianDays: 5,
        completedStays: 5,
      });
      expect(findStep(funnel.rows, 'CONTACTED')).toEqual({
        stageKey: 'CONTACTED',
        label: 'Contacted',
        windowDays: 14,
        entered: 4,
        eligible: 3,
        reachedNext: 1,
        timedOut: 2,
        exited: 0,
        inWindow: 1,
        stepRate: 1 / 3,
        soFarRate: 0.25,
        dropOffRate: 2 / 3,
        isUnderMinimum: true,
        medianDays: null,
        completedStays: 0,
      });
    });

    it('keeps the identities on every step row', async () => {
      const { rows } = await readFunnel(HAND_SAMPLE_FUNNEL_ROW);

      rows
        .filter((row) => row.windowDays !== null)
        .forEach((row) => {
          expect(row.entered).toBe(row.eligible + row.inWindow);
          expect(row.eligible).toBe(row.reachedNext + row.timedOut + row.exited);
        });
    });

    it('lists every ranked stage in order, with zeros for an empty one', async () => {
      const { rows } = await readFunnel(HAND_SAMPLE_FUNNEL_ROW);

      expect(rows.map((row) => row.stageKey)).toEqual([
        'NEW',
        'CONTACTED',
        'BEFORE_MEETING',
        'SATURDAY_MEETING',
        'ATTENDED',
        'SECOND_MEETING',
        'AGREEMENT_SENT',
        'SIGNED',
      ]);
      expect(findStep(rows, 'SECOND_MEETING')).toMatchObject({
        entered: 0,
        eligible: 0,
        stepRate: null,
        soFarRate: null,
        dropOffRate: null,
      });
    });

    it('never shows too-recent people as 0% or dropped', async () => {
      const { rows } = await readFunnel({
        group_key: '',
        entered: 5,
        eligible: 0,
        reached: 0,
        reached_so_far: 0,
        steps: [
          {
            stage_key: 'NEW',
            entered: 5,
            eligible: 0,
            reached_next: 0,
            exited: 0,
            reached_so_far: 0,
          },
        ],
      });

      expect(findStep(rows, 'NEW')).toMatchObject({
        inWindow: 5,
        timedOut: 0,
        exited: 0,
        stepRate: null,
        dropOffRate: null,
        soFarRate: 0,
      });
    });

    it('gives the final stage 0 or null in the step columns', async () => {
      const { rows } = await readFunnel({
        group_key: '',
        entered: 9,
        eligible: 0,
        reached: 0,
        reached_so_far: 2,
        steps: [
          {
            stage_key: 'SIGNED',
            entered: 2,
            eligible: 0,
            reached_next: 0,
            exited: 0,
            reached_so_far: 0,
          },
        ],
      });

      expect(findStep(rows, 'SIGNED')).toMatchObject({
        windowDays: null,
        entered: 2,
        eligible: 0,
        reachedNext: 0,
        timedOut: 0,
        exited: 0,
        inWindow: 0,
        stepRate: null,
        soFarRate: null,
        dropOffRate: null,
      });
    });

    it('rates overall conversion on eligible people only', async () => {
      const { overall } = await readFunnel({
        group_key: '',
        entered: 100,
        eligible: 40,
        reached: 4,
        reached_so_far: 10,
        steps: [],
      });

      expect(overall).toEqual({
        finalStageKey: 'SIGNED',
        windowDays: 90,
        eligible: 40,
        reached: 4,
        rate: 0.1,
        soFarRate: 0.1,
        isUnderMinimum: false,
      });
    });

    it('leaves overall conversion null with nobody eligible', async () => {
      const { overall } = await readFunnel(HAND_SAMPLE_FUNNEL_ROW);

      expect(overall.rate).toBeNull();
      expect(overall.isUnderMinimum).toBe(true);
    });

    it('rounds median days and reports excluded people', async () => {
      const funnel = await readFunnel(HAND_SAMPLE_FUNNEL_ROW, [
        [
          DURATIONS,
          [{ stage_key: 'NEW', median_days: 5.26, completed_stays: 3 }],
        ],
        [EXCLUDED, [{ excluded_count: 6 }]],
      ]);

      expect(findStep(funnel.rows, 'NEW').medianDays).toBe(5.3);
      expect(funnel.cohortExcludedUnmapped).toBe(6);
    });

    describe('lowest step', () => {
      const buildStep = (
        stageKey: string,
        eligible: number,
        reachedNext: number,
      ) => ({
        stage_key: stageKey,
        entered: eligible,
        eligible,
        reached_next: reachedNext,
        exited: 0,
        reached_so_far: reachedNext,
      });

      const readLowestStep = async (steps: ReturnType<typeof buildStep>[]) =>
        (
          await readFunnel({
            group_key: '',
            entered: 100,
            eligible: 0,
            reached: 0,
            reached_so_far: 0,
            steps,
          })
        ).lowestStepStageKey;

      it('skips steps under the minimum sample', async () => {
        await expect(
          readLowestStep([
            buildStep('NEW', 100, 50),
            buildStep('CONTACTED', 40, 30),
            buildStep('BEFORE_MEETING', 29, 1),
          ]),
        ).resolves.toBe('CONTACTED');
      });

      it('skips the first step when another qualifies', async () => {
        await expect(
          readLowestStep([
            buildStep('NEW', 100, 10),
            buildStep('CONTACTED', 40, 30),
          ]),
        ).resolves.toBe('CONTACTED');
      });

      it('names the first step when it alone qualifies', async () => {
        await expect(
          readLowestStep([buildStep('NEW', 100, 10), buildStep('CONTACTED', 5, 1)]),
        ).resolves.toBe('NEW');
      });

      it('names nothing when no step qualifies', async () => {
        await expect(
          readLowestStep([buildStep('NEW', 29, 1)]),
        ).resolves.toBeNull();
      });
    });

    it('applies the date filter to the application date, as parameters', async () => {
      const { metricsService, statements } = setup({
        answers: [[STEP, [HAND_SAMPLE_FUNNEL_ROW]]],
      });

      await metricsService.getFunnel({
        workspaceId: WORKSPACE_ID,
        filter: {
          ...DEFAULT_FILTER,
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
        },
      });

      const funnelStatement = statements.find(({ sql }) =>
        FUNNEL_PLAIN.test(sql),
      );

      expect(funnelStatement?.sql).toMatch(
        /s\.created_at >= \$2 AND \(s\.created_at AT TIME ZONE \$\d+::text\)::date >= \$\d+::date/,
      );
      expect(funnelStatement?.parameters).toEqual(
        expect.arrayContaining(['UTC', '2026-10-01', '2026-10-31']),
      );
    });
  });

  describe('overview', () => {
    const OVERVIEW_ANSWERS: SqlAnswer[] = [
      [
        STAGE_COUNTS,
        [
          { raw_stage: 'NEW', person_count: 10 },
          { raw_stage: 'SIGNED_PAID', person_count: 2 },
          { raw_stage: 'SIGNED_NON_PAID', person_count: 1 },
          { raw_stage: 'NOT_INTERESTED', person_count: 3 },
          { raw_stage: 'INTERESTED', person_count: 4 },
          { raw_stage: 'LEGACY', person_count: 5 },
          { raw_stage: null, person_count: 6 },
          { raw_stage: '', person_count: 1 },
        ],
      ],
      [
        CLOCK_TOTALS,
        [
          { current_key: 'NEW', inactive_count: 2, stuck_count: 3 },
          { current_key: 'INTERESTED', inactive_count: 1, stuck_count: 0 },
        ],
      ],
      [
        STUCK_ROWS,
        [
          {
            person_id: 'person-1',
            current_key: 'NEW',
            stage_entered_at: new Date('2026-10-01T00:00:00.000Z'),
            days_in_stage: 37,
            days_over_limit: 23,
            is_lower_bound: true,
            total_count: 3,
          },
          {
            person_id: 'person-2',
            current_key: 'NEW',
            stage_entered_at: '2026-10-05T00:00:00.000Z',
            days_in_stage: 33,
            days_over_limit: 19,
            is_lower_bound: false,
            total_count: 3,
          },
        ],
      ],
      [NEW_APPLICATION_TOTALS, [{ current_count: 4, previous_count: 2 }]],
      [IMPORTED_PEOPLE, [{ imported_count: 42 }]],
    ];

    const readOverview = async (filter: AnalyticsFilter = DEFAULT_FILTER) => {
      const context = setup({ answers: OVERVIEW_ANSWERS });
      const overview = await context.metricsService.getOverview({
        workspaceId: WORKSPACE_ID,
        filter,
      });

      if (overview === null) {
        throw new Error('Expected an overview payload');
      }

      return { overview, statements: context.statements };
    };

    it('makes the top rows sum to total contacts', async () => {
      const {
        overview: { figures, stageTotals },
      } = await readOverview();

      expect(figures.totalContacts).toBe(32);
      expect(
        stageTotals
          .filter((row) => row.rowKind !== 'NESTED')
          .reduce((total, row) => total + row.count, 0),
      ).toBe(32);
    });

    it('counts active as MAIN or OTHER, not success', async () => {
      const {
        overview: { figures },
      } = await readOverview();

      expect(figures.activePeople).toBe(14);
    });

    it('nests raw siblings under their stage and marks unmapped values', async () => {
      const {
        overview: { stageTotals },
      } = await readOverview();

      expect(stageTotals.find((row) => row.rowKey === 'SIGNED')).toMatchObject({
        rowKind: 'MAIN',
        count: 3,
        pastLimitCount: null,
      });
      expect(
        stageTotals.filter((row) => row.parentStageKey === 'SIGNED'),
      ).toEqual([
        {
          rowKey: 'SIGNED:SIGNED_PAID',
          label: 'Signed paid',
          rowKind: 'NESTED',
          parentStageKey: 'SIGNED',
          count: 2,
          pastLimitCount: null,
          inactiveCount: 0,
        },
        {
          rowKey: 'SIGNED:SIGNED_NON_PAID',
          label: 'SIGNED_NON_PAID',
          rowKind: 'NESTED',
          parentStageKey: 'SIGNED',
          count: 1,
          pastLimitCount: null,
          inactiveCount: 0,
        },
      ]);
      expect(stageTotals.filter((row) => row.rowKind === 'UNMAPPED')).toEqual([
        {
          rowKey: 'UNMAPPED:LEGACY',
          label: 'LEGACY',
          rowKind: 'UNMAPPED',
          parentStageKey: null,
          count: 5,
          pastLimitCount: null,
          inactiveCount: 0,
        },
      ]);
      expect(stageTotals.at(-1)).toEqual({
        rowKey: 'NO_STAGE',
        label: 'No stage',
        rowKind: 'NO_STAGE',
        parentStageKey: null,
        count: 7,
        pastLimitCount: null,
        inactiveCount: 0,
      });
    });

    it('gives each row a unique key', async () => {
      const {
        overview: { stageTotals },
      } = await readOverview();
      const rowKeys = stageTotals.map((row) => row.rowKey);

      expect(new Set(rowKeys).size).toBe(rowKeys.length);
    });

    it('reports past-limit counts only on stages with a limit', async () => {
      const {
        overview: { stageTotals },
      } = await readOverview();

      expect(
        stageTotals.find((row) => row.rowKey === 'NEW')?.pastLimitCount,
      ).toBe(3);
      expect(
        stageTotals.find((row) => row.rowKey === 'CONTACTED')?.pastLimitCount,
      ).toBe(0);
      expect(
        stageTotals.find((row) => row.rowKey === 'INTERESTED')?.pastLimitCount,
      ).toBeNull();
    });

    it('reports inactive people per stage, apart from past-limit people', async () => {
      const {
        overview: { figures, stageTotals },
      } = await readOverview();
      const findRow = (rowKey: string) =>
        stageTotals.find((row) => row.rowKey === rowKey);

      expect(findRow('NEW')).toMatchObject({
        pastLimitCount: 3,
        inactiveCount: 2,
      });
      expect(findRow('INTERESTED')).toMatchObject({
        pastLimitCount: null,
        inactiveCount: 1,
      });
      expect(findRow('CONTACTED')?.inactiveCount).toBe(0);
      expect(
        stageTotals.reduce((total, row) => total + row.inactiveCount, 0),
      ).toBe(figures.inactivePeople);
    });

    it('still counts a person inactive after a move inside one stage', async () => {
      const { statements } = await readOverview();

      expect(
        statements.find(({ sql }) => CLOCK_TOTALS.test(sql))?.sql,
      ).toContain(
        'moved_person AS (SELECT DISTINCT t.person_id FROM transition t WHERE t.from_key IS DISTINCT FROM t.to_key)',
      );
    });

    it('maps stuck rows, with names read live and the total apart', async () => {
      const {
        overview: { figures, stuck },
      } = await readOverview();

      expect(figures.stuckPeople).toBe(3);
      expect(figures.inactivePeople).toBe(3);
      expect(stuck.total).toBe(3);
      expect(stuck.hasLimits).toBe(true);
      expect(stuck.rows[0]).toEqual({
        personId: 'person-1',
        displayName: 'Ada Lovelace',
        stageKey: 'NEW',
        stageLabel: 'New',
        stageEnteredAt: '2026-10-01T00:00:00.000Z',
        daysInStage: 37,
        daysOverLimit: 23,
        isLowerBound: true,
      });
      expect(stuck.rows[1].displayName).toBe('');
    });

    it('shows the signed figure only when configured', async () => {
      const {
        overview: { figures },
      } = await readOverview();

      expect(figures.signedPeople).toBeNull();
    });

    it('defaults new applications to the last 7 local days', async () => {
      const {
        overview: { figures },
        statements,
      } = await readOverview();

      expect(figures).toMatchObject({
        newApplications: 4,
        newApplicationsPrevious: 2,
        newApplicationsFrom: '2026-11-01',
        newApplicationsTo: '2026-11-07',
        importedApplications: 12,
      });
      expect(
        statements.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))
          ?.parameters,
      ).toEqual(
        expect.arrayContaining([
          '2026-11-01',
          '2026-11-07',
          '2026-10-25',
          '2026-10-31',
        ]),
      );
    });

    it('compares a date filter with the equal-length span before', async () => {
      const {
        overview: { figures },
        statements,
      } = await readOverview({
        ...DEFAULT_FILTER,
        dateFrom: '2026-10-11',
        dateTo: '2026-10-20',
      });

      expect(figures.newApplicationsFrom).toBe('2026-10-11');
      expect(figures.newApplicationsTo).toBe('2026-10-20');
      expect(
        statements.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))
          ?.parameters,
      ).toEqual(expect.arrayContaining(['2026-10-01', '2026-10-10']));
    });

    it.each<[string, string | null, string]>([
      ['starts at tracking start', '2026-08-01', '2026-08-07'],
      ['has no start, so starts at tracking start', null, '2026-08-07'],
      ['starts before tracking start', '2026-07-20', '2026-08-07'],
      [
        'has a span before that only partly follows tracking start',
        '2026-08-02',
        '2026-08-08',
      ],
    ])(
      'has no earlier new applications to compare with when the range %s',
      async (_description, dateFrom, dateTo) => {
        const {
          overview: { figures },
        } = await readOverview({ ...DEFAULT_FILTER, dateFrom, dateTo });

        expect(figures.newApplications).toBe(4);
        expect(figures.newApplicationsPrevious).toBeNull();
      },
    );

    it('keeps the count when the span before starts at tracking start', async () => {
      const {
        overview: { figures },
      } = await readOverview({
        ...DEFAULT_FILTER,
        dateFrom: '2026-08-08',
        dateTo: '2026-08-14',
      });

      expect(figures.newApplicationsPrevious).toBe(2);
    });

    it('judges the span before by the first full local day of tracking', async () => {
      // Tracking starts at midnight UTC on August 1, the evening of July 31 in New York,
      // so July 31 is partly tracked there.
      const replacedTimeZone = jest.replaceProperty(
        CRM_ANALYTICS_CONFIG,
        'reportingTimeZone',
        'America/New_York',
      );

      try {
        const readPrevious = async (dateFrom: string, dateTo: string) =>
          (await readOverview({ ...DEFAULT_FILTER, dateFrom, dateTo })).overview
            .figures.newApplicationsPrevious;

        await expect(readPrevious('2026-08-08', '2026-08-14')).resolves.toBe(2);
        await expect(
          readPrevious('2026-08-07', '2026-08-13'),
        ).resolves.toBeNull();
      } finally {
        replacedTimeZone.restore();
      }
    });

    it('joins submissions to scope only with a person filter', async () => {
      const { statements: unfiltered } = await readOverview();
      const { statements: filtered } = await readOverview({
        ...DEFAULT_FILTER,
        status: 'ACTIVE',
      });

      expect(
        unfiltered.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))?.sql,
      ).not.toContain('JOIN scope s ON s.person_id = sub.person_id');
      expect(
        filtered.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))?.sql,
      ).toContain('JOIN scope s ON s.person_id = sub.person_id');
    });

    it('keeps soft-deleted people out of new applications with no person filter', async () => {
      const { statements } = await readOverview();

      expect(
        statements.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))?.sql,
      ).toContain(`(s."personId" IS NULL OR p."deletedAt" IS NULL)`);
    });

    it('gives null new applications without the form objects', async () => {
      const { metricsService, statements } = setup({
        answers: OVERVIEW_ANSWERS,
        state: buildState({ hasFormSubmissionObject: false }),
      });

      const overview = await metricsService.getOverview({
        workspaceId: WORKSPACE_ID,
        filter: DEFAULT_FILTER,
      });

      expect(overview?.figures.newApplications).toBeNull();
      expect(overview?.figures.newApplicationsPrevious).toBeNull();
      expect(
        statements.some(({ sql }) => NEW_APPLICATION_TOTALS.test(sql)),
      ).toBe(false);
    });

    it('limits current state to tracked people under a date filter', async () => {
      const { overview, statements } = await readOverview({
        ...DEFAULT_FILTER,
        dateFrom: '2026-10-01',
      });

      expect(overview.importedExcludedByDate).toBe(42);
      expect(
        statements.find(({ sql }) => STAGE_COUNTS.test(sql))?.sql,
      ).toContain('p.created_at >= $2');

      const { overview: unfiltered, statements: unfilteredStatements } =
        await readOverview();

      expect(unfiltered.importedExcludedByDate).toBe(0);
      expect(
        unfilteredStatements.some(({ sql }) => IMPORTED_PEOPLE.test(sql)),
      ).toBe(false);
    });
  });

  describe('categories', () => {
    const FUNNEL_GROUPS = [
      {
        group_key: '/ROBOTICS',
        entered: 6,
        eligible: 4,
        reached: 1,
        reached_so_far: 2,
        steps: [
          {
            stage_key: 'NEW',
            entered: 6,
            eligible: 5,
            reached_next: 2,
            exited: 1,
            reached_so_far: 3,
          },
        ],
      },
    ];

    const TRACK_ANSWERS: SqlAnswer[] = [
      [
        CATEGORY_PEOPLE,
        [
          {
            parent_key: null,
            category_key: 'BUSINESS',
            people: 5,
            active_people: 4,
          },
          {
            parent_key: 'BUSINESS',
            category_key: 'FINANCE_INTERN',
            people: 3,
            active_people: 2,
          },
          {
            parent_key: 'BUSINESS',
            category_key: 'MARKETING_INTERN',
            people: 4,
            active_people: 3,
          },
          {
            parent_key: null,
            category_key: 'ROBOTICS',
            people: 8,
            active_people: 8,
          },
          {
            parent_key: null,
            category_key: 'UNMAPPED',
            people: 20,
            active_people: 1,
          },
          {
            parent_key: 'UNMAPPED',
            category_key: 'OLD_ROLE',
            people: 20,
            active_people: 1,
          },
          {
            parent_key: null,
            category_key: 'NONE',
            people: 30,
            active_people: 9,
          },
        ],
      ],
      [
        CATEGORY_OVERLAP,
        [
          {
            distinct_people: 60,
            people_in_several: 7,
            people_in_several_tracks: 3,
          },
        ],
      ],
      [
        CATEGORY_NEW_APPLICATIONS,
        [{ parent_key: null, category_key: 'ROBOTICS', new_applications: 2 }],
      ],
      [/category_member[\s\S]*overall_total a/, FUNNEL_GROUPS],
    ];

    const readCategories = async ({
      answers = TRACK_ANSWERS,
      groupBy = 'TRACK_PROGRAM',
      state,
      filter = DEFAULT_FILTER,
    }: {
      answers?: SqlAnswer[];
      groupBy?: 'TRACK_PROGRAM' | 'SOURCE';
      state?: CrmAnalyticsCrmState;
      filter?: AnalyticsFilter;
    } = {}) => {
      const context = setup({ answers, state });
      const categories = await context.metricsService.getCategories({
        workspaceId: WORKSPACE_ID,
        filter,
        groupBy,
      });

      if (categories === null) {
        throw new Error('Expected a categories payload');
      }

      return { categories, statements: context.statements };
    };

    it('puts programs under their track, largest first, catch-alls last', async () => {
      const {
        categories: { rows },
      } = await readCategories();

      expect(rows.map((row) => [row.parentKey, row.key])).toEqual([
        [null, 'ROBOTICS'],
        [null, 'BUSINESS'],
        ['BUSINESS', 'MARKETING_INTERN'],
        ['BUSINESS', 'FINANCE_INTERN'],
        [null, 'UNMAPPED'],
        ['UNMAPPED', 'OLD_ROLE'],
        [null, 'NONE'],
      ]);
    });

    it('labels and flags the rows', async () => {
      const {
        categories: { rows },
      } = await readCategories();

      const findRow = (key: string) => rows.find((row) => row.key === key);

      expect(findRow('ROBOTICS')).toMatchObject({
        label: 'Robotics & Intelligent Systems',
        isUnmapped: false,
      });
      expect(findRow('FINANCE_INTERN')).toMatchObject({
        label: 'Finance intern',
        isUnmapped: false,
      });
      expect(findRow('UNMAPPED')).toMatchObject({
        label: 'Unmapped',
        isUnmapped: true,
      });
      expect(findRow('OLD_ROLE')).toMatchObject({
        label: 'OLD_ROLE',
        isUnmapped: true,
      });
      expect(findRow('NONE')).toMatchObject({
        label: 'No position',
        isUnmapped: false,
      });
    });

    it('fills counts, rates and step rates from the funnel group', async () => {
      const {
        categories: { rows, stepStageKeys },
      } = await readCategories();
      const robotics = rows.find((row) => row.key === 'ROBOTICS');

      expect(stepStageKeys).toEqual([
        'NEW',
        'CONTACTED',
        'BEFORE_MEETING',
        'SATURDAY_MEETING',
        'ATTENDED',
        'SECOND_MEETING',
        'AGREEMENT_SENT',
      ]);
      expect(robotics).toMatchObject({
        people: 8,
        activePeople: 8,
        newApplications: 2,
        cohortSize: 6,
        overallEligible: 4,
        overallRate: 0.25,
        overallSoFarRate: 2 / 6,
      });
      expect(robotics?.stepRates).toHaveLength(7);
      expect(robotics?.stepRates[0]).toEqual({
        stageKey: 'NEW',
        eligible: 5,
        rate: 0.4,
        soFarRate: 0.5,
      });
      expect(robotics?.stepRates[1]).toEqual({
        stageKey: 'CONTACTED',
        eligible: 0,
        rate: null,
        soFarRate: null,
      });
    });

    it('returns the span its new applications cover', async () => {
      const { categories: withoutDates } = await readCategories();
      const { categories: withDates } = await readCategories({
        filter: {
          ...DEFAULT_FILTER,
          dateFrom: '2026-10-11',
          dateTo: '2026-10-20',
        },
      });

      expect(withoutDates).toMatchObject({
        newApplicationsFrom: '2026-11-01',
        newApplicationsTo: '2026-11-07',
      });
      expect(withDates).toMatchObject({
        newApplicationsFrom: '2026-10-11',
        newApplicationsTo: '2026-10-20',
      });
    });

    it('reports overlap for tracks', async () => {
      const { categories } = await readCategories();

      expect(categories).toMatchObject({
        distinctPeople: 60,
        peopleInSeveral: 7,
        peopleInSeveralTracks: 3,
      });
    });

    it('has one flat row per source, flagging values outside the field options', async () => {
      const { categories, statements } = await readCategories({
        groupBy: 'SOURCE',
        answers: [
          [
            CATEGORY_PEOPLE,
            [
              {
                parent_key: null,
                category_key: 'LINKEDIN',
                people: 5,
                active_people: 4,
              },
              {
                parent_key: null,
                category_key: 'OLD_SITE',
                people: 9,
                active_people: 1,
              },
              {
                parent_key: null,
                category_key: 'NONE',
                people: 2,
                active_people: 2,
              },
            ],
          ],
          [
            CATEGORY_OVERLAP,
            [
              {
                distinct_people: 16,
                people_in_several: 0,
                people_in_several_tracks: 0,
              },
            ],
          ],
        ],
      });

      expect(
        categories.rows.map((row) => [row.key, row.label, row.isUnmapped]),
      ).toEqual([
        ['LINKEDIN', 'LinkedIn', false],
        ['OLD_SITE', 'OLD_SITE', true],
        ['NONE', 'No source', false],
      ]);
      expect(categories.distinctPeople).toBe(16);
      expect(categories.peopleInSeveral).toBe(0);
      expect(categories.peopleInSeveralTracks).toBe(0);
      expect(
        statements.some(({ sql }) => sql.includes('person_position')),
      ).toBe(false);
    });

    it('flags no source as unmapped when the field has no option list', async () => {
      const { categories } = await readCategories({
        groupBy: 'SOURCE',
        state: buildState({
          applicantSource: { status: 'OK', options: [] },
        }),
        answers: [
          [
            CATEGORY_PEOPLE,
            [
              {
                parent_key: null,
                category_key: 'typed by hand',
                people: 5,
                active_people: 4,
              },
            ],
          ],
        ],
      });

      expect(categories.rows[0].isUnmapped).toBe(false);
    });

    it('gives null new applications without the form objects', async () => {
      const { categories, statements } = await readCategories({
        state: buildState({ hasFormSubmissionObject: false }),
      });

      expect(categories.rows[0].newApplications).toBeNull();
      expect(
        statements.some(({ sql }) => CATEGORY_NEW_APPLICATIONS.test(sql)),
      ).toBe(false);
    });

    it('splits the date filter by basis', async () => {
      const { statements } = await readCategories({
        filter: {
          ...DEFAULT_FILTER,
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
        },
      });

      // People: created in range. New applications: submitted in range. Funnel: application date.
      expect(
        statements.find(({ sql }) => CATEGORY_PEOPLE.test(sql))?.sql,
      ).toContain('p.created_at >= $2 AND (p.created_at AT TIME ZONE');
      expect(
        statements.find(({ sql }) => CATEGORY_NEW_APPLICATIONS.test(sql))?.sql,
      ).not.toContain('p.created_at >= $2');
      expect(
        statements.find(({ sql }) => /overall_total a/.test(sql))?.sql,
      ).toContain('s.created_at >= $2 AND (s.created_at AT TIME ZONE');
    });

    describe('track and program filters', () => {
      const CATEGORY_STATEMENTS = [
        CATEGORY_PEOPLE,
        CATEGORY_OVERLAP,
        CATEGORY_NEW_APPLICATIONS,
        /category_member[\s\S]*overall_total a/,
      ];

      const readPositionConditions = async (
        filter: Partial<AnalyticsFilter>,
      ) => {
        const { statements } = await readCategories({
          filter: { ...DEFAULT_FILTER, ...filter },
        });

        return CATEGORY_STATEMENTS.map((pattern) => {
          const statement = statements.find(({ sql }) => pattern.test(sql));

          return {
            condition: statement?.sql.match(
              /person_position AS \([\s\S]*?WHERE ([^\n]*)\),\ncategory_member/,
            )?.[1],
            parameters: statement?.parameters,
          };
        });
      };

      it('keeps every position with neither filter', async () => {
        (await readPositionConditions({})).forEach(({ condition }) =>
          expect(condition).toBe('TRUE'),
        );
      });

      it('limits people, overlap, new applications and funnel groups to the track', async () => {
        (await readPositionConditions({ trackKey: 'ROBOTICS' })).forEach(
          ({ condition, parameters }) => {
            expect(condition).toMatch(
              /^COALESCE\(pm\.track_key, 'UNMAPPED'\) = \$\d+::text$/,
            );
            expect(parameters).toContain('ROBOTICS');
          },
        );
      });

      it('limits people, overlap, new applications and funnel groups to the program', async () => {
        (
          await readPositionConditions({ programKey: 'FINANCE_INTERN' })
        ).forEach(({ condition, parameters }) => {
          expect(condition).toMatch(
            /^position_row\.position_value = \$\d+::text$/,
          );
          expect(parameters).toContain('FINANCE_INTERN');
        });
      });

      it('applies both together', async () => {
        (
          await readPositionConditions({
            trackKey: 'BUSINESS',
            programKey: 'FINANCE_INTERN',
          })
        ).forEach(({ condition }) =>
          expect(condition).toMatch(
            /^COALESCE\(pm\.track_key, 'UNMAPPED'\) = \$\d+::text AND position_row\.position_value = \$\d+::text$/,
          ),
        );
      });

      it('leaves source rows to the people filter alone', async () => {
        const { statements } = await readCategories({
          groupBy: 'SOURCE',
          filter: { ...DEFAULT_FILTER, trackKey: 'ROBOTICS' },
        });

        expect(
          statements.some(({ sql }) => sql.includes('person_position')),
        ).toBe(false);
      });
    });
  });

  describe('status filter', () => {
    const RATE_STATEMENTS =
      /overall_total a|GROUP BY cs\.stage_key|excluded_count/;

    const readRateStatements = async (filter: AnalyticsFilter) => {
      const { metricsService, statements } = setup();

      await metricsService.getFunnel({ workspaceId: WORKSPACE_ID, filter });
      await metricsService.getCategories({
        workspaceId: WORKSPACE_ID,
        filter,
        groupBy: 'TRACK_PROGRAM',
      });

      for (const metric of ['OVERALL_CONVERSION', 'DROP_OFF'] as const) {
        await metricsService.getTrends({
          workspaceId: WORKSPACE_ID,
          filter,
          metric,
          stageKey: null,
        });
      }

      return statements.filter(({ sql }) => RATE_STATEMENTS.test(sql));
    };

    it.each<AnalyticsFilter['status']>([
      'ACTIVE',
      'SUCCESS',
      'EXITED',
      'UNMAPPED',
      'NO_STAGE',
    ])(
      'reads funnel rows, category rates, cohorts and rate trends as if unfiltered under %s',
      async (status) => {
        const unfiltered = await readRateStatements(DEFAULT_FILTER);

        // Funnel, durations, excluded, category groups, and two trends with their cohorts.
        expect(unfiltered).toHaveLength(8);
        await expect(
          readRateStatements({ ...DEFAULT_FILTER, status }),
        ).resolves.toEqual(unfiltered);
      },
    );

    it('still narrows counts', async () => {
      const filter: AnalyticsFilter = { ...DEFAULT_FILTER, status: 'ACTIVE' };
      const { metricsService, statements } = setup({
        answers: [
          [
            STUCK_ROWS,
            [
              {
                person_id: 'person-1',
                current_key: 'NEW',
                stage_entered_at: NOW,
                days_in_stage: 20,
                days_over_limit: 6,
                is_lower_bound: false,
                total_count: 1,
              },
            ],
          ],
        ],
      });

      await metricsService.getOverview({ workspaceId: WORKSPACE_ID, filter });
      await metricsService.getCategories({
        workspaceId: WORKSPACE_ID,
        filter,
        groupBy: 'TRACK_PROGRAM',
      });
      await metricsService.getTrends({
        workspaceId: WORKSPACE_ID,
        filter,
        metric: 'TOTAL_CONTACTS',
        stageKey: null,
      });

      [
        STAGE_COUNTS,
        CLOCK_TOTALS,
        STUCK_ROWS,
        NEW_APPLICATION_TOTALS,
        CATEGORY_PEOPLE,
        CATEGORY_OVERLAP,
        CATEGORY_NEW_APPLICATIONS,
        MOVEMENT,
        SNAPSHOT_BUCKETS,
      ].forEach((pattern) =>
        expect(statements.find(({ sql }) => pattern.test(sql))?.sql).toContain(
          `m.kind IN ('MAIN', 'OTHER')`,
        ),
      );
    });
  });

  describe('trends', () => {
    const readTrends = async ({
      answers = [],
      filter = DEFAULT_FILTER,
      metric,
      stageKey = null,
      state,
      trackingStart,
    }: {
      answers?: SqlAnswer[];
      filter?: AnalyticsFilter;
      metric: Parameters<CrmAnalyticsMetricsService['getTrends']>[0]['metric'];
      stageKey?: string | null;
      state?: CrmAnalyticsCrmState;
      trackingStart?: string;
    }) => {
      const context = setup({ answers, state, trackingStart });
      const trends = await context.metricsService.getTrends({
        workspaceId: WORKSPACE_ID,
        filter,
        metric,
        stageKey,
      });

      if (trends === null) {
        throw new Error('Expected a trends payload');
      }

      return { trends, statements: context.statements };
    };

    it('pairs new applications with the buckets before, counting tracked empties as 0', async () => {
      const { trends, statements } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        answers: [
          [
            SUBMISSION_BUCKETS,
            [
              { bucket_start: '2026-11-02', bucket_value: 3 },
              { bucket_start: '2026-08-10', bucket_value: 1 },
            ],
          ],
        ],
      });

      expect(trends.series).toHaveLength(12);
      expect(trends.series[11]).toEqual({
        bucketStart: '2026-11-02',
        value: 3,
        previousValue: 1,
        size: null,
        previousSize: null,
        isPartial: true,
      });
      expect(trends.series[10]).toEqual({
        bucketStart: '2026-10-26',
        value: 0,
        previousValue: 0,
        size: null,
        previousSize: null,
        isPartial: false,
      });
      expect(trends.series[0]).toEqual({
        bucketStart: '2026-08-17',
        value: 0,
        previousValue: null,
        size: null,
        previousSize: null,
        isPartial: false,
      });
      expect(
        statements.find(({ sql }) => SUBMISSION_BUCKETS.test(sql))?.parameters,
      ).toEqual(expect.arrayContaining(['week', '2026-05-25', '2026-11-08']));
    });

    it('has no earlier new applications to compare with at launch', async () => {
      const { trends } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        trackingStart: '2026-10-27T00:00:00.000Z',
        answers: [
          [
            SUBMISSION_BUCKETS,
            [{ bucket_start: '2026-11-02', bucket_value: 3 }],
          ],
        ],
      });

      expect(trends.series.map(({ value }) => value)).toEqual([
        ...new Array<null>(10).fill(null),
        0,
        3,
      ]);
      expect(trends.series.map(({ previousValue }) => previousValue)).toEqual(
        new Array<null>(12).fill(null),
      );
    });

    it.each<[AnalyticsFilter['period'], string, string, string, string]>([
      ['MONTH', '2026-11-01', '2026-11-30', '2026-11-01', '2026-10-01'],
      ['WEEK', '2026-11-02', '2026-11-08', '2026-11-02', '2026-10-26'],
    ])(
      'has no %s comparison when the previous bucket starts before tracking start',
      async (period, dateFrom, dateTo, bucketStart, previousBucketStart) => {
        const { trends } = await readTrends({
          metric: 'NEW_APPLICATIONS',
          trackingStart: '2026-10-27T00:00:00.000Z',
          filter: { ...DEFAULT_FILTER, period, dateFrom, dateTo },
          answers: [
            [
              SUBMISSION_BUCKETS,
              [
                { bucket_start: bucketStart, bucket_value: 120 },
                { bucket_start: previousBucketStart, bucket_value: 4 },
              ],
            ],
          ],
        });

        expect(trends.series).toHaveLength(1);
        expect(trends.series[0]).toMatchObject({
          bucketStart,
          value: 120,
          previousValue: null,
        });
      },
    );

    it('keeps the partial count of the bucket holding tracking start', async () => {
      const { trends } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        trackingStart: '2026-10-27T00:00:00.000Z',
        filter: {
          ...DEFAULT_FILTER,
          period: 'WEEK',
          dateFrom: '2026-10-26',
          dateTo: '2026-11-01',
        },
        answers: [
          [SUBMISSION_BUCKETS, [{ bucket_start: '2026-10-26', bucket_value: 4 }]],
        ],
      });

      expect(trends.series[0]).toMatchObject({
        value: 4,
        previousValue: null,
      });
    });

    it('compares with a previous bucket that starts on the first tracked day', async () => {
      const { trends } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        trackingStart: '2026-10-26T00:00:00.000Z',
        filter: {
          ...DEFAULT_FILTER,
          period: 'WEEK',
          dateFrom: '2026-11-02',
          dateTo: '2026-11-08',
        },
        answers: [
          [SUBMISSION_BUCKETS, [{ bucket_start: '2026-10-26', bucket_value: 4 }]],
        ],
      });

      expect(trends.series[0].previousValue).toBe(4);
    });

    it('has no comparison when tracking began during the first day of the previous bucket', async () => {
      const { trends } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        trackingStart: '2026-10-26T12:00:00.000Z',
        filter: {
          ...DEFAULT_FILTER,
          period: 'WEEK',
          dateFrom: '2026-11-02',
          dateTo: '2026-11-08',
        },
        answers: [
          [SUBMISSION_BUCKETS, [{ bucket_start: '2026-10-26', bucket_value: 4 }]],
        ],
      });

      expect(trends.series[0].previousValue).toBeNull();
    });

    it.each<[AnalyticsFilter['period'], string, string]>([
      ['DAY', '2026-07-31', '2026-08-01'],
      ['WEEK', '2026-07-20', '2026-08-02'],
      ['MONTH', '2026-07-01', '2026-08-31'],
    ])(
      'leaves a %s bucket that ends before tracking start unknown, even with dated rows',
      async (period, dateFrom, dateTo) => {
        const { trends } = await readTrends({
          metric: 'NEW_APPLICATIONS',
          filter: { ...DEFAULT_FILTER, period, dateFrom, dateTo },
          answers: [
            [SUBMISSION_BUCKETS, [{ bucket_start: dateFrom, bucket_value: 2 }]],
          ],
        });

        expect(trends.series.map(({ value }) => value)).toEqual([null, 0]);
        expect(trends.series.map(({ previousValue }) => previousValue)).toEqual(
          [null, null],
        );
      },
    );

    it('judges the new applications cut-off by the local date of tracking start', async () => {
      // Tracking starts at midnight UTC on August 1, still July 31 in New York.
      const replacedTimeZone = jest.replaceProperty(
        CRM_ANALYTICS_CONFIG,
        'reportingTimeZone',
        'America/New_York',
      );

      try {
        const { trends } = await readTrends({
          metric: 'NEW_APPLICATIONS',
          filter: {
            ...DEFAULT_FILTER,
            period: 'MONTH',
            dateFrom: '2026-06-01',
            dateTo: '2026-07-31',
          },
          answers: [
            [
              SUBMISSION_BUCKETS,
              [{ bucket_start: '2026-07-01', bucket_value: 2 }],
            ],
          ],
        });

        expect(trends.series.map(({ value }) => value)).toEqual([null, 2]);
      } finally {
        replacedTimeZone.restore();
      }
    });

    it('says why new applications are missing without the form objects', async () => {
      const { trends, statements } = await readTrends({
        metric: 'NEW_APPLICATIONS',
        state: buildState({ hasFormSubmissionObject: false }),
      });

      expect(trends.unavailableReason).toBe('NO_SUBMISSION_OBJECT');
      expect(trends.series).toEqual([]);
      expect(
        statements.some(({ sql }) => SUBMISSION_BUCKETS.test(sql)),
      ).toBe(false);
    });

    it('leaves a bucket with no snapshot null, never 0', async () => {
      const { trends } = await readTrends({
        metric: 'TOTAL_CONTACTS',
        answers: [
          [
            SNAPSHOT_BUCKETS,
            [{ bucket_start: '2026-11-02', bucket_value: 500 }],
          ],
        ],
      });

      expect(trends.series[11].value).toBe(500);
      expect(trends.series[11].previousValue).toBeNull();
      expect(trends.series[11].previousSize).toBeNull();
      expect(trends.series[0].value).toBeNull();
    });

    it('reads one snapshot dimension at a time', async () => {
      const dimensionOf = async (filter: Partial<AnalyticsFilter>) => {
        const { statements } = await readTrends({
          metric: 'TOTAL_CONTACTS',
          filter: { ...DEFAULT_FILTER, ...filter },
        });

        return statements.find(({ sql }) => SNAPSHOT_BUCKETS.test(sql))
          ?.parameters;
      };

      expect(await dimensionOf({})).toEqual(expect.arrayContaining(['all', '']));
      expect(await dimensionOf({ trackKey: 'ROBOTICS' })).toEqual(
        expect.arrayContaining(['track', 'ROBOTICS']),
      );
      expect(await dimensionOf({ programKey: 'FINANCE_INTERN' })).toEqual(
        expect.arrayContaining(['position', 'FINANCE_INTERN']),
      );
      expect(await dimensionOf({ sourceKey: 'NONE' })).toEqual(
        expect.arrayContaining(['source', 'NONE']),
      );
      // A program inside the chosen track is still one dimension.
      expect(
        await dimensionOf({ trackKey: 'BUSINESS', programKey: 'FINANCE_INTERN' }),
      ).toEqual(expect.arrayContaining(['position', 'FINANCE_INTERN']));
    });

    it.each([
      [{ trackKey: 'ROBOTICS', sourceKey: 'LINKEDIN' }],
      [{ programKey: 'FINANCE_INTERN', sourceKey: 'LINKEDIN' }],
      [{ trackKey: 'ROBOTICS', programKey: 'FINANCE_INTERN' }],
    ])('refuses the snapshot combination %j', async (filter) => {
      const { trends, statements } = await readTrends({
        metric: 'ACTIVE_PEOPLE',
        filter: { ...DEFAULT_FILTER, ...filter },
      });

      expect(trends.unavailableReason).toBe('SNAPSHOT_FILTER_COMBINATION');
      expect(trends.series).toEqual([]);
      expect(statements.some(({ sql }) => SNAPSHOT_BUCKETS.test(sql))).toBe(
        false,
      );
    });

    it('defaults a stage count to the entry stage and echoes it', async () => {
      const { trends, statements } = await readTrends({
        metric: 'STAGE_COUNT',
      });

      expect(trends.stageKey).toBe('NEW');
      expect(
        statements.find(({ sql }) => SNAPSHOT_BUCKETS.test(sql))?.parameters,
      ).toContain('NEW');
    });

    it('refuses daily rates', async () => {
      const { trends } = await readTrends({
        metric: 'OVERALL_CONVERSION',
        filter: { ...DEFAULT_FILTER, period: 'DAY' },
      });

      expect(trends.unavailableReason).toBe('DAILY_RATE');
      expect(trends.series).toEqual([]);
      expect(trends.cohorts).toEqual([]);
    });

    describe('rates by application-date cohort', () => {
      const buildBucket = (
        bucketStart: string,
        overall: { entered: number; eligible: number; reached: number },
        step: { entered: number; eligible: number; reached_next: number },
      ) => ({
        group_key: bucketStart,
        ...overall,
        reached_so_far: overall.reached + 1,
        steps: [
          {
            stage_key: 'NEW',
            ...step,
            exited: 0,
            reached_so_far: step.reached_next + 1,
          },
        ],
      });

      const COHORT_ANSWERS: SqlAnswer[] = [
        [
          /date_trunc[\s\S]*overall_total a/,
          [
            buildBucket(
              '2026-08-17',
              { entered: 10, eligible: 10, reached: 2 },
              { entered: 10, eligible: 10, reached_next: 6 },
            ),
            buildBucket(
              '2026-11-02',
              { entered: 10, eligible: 9, reached: 2 },
              { entered: 10, eligible: 9, reached_next: 6 },
            ),
          ],
        ],
      ];

      it('gives overall conversion only once the bucket is mature', async () => {
        const { trends } = await readTrends({
          metric: 'OVERALL_CONVERSION',
          answers: COHORT_ANSWERS,
        });

        expect(
          trends.series.find(({ bucketStart }) => bucketStart === '2026-08-17'),
        ).toMatchObject({ value: 0.2, size: 10 });
        expect(trends.series.at(-1)).toMatchObject({
          bucketStart: '2026-11-02',
          value: null,
          size: 10,
        });
        expect(trends.series[5]).toMatchObject({ value: null, size: 0 });
      });

      it('widens overall conversion by week to 26 weeks, so aged data has a value', async () => {
        // Mature as the SQL judges it: everyone in the bucket is past the overall window.
        const agedBuckets = Array.from({ length: 52 }, (_unused, weeksBack) => {
          const bucketStart = addCrmAnalyticsPeriods(
            '2026-11-02',
            'WEEK',
            -weeksBack,
          );
          const lastWindowEnd = addCrmAnalyticsLocalDays(
            bucketStart,
            7 + CRM_ANALYTICS_CONFIG.overallWindowDays,
          );

          return buildBucket(
            bucketStart,
            {
              entered: 10,
              eligible: lastWindowEnd <= LOCAL_TODAY ? 10 : 9,
              reached: 2,
            },
            { entered: 10, eligible: 10, reached_next: 6 },
          );
        });

        const { trends } = await readTrends({
          metric: 'OVERALL_CONVERSION',
          trackingStart: '2026-01-01T00:00:00.000Z',
          answers: [[/date_trunc[\s\S]*overall_total a/, agedBuckets]],
        });

        expect(trends.series).toHaveLength(26);
        expect(trends.series[0].bucketStart).toBe('2026-05-11');
        expect(trends.series.some(({ value }) => value !== null)).toBe(true);
        expect(trends.series.slice(-12).map(({ value }) => value)).toEqual(
          new Array<null>(12).fill(null),
        );
      });

      it('keeps every other weekly default at 12 weeks', async () => {
        for (const metric of [
          'NEW_APPLICATIONS',
          'TOTAL_CONTACTS',
          'ACTIVE_PEOPLE',
          'STAGE_COUNT',
          'DROP_OFF',
          'MEDIAN_DAYS',
        ] as const) {
          const { trends } = await readTrends({ metric });

          expect(trends.series).toHaveLength(12);
        }

        const { trends: monthly } = await readTrends({
          metric: 'OVERALL_CONVERSION',
          filter: { ...DEFAULT_FILTER, period: 'MONTH' },
        });

        expect(monthly.series).toHaveLength(12);
      });

      it('gives the sample behind a previous rate', async () => {
        const { trends } = await readTrends({
          metric: 'DROP_OFF',
          answers: [
            [
              /date_trunc[\s\S]*overall_total a/,
              [
                buildBucket(
                  '2026-08-10',
                  { entered: 7, eligible: 7, reached: 1 },
                  { entered: 7, eligible: 7, reached_next: 3 },
                ),
                buildBucket(
                  '2026-11-02',
                  { entered: 10, eligible: 10, reached: 2 },
                  { entered: 10, eligible: 10, reached_next: 6 },
                ),
              ],
            ],
          ],
        });

        expect(trends.series[11]).toMatchObject({
          bucketStart: '2026-11-02',
          size: 10,
          previousValue: 4 / 7,
          previousSize: 7,
        });
        expect(trends.series[0]).toMatchObject({
          previousValue: null,
          previousSize: 0,
        });
      });

      it('cuts cohorts to the whole periods of the series', async () => {
        const readCohortParameters = async (
          metric: 'TOTAL_CONTACTS' | 'OVERALL_CONVERSION',
          filter: Partial<AnalyticsFilter> = {},
        ) => {
          const { statements } = await readTrends({
            metric,
            filter: { ...DEFAULT_FILTER, ...filter },
          });

          return statements.filter(({ sql }) => STEP.test(sql)).at(-1)
            ?.parameters;
        };

        const filteredParameters = await readCohortParameters(
          'TOTAL_CONTACTS',
          { dateFrom: '2026-10-28', dateTo: '2026-11-03' },
        );

        expect(filteredParameters).toEqual(
          expect.arrayContaining(['2026-10-26', '2026-11-08']),
        );
        expect(filteredParameters).not.toContain('2026-10-28');
        expect(filteredParameters).not.toContain('2026-11-03');

        await expect(readCohortParameters('TOTAL_CONTACTS')).resolves.toEqual(
          expect.arrayContaining(['2026-08-17', '2026-11-08']),
        );
        await expect(
          readCohortParameters('OVERALL_CONVERSION'),
        ).resolves.toEqual(
          expect.arrayContaining(['2026-05-11', '2026-11-08']),
        );
      });

      it('gives drop-off for the entry stage unless told otherwise', async () => {
        const { trends } = await readTrends({
          metric: 'DROP_OFF',
          answers: COHORT_ANSWERS,
        });

        expect(trends.stageKey).toBe('NEW');
        expect(trends.series[0].value).toBe(0.4);
        expect(trends.series[11].value).toBeNull();
      });

      it('builds cohort cells that hide the rate until mature', async () => {
        const { trends } = await readTrends({
          metric: 'TOTAL_CONTACTS',
          answers: COHORT_ANSWERS,
        });
        const [matureRow, immatureRow] = trends.cohorts;

        expect(trends.cohorts).toHaveLength(2);
        expect(matureRow.bucketStart).toBe('2026-08-17');
        expect(matureRow.size).toBe(10);
        expect(matureRow.overallRate).toBe(0.2);
        expect(matureRow.overallSoFarRate).toBe(0.3);
        expect(matureRow.cells[0]).toEqual({
          stageKey: 'NEW',
          entered: 10,
          eligible: 10,
          rate: 0.6,
          soFarRate: 0.7,
          isMature: true,
        });

        expect(immatureRow.overallRate).toBeNull();
        expect(immatureRow.overallSoFarRate).toBe(0.3);
        expect(immatureRow.cells[0]).toEqual({
          stageKey: 'NEW',
          entered: 10,
          eligible: 9,
          rate: null,
          soFarRate: 0.7,
          isMature: false,
        });
      });

      it('groups cohorts by the chosen period and leaves days out', async () => {
        const { statements } = await readTrends({
          metric: 'TOTAL_CONTACTS',
          filter: { ...DEFAULT_FILTER, period: 'MONTH' },
        });

        expect(
          statements.find(({ sql }) => /overall_total a/.test(sql))?.parameters,
        ).toContain('month');

        const { trends, statements: dailyStatements } = await readTrends({
          metric: 'TOTAL_CONTACTS',
          filter: { ...DEFAULT_FILTER, period: 'DAY' },
          answers: COHORT_ANSWERS,
        });

        expect(trends.cohorts).toEqual([]);
        expect(dailyStatements.some(({ sql }) => STEP.test(sql))).toBe(false);
      });
    });

    it('rounds median days, stays null without stays, and can read one stage', async () => {
      const { trends, statements } = await readTrends({
        metric: 'MEDIAN_DAYS',
        stageKey: 'CONTACTED',
        answers: [
          [
            MEDIAN_BUCKETS,
            [
              {
                bucket_start: '2026-11-02',
                median_days: 3.14,
                completed_stays: 8,
              },
            ],
          ],
        ],
      });

      expect(trends.stageKey).toBe('CONTACTED');
      expect(trends.series[11]).toMatchObject({
        value: 3.1,
        size: 8,
        previousSize: null,
      });
      expect(trends.series[0]).toMatchObject({ value: null, size: 0 });
      expect(
        statements.find(({ sql }) => MEDIAN_BUCKETS.test(sql))?.parameters,
      ).toContain('CONTACTED');
    });

    it('reads every stage for median days when none is chosen', async () => {
      const { trends, statements } = await readTrends({
        metric: 'MEDIAN_DAYS',
      });

      expect(trends.stageKey).toBeNull();
      expect(
        statements.find(({ sql }) => MEDIAN_BUCKETS.test(sql))?.sql,
      ).not.toContain('cs.stage_key =');
    });

    it('reports movement in stage order for the period holding today', async () => {
      const { trends, statements } = await readTrends({
        metric: 'TOTAL_CONTACTS',
        answers: [
          [
            MOVEMENT,
            [
              {
                stage_key: 'NEW',
                entered_in_period: 2,
                left_in_period: 5,
                count_now: 40,
              },
            ],
          ],
        ],
      });

      expect(trends.movement.from).toBe('2026-11-02');
      expect(trends.movement.to).toBe(LOCAL_TODAY);
      expect(trends.movement.rows[0]).toEqual({
        stageKey: 'NEW',
        label: 'New',
        enteredInPeriod: 2,
        leftInPeriod: 5,
        countNow: 40,
      });
      expect(trends.movement.rows[1]).toEqual({
        stageKey: 'CONTACTED',
        label: 'Contacted',
        enteredInPeriod: 0,
        leftInPeriod: 0,
        countNow: 0,
      });
      expect(
        statements.find(({ sql }) => MOVEMENT.test(sql))?.parameters,
      ).toEqual(expect.arrayContaining(['2026-11-02', LOCAL_TODAY]));
    });

    it('uses event dates for movement and keeps imported people in', async () => {
      const { trends, statements } = await readTrends({
        metric: 'TOTAL_CONTACTS',
        filter: {
          ...DEFAULT_FILTER,
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
        },
      });

      expect(trends.movement.from).toBe('2026-10-01');
      expect(trends.movement.to).toBe('2026-10-31');

      const movementSql =
        statements.find(({ sql }) => MOVEMENT.test(sql))?.sql ?? '';

      expect(movementSql).toContain('t.happened_at AT TIME ZONE');
      expect(movementSql).not.toContain('p.created_at >= $2');
    });
  });

  describe('series bundle', () => {
    const buildSourceRow = (categoryKey: string, people: number) => ({
      parent_key: null,
      category_key: categoryKey,
      people,
      active_people: 0,
    });

    // The two largest rank last: one is not a listed option, the other has no source.
    const SOURCE_ROWS = [
      buildSourceRow('NONE', 90),
      buildSourceRow('OLD_VALUE', 80),
      buildSourceRow('LINKEDIN', 40),
      buildSourceRow('SOURCE_A', 30),
      buildSourceRow('SOURCE_B', 20),
      buildSourceRow('SOURCE_C', 10),
    ];

    const STATE_WITH_SOURCES = buildState({
      applicantSource: {
        status: 'OK',
        options: [
          { value: 'LINKEDIN', label: 'LinkedIn' },
          { value: 'SOURCE_A', label: 'Source A' },
          { value: 'SOURCE_B', label: 'Source B' },
          { value: 'SOURCE_C', label: 'Source C' },
        ],
      },
    });

    const readSeries = async ({
      requests,
      filter = DEFAULT_FILTER,
      answers = [],
      state,
    }: {
      requests: AnalyticsSeriesRequest[];
      filter?: AnalyticsFilter;
      answers?: SqlAnswer[];
      state?: CrmAnalyticsCrmState;
    }) => {
      const context = setup({ answers, state });
      const bundle = await context.metricsService.getSeries({
        workspaceId: WORKSPACE_ID,
        filter,
        requests,
      });

      if (bundle === null) {
        throw new Error('Expected a series bundle');
      }

      return { ...context, bundle };
    };

    it('gives a null payload and reads nothing when switched off', async () => {
      const { metricsService, runPageTransaction } = setup({
        isDisabled: true,
      });

      await expect(
        metricsService.getSeries({
          workspaceId: WORKSPACE_ID,
          filter: DEFAULT_FILTER,
          requests: [
            { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'NONE' },
          ],
        }),
      ).resolves.toBeNull();
      expect(runPageTransaction).not.toHaveBeenCalled();
    });

    it('runs every series in one transaction, without cohorts or movement', async () => {
      const { bundle, runPageTransaction, statements } = await readSeries({
        filter: { ...DEFAULT_FILTER, period: 'MONTH' },
        requests: [
          { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'TRACK' },
          { metric: 'MEDIAN_DAYS', stageKey: null, groupBy: 'NONE' },
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'NONE' },
        ],
      });

      expect(runPageTransaction).toHaveBeenCalledTimes(1);
      expect(bundle.period).toBe('MONTH');
      expect(bundle.minimumSample).toBe(CRM_ANALYTICS_CONFIG.minimumSample);
      expect(bundle.series).toHaveLength(7);
      expect(bundle).not.toHaveProperty('cohorts');
      expect(bundle).not.toHaveProperty('movement');
      expect(statements.some(({ sql }) => MOVEMENT.test(sql))).toBe(false);
      // The context read, then one statement for each series.
      expect(statements).toHaveLength(8);
    });

    it('leaves a plain series ungrouped and resolves its stage as trends does', async () => {
      const { bundle } = await readSeries({
        requests: [
          { metric: 'STAGE_COUNT', stageKey: null, groupBy: 'NONE' },
          { metric: 'STAGE_COUNT', stageKey: 'CONTACTED', groupBy: 'NONE' },
          { metric: 'TOTAL_CONTACTS', stageKey: 'CONTACTED', groupBy: 'NONE' },
        ],
      });

      expect(
        bundle.series.map(({ stageKey, groupKey, groupLabel }) => ({
          stageKey,
          groupKey,
          groupLabel,
        })),
      ).toEqual([
        { stageKey: 'NEW', groupKey: null, groupLabel: null },
        { stageKey: 'CONTACTED', groupKey: null, groupLabel: null },
        { stageKey: null, groupKey: null, groupLabel: null },
      ]);
    });

    it('gives the same points as the trends query', async () => {
      const answers: SqlAnswer[] = [
        [
          SUBMISSION_BUCKETS,
          [{ bucket_start: '2026-11-02', bucket_value: 3 }],
        ],
      ];
      const { metricsService } = setup({ answers });
      const trends = await metricsService.getTrends({
        workspaceId: WORKSPACE_ID,
        filter: DEFAULT_FILTER,
        metric: 'NEW_APPLICATIONS',
        stageKey: null,
      });
      const { bundle } = await readSeries({
        answers,
        requests: [
          { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'NONE' },
        ],
      });

      expect(bundle.series[0]?.points).toEqual(trends?.series);
      expect(bundle.series[0]?.points.length).toBeGreaterThan(0);
    });

    it('gives one series per track, each filtered to that track', async () => {
      const { bundle, statements } = await readSeries({
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'TRACK' },
        ],
      });

      expect(bundle.series.map(({ groupKey }) => groupKey)).toEqual(
        CRM_ANALYTICS_CONFIG.tracks.map(({ trackKey }) => trackKey),
      );
      expect(bundle.series.map(({ groupLabel }) => groupLabel)).toEqual(
        CRM_ANALYTICS_CONFIG.tracks.map(({ label }) => label),
      );

      const snapshotReads = statements.filter(({ sql }) =>
        SNAPSHOT_BUCKETS.test(sql),
      );

      CRM_ANALYTICS_CONFIG.tracks.forEach(({ trackKey }, index) => {
        expect(snapshotReads[index]?.parameters).toEqual(
          expect.arrayContaining(['track', trackKey]),
        );
      });
    });

    it('leaves one track line when the page is filtered to a track or program', async () => {
      const { bundle: trackBundle } = await readSeries({
        filter: { ...DEFAULT_FILTER, trackKey: 'BUSINESS' },
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'TRACK' },
        ],
      });
      const { bundle: programBundle, statements } = await readSeries({
        filter: { ...DEFAULT_FILTER, programKey: 'FINANCE_INTERN' },
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'TRACK' },
        ],
      });

      expect(trackBundle.series.map(({ groupKey }) => groupKey)).toEqual([
        'BUSINESS',
      ]);
      expect(programBundle.series.map(({ groupKey }) => groupKey)).toEqual([
        'BUSINESS',
      ]);
      expect(programBundle.series[0]?.unavailableReason).toBeNull();
      expect(
        statements.find(({ sql }) => SNAPSHOT_BUCKETS.test(sql))?.parameters,
      ).toEqual(expect.arrayContaining(['position', 'FINANCE_INTERN']));
    });

    it('gives the top 5 sources, real values first, reading them once', async () => {
      const { bundle, statements } = await readSeries({
        state: STATE_WITH_SOURCES,
        answers: [[CATEGORY_PEOPLE, SOURCE_ROWS]],
        requests: [
          { metric: 'NEW_APPLICATIONS', stageKey: null, groupBy: 'SOURCE' },
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'SOURCE' },
        ],
      });

      const expectedKeys = [
        'LINKEDIN',
        'SOURCE_A',
        'SOURCE_B',
        'SOURCE_C',
        'OLD_VALUE',
      ];

      expect(bundle.series.map(({ groupKey }) => groupKey)).toEqual([
        ...expectedKeys,
        ...expectedKeys,
      ]);
      expect(bundle.series[0]?.groupLabel).toBe('LinkedIn');
      expect(bundle.series[1]?.groupLabel).toBe('Source A');
      expect(bundle.series[4]?.groupLabel).toBe('OLD_VALUE');
      expect(
        statements.filter(({ sql }) => CATEGORY_PEOPLE.test(sql)),
      ).toHaveLength(1);

      const submissionReads = statements.filter(({ sql }) =>
        SUBMISSION_BUCKETS.test(sql),
      );

      expectedKeys.forEach((sourceKey, index) => {
        expect(submissionReads[index]?.parameters).toContain(sourceKey);
      });
    });

    it('labels a no-source series and binds source values as parameters', async () => {
      const hostileValue = `x'; DROP TABLE person; --`;
      const { bundle, statements } = await readSeries({
        answers: [
          [
            CATEGORY_PEOPLE,
            [
              buildSourceRow('NONE', 9),
              buildSourceRow(hostileValue, 1),
            ],
          ],
        ],
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'SOURCE' },
        ],
      });

      expect(bundle.series.map(({ groupLabel }) => groupLabel)).toEqual([
        hostileValue,
        'No source',
      ]);
      statements.forEach(({ sql }) => expect(sql).not.toContain('DROP TABLE'));
      expect(
        statements.some(({ parameters }) => parameters.includes(hostileValue)),
      ).toBe(true);
    });

    it('reads top sources only when a request groups by source', async () => {
      const { statements } = await readSeries({
        answers: [[CATEGORY_PEOPLE, SOURCE_ROWS]],
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'NONE' },
        ],
      });

      expect(statements.some(({ sql }) => CATEGORY_PEOPLE.test(sql))).toBe(
        false,
      );
    });

    it('gives one series per main and exit stage, leaving other stages out', async () => {
      const { bundle } = await readSeries({
        requests: [{ metric: 'STAGE_COUNT', stageKey: null, groupBy: 'STAGE' }],
      });
      const expectedStages = CRM_ANALYTICS_CONFIG.stages.filter(
        ({ kind }) => kind !== 'OTHER',
      );

      expect(bundle.series.map(({ groupKey }) => groupKey)).toEqual(
        expectedStages.map(({ stageKey }) => stageKey),
      );
      expect(bundle.series.map(({ stageKey }) => stageKey)).toEqual(
        expectedStages.map(({ stageKey }) => stageKey),
      );
      expect(bundle.series.map(({ groupLabel }) => groupLabel)).toEqual(
        expectedStages.map(({ label }) => label),
      );
      expect(bundle.series.map(({ groupKey }) => groupKey)).not.toContain(
        'INTERESTED',
      );
    });

    it('carries the reason a series cannot be drawn, with no points and no read', async () => {
      const { bundle, statements } = await readSeries({
        filter: { ...DEFAULT_FILTER, period: 'DAY' },
        requests: [
          { metric: 'OVERALL_CONVERSION', stageKey: null, groupBy: 'TRACK' },
        ],
      });

      expect(bundle.series).toHaveLength(CRM_ANALYTICS_CONFIG.tracks.length);
      bundle.series.forEach(({ unavailableReason, points }) => {
        expect(unavailableReason).toBe('DAILY_RATE');
        expect(points).toEqual([]);
      });
      expect(statements).toHaveLength(1);
    });

    it('marks a snapshot metric unavailable when the group and filter cannot combine', async () => {
      const { bundle } = await readSeries({
        filter: { ...DEFAULT_FILTER, sourceKey: 'LINKEDIN' },
        requests: [
          { metric: 'TOTAL_CONTACTS', stageKey: null, groupBy: 'TRACK' },
        ],
      });

      bundle.series.forEach(({ unavailableReason }) =>
        expect(unavailableReason).toBe('SNAPSHOT_FILTER_COMBINATION'),
      );
    });

    it('returns no series for no requests', async () => {
      const { bundle } = await readSeries({ requests: [] });

      expect(bundle.series).toEqual([]);
    });
  });

  describe('every statement', () => {
    const FILTERS: AnalyticsFilter[] = [
      DEFAULT_FILTER,
      { ...DEFAULT_FILTER, dateFrom: '2026-10-01', dateTo: '2026-10-31' },
      { ...DEFAULT_FILTER, dateFrom: '2026-10-01' },
      { ...DEFAULT_FILTER, dateTo: '2026-10-31' },
      { ...DEFAULT_FILTER, status: 'ACTIVE' },
      { ...DEFAULT_FILTER, status: 'SUCCESS' },
      { ...DEFAULT_FILTER, status: 'EXITED' },
      { ...DEFAULT_FILTER, status: 'UNMAPPED' },
      { ...DEFAULT_FILTER, status: 'NO_STAGE' },
      { ...DEFAULT_FILTER, trackKey: 'NONE', programKey: 'NONE', sourceKey: 'NONE' },
      { ...DEFAULT_FILTER, trackKey: 'BUSINESS', programKey: 'FINANCE_INTERN' },
      { ...DEFAULT_FILTER, sourceKey: 'LINKEDIN', period: 'MONTH' },
      {
        ...DEFAULT_FILTER,
        trackKey: 'UNMAPPED',
        sourceKey: 'LINKEDIN',
        status: 'ACTIVE',
        period: 'DAY',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
      },
    ];

    const METRICS = [
      'NEW_APPLICATIONS',
      'TOTAL_CONTACTS',
      'ACTIVE_PEOPLE',
      'STAGE_COUNT',
      'OVERALL_CONVERSION',
      'DROP_OFF',
      'MEDIAN_DAYS',
    ] as const;

    const collectStatements = async () => {
      const { metricsService, statements } = setup({
        answers: [
          [
            STUCK_ROWS,
            [
              {
                person_id: 'person-1',
                current_key: 'NEW',
                stage_entered_at: NOW,
                days_in_stage: 20,
                days_over_limit: 6,
                is_lower_bound: false,
                total_count: 1,
              },
            ],
          ],
          [
            CATEGORY_PEOPLE,
            [{ category_key: 'LINKEDIN', people: 3, active_people: 1 }],
          ],
        ],
      });

      for (const filter of FILTERS) {
        await metricsService.getOverview({
          workspaceId: WORKSPACE_ID,
          filter,
        });
        await metricsService.getFunnel({ workspaceId: WORKSPACE_ID, filter });
        await metricsService.getCategories({
          workspaceId: WORKSPACE_ID,
          filter,
          groupBy: 'TRACK_PROGRAM',
        });
        await metricsService.getCategories({
          workspaceId: WORKSPACE_ID,
          filter,
          groupBy: 'SOURCE',
        });

        for (const metric of METRICS) {
          await metricsService.getTrends({
            workspaceId: WORKSPACE_ID,
            filter,
            metric,
            stageKey: metric === 'MEDIAN_DAYS' ? 'CONTACTED' : null,
          });
        }

        await metricsService.getSeries({
          workspaceId: WORKSPACE_ID,
          filter,
          requests: METRICS.flatMap((metric) => [
            { metric, stageKey: null, groupBy: 'TRACK' as const },
            { metric, stageKey: null, groupBy: 'SOURCE' as const },
          ]),
        });
        await metricsService.getSeries({
          workspaceId: WORKSPACE_ID,
          filter,
          requests: [
            { metric: 'STAGE_COUNT', stageKey: null, groupBy: 'STAGE' },
            { metric: 'DROP_OFF', stageKey: null, groupBy: 'STAGE' },
            { metric: 'MEDIAN_DAYS', stageKey: null, groupBy: 'STAGE' },
          ],
        });
      }

      return statements;
    };

    it('numbers its parameters without a gap and has no stray comma', async () => {
      const statements = await collectStatements();

      expect(statements.length).toBeGreaterThan(100);
      statements.forEach(expectStatementShape);
    });

    it('only reads', async () => {
      const statements = await collectStatements();

      statements.forEach(({ sql }) =>
        expect(sql).not.toMatch(
          /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/,
        ),
      );
    });

    it('ignores no-op rows wherever it reads transitions', async () => {
      const statements = await collectStatements();
      const transitionReads = statements.filter(({ sql }) =>
        sql.includes('analytics.stage_transition'),
      );

      expect(transitionReads.length).toBeGreaterThan(0);
      transitionReads.forEach(({ sql }) => {
        expect(sql.match(/analytics\.stage_transition/g)).toHaveLength(1);
        expect(sql).toContain('t.from_stage IS DISTINCT FROM t.to_stage');
      });
    });

    it('passes filter values as parameters, never in the text', async () => {
      const hostileValue = `x'; DROP TABLE person; --`;
      const { metricsService, statements } = setup();

      const filter = {
        ...DEFAULT_FILTER,
        trackKey: hostileValue,
        programKey: hostileValue,
        sourceKey: hostileValue,
      };

      await metricsService.getOverview({ workspaceId: WORKSPACE_ID, filter });
      await metricsService.getCategories({
        workspaceId: WORKSPACE_ID,
        filter,
        groupBy: 'TRACK_PROGRAM',
      });

      expect(statements.length).toBeGreaterThan(1);
      statements.forEach(({ sql }) => expect(sql).not.toContain('DROP TABLE'));
      expect(
        statements.some(({ parameters }) =>
          parameters.includes(hostileValue),
        ),
      ).toBe(true);
    });

    it('binds the workspace and tracking start as $1 and $2', async () => {
      const statements = await collectStatements();

      statements
        .filter(({ sql }) => sql.includes('crm_person AS ('))
        .forEach(({ parameters }) => {
          expect(parameters[0]).toBe(WORKSPACE_ID);
          expect(parameters[1]).toBe(TRACKING_START);
        });
    });
  });
});

describe('CrmAnalyticsReportService', () => {
  const REPORT_ANSWERS: SqlAnswer[] = [
    [NEW_APPLICATION_TOTALS, [{ current_count: 40, previous_count: 30 }]],
    [
      MOVEMENT,
      [
        {
          stage_key: 'NEW',
          entered_in_period: 40,
          left_in_period: 5,
          count_now: 70,
        },
      ],
    ],
    [FUNNEL_PLAIN, [HAND_SAMPLE_FUNNEL_ROW]],
    [
      /date_trunc[\s\S]*overall_total a/,
      [{ ...HAND_SAMPLE_FUNNEL_ROW, group_key: '2026-08-01' }],
    ],
    [CLOCK_TOTALS, [{ current_key: 'NEW', inactive_count: 1, stuck_count: 3 }]],
  ];

  const INSERT_REPORT = /INSERT INTO analytics\.report/;
  const EXISTING_REPORTS = /AS is_provisional\s+FROM analytics\.report/;

  const setupBuild = (answers: SqlAnswer[] = [], trackingStart?: string) => {
    const context = setup({
      answers: [
        ...answers,
        [INSERT_REPORT, [{ period_start: 'inserted' }]],
        ...REPORT_ANSWERS,
      ],
      trackingStart,
    });

    return {
      ...context,
      insertedReports: () =>
        context.statements
          .filter(({ sql }) => INSERT_REPORT.test(sql))
          .map(({ parameters }) => ({
            parameters,
            report: JSON.parse(String(parameters[5])) as AnalyticsReport,
          })),
    };
  };

  it('builds oldest first, capped at 8, and returns how many were stored', async () => {
    const { reportService, run, insertedReports } = setupBuild();

    await expect(
      reportService.buildMissingReports({
        workspaceId: WORKSPACE_ID,
        state: buildState(),
        run,
      }),
    ).resolves.toBe(8);

    expect(
      insertedReports().map(({ parameters }) => [parameters[1], parameters[2]]),
    ).toEqual([
      ['WEEK', '2026-08-03'],
      ['WEEK', '2026-08-10'],
      ['WEEK', '2026-08-17'],
      ['WEEK', '2026-08-24'],
      ['MONTH', '2026-08-01'],
      ['WEEK', '2026-08-31'],
      ['WEEK', '2026-09-07'],
      ['WEEK', '2026-09-14'],
    ]);
  });

  it('skips stored periods and does not count a lost insert', async () => {
    const { reportService, run, statements } = setupBuild([
      [
        EXISTING_REPORTS,
        [
          { period_type: 'WEEK', period_start: '2026-08-03' },
          { period_type: 'MONTH', period_start: '2026-08-01' },
        ],
      ],
      [INSERT_REPORT, []],
    ]);

    await expect(
      reportService.buildMissingReports({
        workspaceId: WORKSPACE_ID,
        state: buildState(),
        run,
      }),
    ).resolves.toBe(0);

    const inserted = statements.filter(({ sql }) => INSERT_REPORT.test(sql));

    expect(inserted).toHaveLength(8);
    expect(inserted[0].parameters[2]).toBe('2026-08-10');
  });

  describe('reports built on provisional definitions', () => {
    const STORED_REPORTS: SqlAnswer = [
      EXISTING_REPORTS,
      [
        {
          period_type: 'WEEK',
          period_start: '2026-08-03',
          is_provisional: true,
        },
        {
          period_type: 'WEEK',
          period_start: '2026-08-10',
          is_provisional: false,
        },
        {
          period_type: 'WEEK',
          period_start: '2026-08-17',
          is_provisional: null,
        },
      ],
    ];

    const buildWithProvisionalFlag = async (isProvisional: boolean) => {
      const replacedFlag = jest.replaceProperty(
        CRM_ANALYTICS_CONFIG,
        'isProvisional',
        isProvisional,
      );

      try {
        const { reportService, run, insertedReports } = setupBuild([
          STORED_REPORTS,
        ]);
        const builtCount = await reportService.buildMissingReports({
          workspaceId: WORKSPACE_ID,
          state: buildState(),
          run,
        });

        return { builtCount, inserted: insertedReports() };
      } finally {
        replacedFlag.restore();
      }
    };

    const listBuiltWeeks = (inserted: { parameters: unknown[] }[]): unknown[] =>
      inserted
        .filter(({ parameters }) => parameters[1] === 'WEEK')
        .map(({ parameters }) => parameters[2]);

    it('leaves stored reports frozen while the definitions are provisional', async () => {
      const { inserted } = await buildWithProvisionalFlag(true);

      expect(inserted).toHaveLength(8);
      expect(listBuiltWeeks(inserted)).not.toContain('2026-08-03');
      expect(inserted[0].report).toMatchObject({
        isProvisional: true,
        payloadVersion: 1,
      });
    });

    it('rebuilds only provisional reports once confirmed, oldest first and within the cap', async () => {
      const { builtCount, inserted } = await buildWithProvisionalFlag(false);

      expect(builtCount).toBe(8);
      expect(inserted).toHaveLength(8);
      expect(listBuiltWeeks(inserted)[0]).toBe('2026-08-03');
      expect(listBuiltWeeks(inserted)).not.toContain('2026-08-10');
      expect(listBuiltWeeks(inserted)).not.toContain('2026-08-17');
      expect(inserted[0].report).toMatchObject({
        isProvisional: false,
        payloadVersion: 1,
      });
    });

    it('overwrites a stored row only when a confirmed report replaces a provisional one', async () => {
      const { reportService, run, statements } = setupBuild();

      await reportService.buildMissingReports({
        workspaceId: WORKSPACE_ID,
        state: buildState(),
        run,
      });

      const insertSql =
        statements.find(({ sql }) => INSERT_REPORT.test(sql))?.sql ?? '';

      expect(insertSql).toContain(
        'ON CONFLICT (workspace_id, period_type, period_start) DO UPDATE',
      );
      expect(insertSql).toContain(
        `WHERE stored_report.payload->>'isProvisional' = 'true' AND EXCLUDED.payload->>'isProvisional' = 'false'`,
      );
    });
  });

  it('stores counts only, on the same shape as the page, with cohorts on months', async () => {
    const { reportService, run, insertedReports } = setupBuild();

    await reportService.buildMissingReports({
      workspaceId: WORKSPACE_ID,
      state: buildState(),
      run,
    });

    const reports = insertedReports();
    const week = reports[0].report;
    const month = reports[4].report;

    expect(week).toMatchObject({
      periodType: 'WEEK',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-10',
      generatedAt: NOW,
      asOf: NOW,
      trackingStartedAt: TRACKING_START,
      reportingTimeZone: 'UTC',
      minimumSample: 30,
      newApplications: 40,
      newApplicationsPrevious: null,
    });
    expect(reports[1].report.newApplicationsPrevious).toBe(30);
    expect(week.cohorts).toEqual([]);
    expect(week.funnel.rows[0].stepRate).toBe(0.4);
    expect(week.categories.groupBy).toBe('TRACK_PROGRAM');
    expect(week.stuckByStage[0]).toEqual({
      stageKey: 'NEW',
      label: 'New',
      count: 3,
    });
    expect(JSON.stringify(week)).not.toContain('displayName');

    expect(month.periodType).toBe('MONTH');
    expect(month.cohorts).toHaveLength(1);
    expect(month.cohorts[0].bucketStart).toBe('2026-08-01');
  });

  it('compares counts against the previous period, flagging significant ones', async () => {
    const { reportService, run, insertedReports } = setupBuild();

    await reportService.buildMissingReports({
      workspaceId: WORKSPACE_ID,
      state: buildState(),
      run,
    });

    // The first week's previous period starts before tracking.
    const { comparisons } = insertedReports()[1].report;

    expect(comparisons[0]).toEqual({
      metricKey: 'NEW_APPLICATIONS',
      label: 'New applications',
      current: 40,
      previous: 30,
      isSignificant: true,
    });
    expect(comparisons[1]).toEqual({
      metricKey: 'ENTERED_NEW',
      label: 'Entered New',
      current: 40,
      previous: 40,
      isSignificant: false,
    });
  });

  it.each<[string, string, AnalyticsReport['periodType'], string, string]>([
    [
      'a Monday',
      '2026-08-03T00:00:00.000Z',
      'WEEK',
      '2026-08-03',
      '2026-08-10',
    ],
    [
      'the first of a month',
      '2026-08-01T00:00:00.000Z',
      'MONTH',
      '2026-08-01',
      '2026-08-10',
    ],
    [
      'a Wednesday, leaving the previous period only partly tracked',
      '2026-08-05T00:00:00.000Z',
      'WEEK',
      '2026-08-10',
      '2026-08-17',
    ],
  ])(
    'has no previous period to compare with when tracking starts on %s',
    async (
      _description,
      trackingStart,
      periodType,
      periodStart,
      comparableWeekStart,
    ) => {
      const { reportService, run, insertedReports } = setupBuild(
        [],
        trackingStart,
      );

      await reportService.buildMissingReports({
        workspaceId: WORKSPACE_ID,
        state: buildState(),
        run,
      });

      const reportOf = (type: AnalyticsReport['periodType'], start: string) =>
        insertedReports().find(
          ({ report }) =>
            report.periodType === type && report.periodStart === start,
        )?.report;

      const firstReport = reportOf(periodType, periodStart);

      expect(firstReport?.newApplications).toBe(40);
      expect(firstReport?.newApplicationsPrevious).toBeNull();
      expect(firstReport?.comparisons[0]).toEqual({
        metricKey: 'NEW_APPLICATIONS',
        label: 'New applications',
        current: 40,
        previous: null,
        isSignificant: false,
      });
      expect(firstReport?.comparisons.length).toBeGreaterThan(1);
      expect(
        firstReport?.comparisons.every(
          ({ previous, isSignificant }) => previous === null && !isSignificant,
        ),
      ).toBe(true);

      const comparableReport = reportOf('WEEK', comparableWeekStart);

      expect(comparableReport?.newApplicationsPrevious).toBe(30);
      expect(comparableReport?.comparisons[1]).toMatchObject({
        metricKey: 'ENTERED_NEW',
        previous: 40,
      });
    },
  );

  it('uses the period for events and everything up to its end for rates', async () => {
    const { reportService, run, statements } = setupBuild();

    await reportService.buildMissingReports({
      workspaceId: WORKSPACE_ID,
      state: buildState(),
      run,
    });

    const firstReportStatements = statements.slice(
      0,
      statements.findIndex(({ sql }) => INSERT_REPORT.test(sql)),
    );

    expect(
      firstReportStatements.find(({ sql }) => NEW_APPLICATION_TOTALS.test(sql))
        ?.parameters,
    ).toEqual(
      expect.arrayContaining([
        '2026-08-03',
        '2026-08-09',
        '2026-07-27',
        '2026-08-02',
      ]),
    );
    expect(
      firstReportStatements.find(({ sql }) => FUNNEL_PLAIN.test(sql))
        ?.parameters,
    ).toContain('2026-08-09');
    expect(
      firstReportStatements.find(({ sql }) => FUNNEL_PLAIN.test(sql))
        ?.parameters,
    ).not.toContain('2026-08-03');
    expect(
      firstReportStatements.find(({ sql }) => CATEGORY_PEOPLE.test(sql))?.sql,
    ).not.toContain('p.created_at >= $2');
  });

  describe('frozen trend series', () => {
    const FIRST_WEEK_END = '2026-08-10';
    const LAST_DAY_OF_FIRST_WEEK = '2026-08-09';
    const RATE_BUCKETS =
      /::date::text AS group_key FROM cohort c[\s\S]*overall_total a/;

    const buildReports = async ({
      answers = [],
      now,
      state,
      failingStatement,
      failureMessage,
    }: {
      answers?: SqlAnswer[];
      now?: string;
      state?: CrmAnalyticsCrmState;
      failingStatement?: RegExp;
      failureMessage?: string;
    } = {}) => {
      const context = setup({
        answers: [
          ...answers,
          [INSERT_REPORT, [{ period_start: 'inserted' }]],
          ...REPORT_ANSWERS,
        ],
        now,
        state,
        failingStatement,
        failureMessage,
      });

      await context.reportService.buildMissingReports({
        workspaceId: WORKSPACE_ID,
        state: state ?? buildState(),
        run: context.run,
      });

      const reports = context.statements
        .filter(({ sql }) => INSERT_REPORT.test(sql))
        .map(
          ({ parameters }) =>
            JSON.parse(String(parameters[5])) as AnalyticsReport,
        );

      return {
        reports,
        statements: context.statements,
        firstWeek: reports[0],
        firstMonth: reports.find(({ periodType }) => periodType === 'MONTH'),
      };
    };

    const readSeries = (
      report: AnalyticsReport | undefined,
      metric: AnalyticsTrendMetric,
    ) => report?.trendSeries?.find((series) => series.metric === metric);

    it('stores the five series at the period type of the report', async () => {
      const { firstWeek, firstMonth } = await buildReports();

      expect(firstWeek.trendSeries?.map(({ metric }) => metric)).toEqual([
        'NEW_APPLICATIONS',
        'TOTAL_CONTACTS',
        'OVERALL_CONVERSION',
        'DROP_OFF',
        'MEDIAN_DAYS',
      ]);
      expect(readSeries(firstWeek, 'NEW_APPLICATIONS')?.points).toHaveLength(12);
      expect(readSeries(firstWeek, 'OVERALL_CONVERSION')?.points).toHaveLength(
        26,
      );
      expect(readSeries(firstWeek, 'DROP_OFF')?.stageKey).toBe('NEW');
      expect(readSeries(firstWeek, 'MEDIAN_DAYS')?.stageKey).toBeNull();
      expect(readSeries(firstMonth, 'DROP_OFF')?.points).toHaveLength(12);
    });

    it('ends every series with the period of the report, as a finished bucket', async () => {
      const { firstWeek, firstMonth } = await buildReports();

      [firstWeek, firstMonth].forEach((report) =>
        report?.trendSeries?.forEach(({ points }) => {
          expect(points[points.length - 1].bucketStart).toBe(
            report.periodStart,
          );
          expect(points.every(({ isPartial }) => !isPartial)).toBe(true);
        }),
      );
    });

    it('reads no data past the last day of the period', async () => {
      const { statements } = await buildReports();
      const firstInsert = statements.findIndex(({ sql }) =>
        INSERT_REPORT.test(sql),
      );
      const firstReportStatements = statements.slice(0, firstInsert);

      [SUBMISSION_BUCKETS, SNAPSHOT_BUCKETS, MEDIAN_BUCKETS].forEach(
        (pattern) => {
          const { parameters } = firstReportStatements.find(({ sql }) =>
            pattern.test(sql),
          ) as RecordedStatement;

          expect(parameters).toContain(LAST_DAY_OF_FIRST_WEEK);
          expect(parameters).not.toContain(FIRST_WEEK_END);
        },
      );

      const rateStatements = firstReportStatements.filter(({ sql }) =>
        RATE_BUCKETS.test(sql),
      );

      expect(rateStatements).toHaveLength(2);
      rateStatements.forEach(({ parameters }) =>
        expect(parameters).toContain(LAST_DAY_OF_FIRST_WEEK),
      );
    });

    it('closes rate windows at the end of the period, not at build time', async () => {
      const { statements } = await buildReports();
      const rateStatement = statements.find(({ sql }) =>
        RATE_BUCKETS.test(sql),
      ) as RecordedStatement;

      expect(rateStatement.parameters).toContain(`${FIRST_WEEK_END}T00:00:00Z`);
      expect(rateStatement.sql).not.toContain('now()');
      expect(rateStatement.sql).toMatch(
        /WHERE ps\.entered_at < \$\d+::timestamptz/,
      );
      expect(rateStatement.sql).toMatch(
        /AND e\.entered_at < \$\d+::timestamptz/,
      );
    });

    it('leaves the page reading windows against now', async () => {
      const { metricsService, statements } = setup();

      await metricsService.getTrends({
        workspaceId: WORKSPACE_ID,
        filter: DEFAULT_FILTER,
        metric: 'OVERALL_CONVERSION',
        stageKey: null,
      });

      const rateStatement = statements.find(({ sql }) =>
        RATE_BUCKETS.test(sql),
      ) as RecordedStatement;

      expect(rateStatement.sql).toContain('o.window_end <= now()');
      expect(rateStatement.sql).not.toContain('entered_at <');
    });

    it('holds the same series when built much later', async () => {
      const answers: SqlAnswer[] = [
        [SUBMISSION_BUCKETS, [{ bucket_start: '2026-08-03', bucket_value: 7 }]],
        [SNAPSHOT_BUCKETS, [{ bucket_start: '2026-08-03', bucket_value: 90 }]],
        [
          MEDIAN_BUCKETS,
          [
            {
              bucket_start: '2026-08-03',
              median_days: 2.5,
              completed_stays: 4,
            },
          ],
        ],
      ];
      const onTime = await buildReports({
        answers,
        now: '2026-08-11T02:30:00.000Z',
      });
      const backfill = await buildReports({ answers });

      expect(onTime.firstWeek.periodStart).toBe('2026-08-03');
      expect(backfill.firstWeek.periodStart).toBe('2026-08-03');
      expect(backfill.firstWeek.trendSeries).toEqual(
        onTime.firstWeek.trendSeries,
      );

      const lastPoint = (metric: AnalyticsTrendMetric) =>
        readSeries(backfill.firstWeek, metric)?.points.slice(-1)[0];

      expect(lastPoint('NEW_APPLICATIONS')?.value).toBe(7);
      expect(lastPoint('TOTAL_CONTACTS')?.value).toBe(90);
      expect(lastPoint('MEDIAN_DAYS')).toMatchObject({ value: 2.5, size: 4 });
    });

    it('stores unknown buckets as null, never 0', async () => {
      const { firstWeek } = await buildReports();

      (
        ['TOTAL_CONTACTS', 'OVERALL_CONVERSION', 'DROP_OFF', 'MEDIAN_DAYS'] as const
      ).forEach((metric) =>
        readSeries(firstWeek, metric)?.points.forEach(({ value }) =>
          expect(value).toBeNull(),
        ),
      );
      expect(
        readSeries(firstWeek, 'NEW_APPLICATIONS')?.points[0].value,
      ).toBeNull();
    });

    it('stores a series the CRM cannot provide with its reason', async () => {
      const { firstWeek } = await buildReports({
        state: buildState({ hasFormSubmissionObject: false }),
      });

      expect(readSeries(firstWeek, 'NEW_APPLICATIONS')).toMatchObject({
        unavailableReason: 'NO_SUBMISSION_OBJECT',
        points: [],
      });
      expect(firstWeek.trendSeries).toHaveLength(5);
    });

    it('keeps the report and the other series when one series fails', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      try {
        const { reports, firstWeek } = await buildReports({
          failingStatement: MEDIAN_BUCKETS,
          failureMessage: 'function not available',
        });

        expect(reports).toHaveLength(8);
        expect(firstWeek.trendSeries?.map(({ metric }) => metric)).toEqual([
          'NEW_APPLICATIONS',
          'TOTAL_CONTACTS',
          'OVERALL_CONVERSION',
          'DROP_OFF',
        ]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('WEEK 2026-08-03 left out MEDIAN_DAYS'),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('stores nothing and stops the run when a series times out', async () => {
      const { reportService, run, statements } = setup({
        answers: [
          [INSERT_REPORT, [{ period_start: 'inserted' }]],
          ...REPORT_ANSWERS,
        ],
        failingStatement: MEDIAN_BUCKETS,
      });

      await expect(
        reportService.buildMissingReports({
          workspaceId: WORKSPACE_ID,
          state: buildState(),
          run,
        }),
      ).rejects.toThrow('statement timeout');
      expect(statements.some(({ sql }) => INSERT_REPORT.test(sql))).toBe(false);
    });

    it('stops building reports past the time budget, leaving the rest for the next run', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const realNow = Date.now();
      let readCount = 0;
      const clock = jest.spyOn(Date, 'now').mockImplementation(() => {
        readCount += 1;

        // The run's start and the first period's check are on time, then the budget is gone.
        return readCount <= 2 ? realNow : realNow + 11 * 60 * 1000;
      });

      try {
        const { reports } = await buildReports();

        expect(reports).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('Reports stopped at the time budget'),
        );
      } finally {
        clock.mockRestore();
        warn.mockRestore();
      }
    });
  });

  describe('reading stored reports', () => {
    it('gives null when switched off, without opening a transaction', async () => {
      const { reportService, runPageTransaction } = setup({ isDisabled: true });

      await expect(reportService.listReports(WORKSPACE_ID)).resolves.toBeNull();
      await expect(
        reportService.getReport({
          workspaceId: WORKSPACE_ID,
          periodType: 'WEEK',
          periodStart: '2026-08-03',
        }),
      ).resolves.toBeNull();
      expect(runPageTransaction).not.toHaveBeenCalled();
    });

    it('checks for storage before reading', async () => {
      const { reportService, statements } = setup({ hasStorage: false });

      await expect(reportService.listReports(WORKSPACE_ID)).resolves.toEqual([]);
      await expect(
        reportService.getReport({
          workspaceId: WORKSPACE_ID,
          periodType: 'WEEK',
          periodStart: '2026-08-03',
        }),
      ).resolves.toBeNull();
      expect(statements.every(({ sql }) => sql.includes('to_regclass'))).toBe(
        true,
      );
    });

    it('lists without payloads, turning timestamps into ISO strings', async () => {
      const { reportService, statements } = setup({
        answers: [
          [
            /ORDER BY r\.period_start DESC/,
            [
              {
                period_type: 'MONTH',
                period_start: '2026-08-01',
                period_end: '2026-09-01',
                generated_at: new Date(NOW),
              },
            ],
          ],
        ],
      });

      await expect(reportService.listReports(WORKSPACE_ID)).resolves.toEqual([
        {
          periodType: 'MONTH',
          periodStart: '2026-08-01',
          periodEnd: '2026-09-01',
          generatedAt: NOW,
        },
      ]);
      expect(
        statements.find(({ sql }) => sql.includes('ORDER BY'))?.sql,
      ).not.toContain('payload');
    });

    it('returns a stored payload as stored, or null', async () => {
      const payload = { periodType: 'WEEK', frozen: true };
      const { reportService, statements } = setup({
        answers: [[/SELECT r\.payload/, [{ payload }]]],
      });

      await expect(
        reportService.getReport({
          workspaceId: WORKSPACE_ID,
          periodType: 'WEEK',
          periodStart: '2026-08-03',
        }),
      ).resolves.toEqual(payload);
      expect(
        statements.find(({ sql }) => sql.includes('r.payload'))?.parameters,
      ).toEqual([WORKSPACE_ID, 'WEEK', '2026-08-03']);

      const { reportService: emptyReportService } = setup();

      await expect(
        emptyReportService.getReport({
          workspaceId: WORKSPACE_ID,
          periodType: 'WEEK',
          periodStart: '2026-08-03',
        }),
      ).resolves.toBeNull();
    });
  });
});
