import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { type CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { type CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsMetaService } from 'src/modules/analytics/services/crm-analytics-meta.service';
import { type CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-07T12:00:00.000Z');

const minutesAgo = (minutes: number): Date =>
  new Date(NOW.getTime() - minutes * 60000);

const buildState = (
  overrides: Partial<CrmAnalyticsCrmState> = {},
): CrmAnalyticsCrmState => ({
  workspaceId: WORKSPACE_ID,
  stage: { status: 'OK', isAuditLogged: true, options: [] },
  positionsAppliedFor: {
    status: 'OK',
    options: [
      { value: 'FINANCE_INTERN', label: 'Finance intern' },
      { value: 'NEW_ROLE', label: 'New role' },
    ],
  },
  applicantSource: {
    status: 'WRONG_TYPE',
    options: [{ value: 'LINKEDIN', label: 'LinkedIn' }],
  },
  hasFormSubmissionObject: true,
  hasApplicationObject: false,
  ...overrides,
});

type LogRow = {
  job_name: 'sync' | 'daily';
  status: 'running' | 'ok' | 'failed' | 'skipped';
  started_at: Date;
  finished_at?: Date;
  restored_count?: number;
};

const setup = ({
  logRows = [],
  isDisabled = false,
  hasStorage = true,
  state = buildState(),
}: {
  logRows?: LogRow[];
  isDisabled?: boolean;
  hasStorage?: boolean;
  state?: CrmAnalyticsCrmState;
} = {}) => {
  const statements: string[] = [];

  // Answers from the log table by what each statement filters on, so the rule under
  // test decides which rows it gets.
  const run: CrmAnalyticsSqlRunner = async (sql) => {
    statements.push(sql);

    if (sql.includes('to_regclass')) {
      return [{ as_of: NOW, has_storage: hasStorage }];
    }

    const matchesSql = (row: LogRow) =>
      sql.includes(`l.job_name = '${row.job_name}'`) &&
      (!sql.includes(`l.status = 'ok'`) || row.status === 'ok');

    return logRows
      .filter(matchesSql)
      .sort(
        (first, second) =>
          second.started_at.getTime() - first.started_at.getTime(),
      );
  };

  const runPageTransaction = jest.fn(
    async (_workspaceId: string, work: (run: CrmAnalyticsSqlRunner) => unknown) =>
      work(run),
  );
  const facadeService = { getCrmState: jest.fn(async () => state) };
  const settingsService = {
    isDisabled: jest.fn(async () => isDisabled),
    getTrackingStart: jest.fn(async () => '2026-08-01T00:00:00.000Z'),
  };

  return {
    statements,
    runPageTransaction,
    facadeService,
    metaService: new CrmAnalyticsMetaService(
      { runPageTransaction } as unknown as CrmAnalyticsDatabaseService,
      facadeService as unknown as CrmAnalyticsFacadeService,
      settingsService as unknown as CrmAnalyticsSettingsService,
    ),
  };
};

const readMeta = (args: Parameters<typeof setup>[0]) =>
  setup(args).metaService.getMeta(WORKSPACE_ID);

describe('CrmAnalyticsMetaService', () => {
  describe('page state', () => {
    it('reads nothing but the switch when disabled', async () => {
      const { metaService, runPageTransaction, facadeService } = setup({
        isDisabled: true,
      });

      const meta = await metaService.getMeta(WORKSPACE_ID);

      expect(meta.state).toBe('DISABLED');
      expect(meta.sync).toEqual({
        lastSuccessfulSyncAt: null,
        lastReconciliationAt: null,
        lastAttemptAt: null,
        lastAttemptStatus: null,
        isStale: false,
        restoredInLastReconciliation: null,
      });
      expect(meta.stages).toHaveLength(CRM_ANALYTICS_CONFIG.stages.length);
      expect(runPageTransaction).not.toHaveBeenCalled();
      expect(facadeService.getCrmState).not.toHaveBeenCalled();
    });

    it.each(['MISSING', 'WRONG_TYPE'] as const)(
      'gives NO_STAGE_FIELD when the stage field is %s, storage or not',
      async (status) => {
        const state = buildState({
          stage: { status, isAuditLogged: false, options: [] },
        });

        expect((await readMeta({ state, hasStorage: false })).state).toBe(
          'NO_STAGE_FIELD',
        );
        expect((await readMeta({ state })).state).toBe('NO_STAGE_FIELD');
      },
    );

    it('gives NEVER_SYNCED before any job, reading no analytics table', async () => {
      const { metaService, statements } = setup({ hasStorage: false });

      const meta = await metaService.getMeta(WORKSPACE_ID);

      expect(meta.state).toBe('NEVER_SYNCED');
      expect(meta.sync.isStale).toBe(false);
      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain(`to_regclass('analytics.sync_log')`);
    });

    it('stays NEVER_SYNCED until a sync has succeeded', async () => {
      const meta = await readMeta({
        logRows: [
          { job_name: 'sync', status: 'failed', started_at: minutesAgo(5) },
          {
            job_name: 'daily',
            status: 'ok',
            started_at: minutesAgo(4),
            finished_at: minutesAgo(3),
          },
        ],
      });

      expect(meta.state).toBe('NEVER_SYNCED');
      expect(meta.sync.isStale).toBe(true);
      expect(meta.sync.lastAttemptStatus).toBe('FAILED');
    });

    it('is READY once a sync has succeeded', async () => {
      const meta = await readMeta({
        logRows: [
          {
            job_name: 'sync',
            status: 'ok',
            started_at: minutesAgo(11),
            finished_at: minutesAgo(10),
          },
        ],
      });

      expect(meta.state).toBe('READY');
      expect(meta.sync).toEqual({
        lastSuccessfulSyncAt: minutesAgo(10).toISOString(),
        lastReconciliationAt: null,
        lastAttemptAt: minutesAgo(11).toISOString(),
        lastAttemptStatus: 'OK',
        isStale: false,
        restoredInLastReconciliation: null,
      });
    });
  });

  describe('sync state', () => {
    it('goes stale past the limit, keeping the page ready', async () => {
      const buildRows = (finishedMinutesAgo: number): LogRow[] => [
        {
          job_name: 'sync',
          status: 'ok',
          started_at: minutesAgo(finishedMinutesAgo + 1),
          finished_at: minutesAgo(finishedMinutesAgo),
        },
      ];

      const atLimit = await readMeta({ logRows: buildRows(60) });
      const pastLimit = await readMeta({ logRows: buildRows(61) });

      expect(atLimit.sync.isStale).toBe(false);
      expect(pastLimit.sync.isStale).toBe(true);
      expect(pastLimit.state).toBe('READY');
    });

    it('does not let a daily success clear stale', async () => {
      const { sync } = await readMeta({
        logRows: [
          {
            job_name: 'sync',
            status: 'ok',
            started_at: minutesAgo(200),
            finished_at: minutesAgo(199),
          },
          {
            job_name: 'daily',
            status: 'ok',
            started_at: minutesAgo(2),
            finished_at: minutesAgo(1),
          },
        ],
      });

      expect(sync.isStale).toBe(true);
      expect(sync.lastSuccessfulSyncAt).toBe(minutesAgo(199).toISOString());
      expect(sync.lastAttemptAt).toBe(minutesAgo(200).toISOString());
    });

    it('does not read a failed sync as a success', async () => {
      const { sync } = await readMeta({
        logRows: [
          {
            job_name: 'sync',
            status: 'failed',
            started_at: minutesAgo(2),
            finished_at: minutesAgo(1),
          },
          {
            job_name: 'sync',
            status: 'ok',
            started_at: minutesAgo(16),
            finished_at: minutesAgo(15),
          },
        ],
      });

      expect(sync.lastSuccessfulSyncAt).toBe(minutesAgo(15).toISOString());
      expect(sync.lastAttemptAt).toBe(minutesAgo(2).toISOString());
      expect(sync.lastAttemptStatus).toBe('FAILED');
      expect(sync.isStale).toBe(false);
    });

    it('ignores a young running row in favour of the row before it', async () => {
      const { sync } = await readMeta({
        logRows: [
          { job_name: 'sync', status: 'running', started_at: minutesAgo(1) },
          {
            job_name: 'sync',
            status: 'ok',
            started_at: minutesAgo(16),
            finished_at: minutesAgo(15),
          },
        ],
      });

      expect(sync.lastAttemptAt).toBe(minutesAgo(16).toISOString());
      expect(sync.lastAttemptStatus).toBe('OK');
    });

    it('reads a running row past the limit as failed', async () => {
      const { sync } = await readMeta({
        logRows: [
          { job_name: 'sync', status: 'running', started_at: minutesAgo(30) },
          {
            job_name: 'sync',
            status: 'ok',
            started_at: minutesAgo(46),
            finished_at: minutesAgo(45),
          },
        ],
      });

      expect(sync.lastAttemptAt).toBe(minutesAgo(30).toISOString());
      expect(sync.lastAttemptStatus).toBe('FAILED');
    });

    it('reads the very first sync still running as no attempt yet', async () => {
      const meta = await readMeta({
        logRows: [
          { job_name: 'sync', status: 'running', started_at: minutesAgo(1) },
        ],
      });

      expect(meta.state).toBe('NEVER_SYNCED');
      expect(meta.sync.lastAttemptAt).toBeNull();
      expect(meta.sync.lastAttemptStatus).toBeNull();
      expect(meta.sync.isStale).toBe(false);
    });

    it('reports a skipped sync', async () => {
      const { sync } = await readMeta({
        logRows: [
          {
            job_name: 'sync',
            status: 'skipped',
            started_at: minutesAgo(5),
            finished_at: minutesAgo(5),
          },
        ],
      });

      expect(sync.lastAttemptStatus).toBe('SKIPPED');
    });

    it('gives a null status with no sync row, ignoring daily rows', async () => {
      const { sync } = await readMeta({
        logRows: [
          { job_name: 'daily', status: 'failed', started_at: minutesAgo(5) },
        ],
      });

      expect(sync.lastAttemptAt).toBeNull();
      expect(sync.lastAttemptStatus).toBeNull();
      expect(sync.isStale).toBe(false);
    });

    it('reads reconciliation from the latest successful daily row', async () => {
      const { sync } = await readMeta({
        logRows: [
          {
            job_name: 'daily',
            status: 'failed',
            started_at: minutesAgo(30),
            finished_at: minutesAgo(29),
            restored_count: 99,
          },
          {
            job_name: 'daily',
            status: 'ok',
            started_at: minutesAgo(1500),
            finished_at: minutesAgo(1499),
            restored_count: 4,
          },
        ],
      });

      expect(sync.lastReconciliationAt).toBe(minutesAgo(1499).toISOString());
      expect(sync.restoredInLastReconciliation).toBe(4);
    });
  });

  describe('definitions', () => {
    it('reports fields as the CRM state has them', async () => {
      const { fields } = await readMeta({});

      expect(fields).toEqual({
        stage: 'OK',
        isStageAuditLogged: true,
        positionsAppliedFor: 'OK',
        applicantSource: 'WRONG_TYPE',
        hasFormSubmissionObject: true,
        hasApplicationObject: false,
      });
    });

    it('gives stage definitions without raw values', async () => {
      const { stages } = await readMeta({});

      expect(stages[0]).toEqual({
        stageKey: 'NEW',
        label: 'New',
        kind: 'MAIN',
        rank: 0,
        limitDays: 14,
        windowDays: 14,
        isSuccess: false,
      });
      expect(stages.some((stage) => 'rawValues' in stage)).toBe(false);
    });

    it('lists tracks, programs and sources', async () => {
      const { tracks, programs, sources } = await readMeta({});

      expect(tracks).toHaveLength(5);
      expect(tracks[0]).toEqual({
        key: 'AI_SOFTWARE',
        label: 'Artificial Intelligence & Software Engineering',
      });
      expect(programs).toHaveLength(40);
      expect(
        programs.find((program) => program.key === 'FINANCE_INTERN'),
      ).toEqual({
        key: 'FINANCE_INTERN',
        label: 'Finance intern',
        trackKey: 'BUSINESS',
      });
      expect(programs.find((program) => program.key === 'NEW_ROLE')).toEqual({
        key: 'NEW_ROLE',
        label: 'New role',
        trackKey: 'UNMAPPED',
      });
      expect(sources).toEqual([{ key: 'LINKEDIN', label: 'LinkedIn' }]);
    });

    it('carries the shared base fields', async () => {
      const meta = await readMeta({});

      expect(meta).toMatchObject({
        asOf: NOW.toISOString(),
        trackingStartedAt: '2026-08-01T00:00:00.000Z',
        reportingTimeZone: 'UTC',
        minimumSample: 30,
        isProvisional: true,
        showSignedFigure: false,
      });
    });
  });
});
