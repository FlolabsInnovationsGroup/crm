import { Logger } from '@nestjs/common';

import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsWorkspaceDailyJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-daily.job';
import { CrmAnalyticsWorkspaceSyncJob } from 'src/modules/analytics/jobs/crm-analytics-workspace-sync.job';
import { type CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { type CrmAnalyticsReportService } from 'src/modules/analytics/services/crm-analytics-report.service';
import { type CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import { CrmAnalyticsSnapshotService } from 'src/modules/analytics/services/crm-analytics-snapshot.service';
import { CrmAnalyticsSyncService } from 'src/modules/analytics/services/crm-analytics-sync.service';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsFieldStatus,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const LOG_ROW_ID = '20202020-0000-4000-8000-000000000002';
const TRACKING_START = '2026-10-27T00:00:00.000Z';

const SQL_MARKERS = {
  openLog: 'INSERT INTO analytics.sync_log',
  closeLog: 'UPDATE analytics.sync_log',
  trimLog: 'DELETE FROM analytics.sync_log',
  dailyLogLookup: `job_name = 'daily'`,
  cursor: 'max(source_updated_at)',
  timelineRead:
    'ON CONFLICT (workspace_id, source_id, source_updated_at) DO NOTHING',
  reconcile: `'reconcile'`,
  snapshot: 'INSERT INTO analytics.daily_snapshot',
};

type RecordedQuery = { sql: string; parameters: unknown[] };

const expectEveryParameterSupplied = (queries: RecordedQuery[]): void => {
  for (const { sql, parameters } of queries) {
    const parameterNumbers = [...sql.matchAll(/\$(\d+)/g)].map((match) =>
      Number(match[1]),
    );

    expect(Math.max(0, ...parameterNumbers)).toBe(parameters.length);
  }
};

type SetupOptions = {
  stageStatus?: CrmAnalyticsFieldStatus;
  isDisabled?: boolean;
  latestSourceUpdatedAt?: Date | null;
  hasDailyLogRow?: boolean;
  snapshotRow?: Record<string, number>;
  failingSqlMarkers?: string[];
  trackingStartError?: Error;
  reportsError?: Error;
};

const setup = ({
  stageStatus = 'OK',
  isDisabled = false,
  latestSourceUpdatedAt = null,
  hasDailyLogRow = true,
  snapshotRow = {
    live_total: 10,
    inserted_rows: 25,
    all_total: 10,
    source_total: 10,
  },
  failingSqlMarkers = [],
  trackingStartError,
  reportsError,
}: SetupOptions = {}) => {
  const queries: RecordedQuery[] = [];
  const callOrder: string[] = [];

  const run: CrmAnalyticsSqlRunner = async (sql, parameters) => {
    queries.push({ sql, parameters });

    const failingMarker = failingSqlMarkers.find((marker) =>
      sql.includes(marker),
    );

    if (failingMarker !== undefined) {
      throw new Error(`failed on ${failingMarker}`);
    }

    if (sql.includes(SQL_MARKERS.openLog)) {
      return [{ id: LOG_ROW_ID }];
    }

    if (sql.includes(SQL_MARKERS.cursor)) {
      return [{ latest_source_updated_at: latestSourceUpdatedAt }];
    }

    if (sql.includes(SQL_MARKERS.dailyLogLookup)) {
      return hasDailyLogRow ? [{ exists: 1 }] : [];
    }

    if (sql.includes(SQL_MARKERS.timelineRead)) {
      callOrder.push('timelineRead');

      return [{ inserted_count: 3 }];
    }

    if (sql.includes(SQL_MARKERS.reconcile)) {
      callOrder.push('reconcile');

      return [{ restored_count: 2 }];
    }

    if (sql.includes(SQL_MARKERS.snapshot)) {
      callOrder.push('snapshot');

      return [snapshotRow];
    }

    if (sql.includes(SQL_MARKERS.trimLog)) {
      callOrder.push('trimLog');
    }

    return [];
  };

  const state: CrmAnalyticsCrmState = {
    workspaceId: WORKSPACE_ID,
    stage: { status: stageStatus, isAuditLogged: true, options: [] },
    positionsAppliedFor: { status: 'OK', options: [] },
    applicantSource: { status: 'OK', options: [] },
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
  };

  const facade = new CrmAnalyticsFacadeService(
    undefined as never,
    undefined as never,
  );

  jest.spyOn(facade, 'getCrmState').mockResolvedValue(state);

  const databaseService = {
    runJob: jest.fn(
      async (work: (runner: CrmAnalyticsSqlRunner) => Promise<unknown>) =>
        work(run),
    ),
    ensureStorage: jest.fn().mockResolvedValue(undefined),
  };

  const settingsService = {
    isDisabled: jest.fn().mockResolvedValue(isDisabled),
    getTrackingStart: trackingStartError
      ? jest.fn().mockRejectedValue(trackingStartError)
      : jest.fn().mockResolvedValue(TRACKING_START),
  };

  const messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };

  const buildMissingReports = jest.fn(async () => {
    callOrder.push('reports');

    if (reportsError) {
      throw reportsError;
    }

    return 2;
  });

  const syncService = new CrmAnalyticsSyncService(
    facade,
    databaseService as unknown as CrmAnalyticsDatabaseService,
    settingsService as unknown as CrmAnalyticsSettingsService,
  );

  const syncJob = new CrmAnalyticsWorkspaceSyncJob(
    syncService,
    messageQueueService as unknown as MessageQueueService,
  );

  const dailyJob = new CrmAnalyticsWorkspaceDailyJob(
    syncService,
    new CrmAnalyticsSnapshotService(facade),
    { buildMissingReports } as unknown as CrmAnalyticsReportService,
  );

  const findQuery = (marker: string): RecordedQuery | undefined =>
    queries.find(({ sql }) => sql.includes(marker));

  // The UPDATE's parameters, named, as the job wrote them to the log row.
  const readClosedLogRow = () => {
    const closeQuery = findQuery(SQL_MARKERS.closeLog);

    if (closeQuery === undefined) {
      return undefined;
    }

    const [id, status, processedCount, restoredCount, details, errorMessage] =
      closeQuery.parameters;

    return {
      id,
      status,
      processedCount,
      restoredCount,
      details: typeof details === 'string' ? JSON.parse(details) : details,
      errorMessage,
    };
  };

  return {
    syncJob,
    dailyJob,
    queries,
    callOrder,
    state,
    databaseService,
    settingsService,
    messageQueueService,
    buildMissingReports,
    findQuery,
    readClosedLogRow,
  };
};

describe('CrmAnalyticsSyncService and the work jobs', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  describe('sync job', () => {
    it('reads from tracking start on the first run', async () => {
      const { syncJob, findQuery } = setup({ latestSourceUpdatedAt: null });

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(findQuery(SQL_MARKERS.timelineRead)?.parameters).toEqual([
        WORKSPACE_ID,
        TRACKING_START,
        TRACKING_START,
      ]);
    });

    it('overlaps the latest stored timeline change by 30 minutes on later runs', async () => {
      const { syncJob, findQuery } = setup({
        latestSourceUpdatedAt: new Date('2026-11-01T10:00:00.000Z'),
      });

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(findQuery(SQL_MARKERS.timelineRead)?.parameters).toEqual([
        WORKSPACE_ID,
        '2026-11-01T09:30:00.000Z',
        TRACKING_START,
      ]);
    });

    it('lets only timeline rows move the cursor', async () => {
      const { syncJob, findQuery } = setup();

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(findQuery(SQL_MARKERS.cursor)?.sql).toContain(
        `FILTER (WHERE origin = 'timeline')`,
      );
    });

    it('appends a merged timeline row and leaves stored rows as they are', async () => {
      const { syncJob, findQuery, queries } = setup();

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      const timelineSql = findQuery(SQL_MARKERS.timelineRead)?.sql;

      expect(timelineSql).toContain(
        'l.source_id IS NULL OR l.to_stage IS DISTINCT FROM c.to_stage',
      );
      expect(timelineSql).toContain(
        'CASE WHEN l.source_id IS NULL THEN c.from_stage ELSE l.to_stage END',
      );
      expect(
        queries.filter(({ sql }) =>
          /(UPDATE|DELETE FROM) analytics\.stage_transition/.test(sql),
        ),
      ).toEqual([]);
    });

    it('enqueues the daily job when no daily log row exists', async () => {
      const { syncJob, messageQueueService } = setup({ hasDailyLogRow: false });

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(messageQueueService.add).toHaveBeenCalledTimes(1);
      expect(messageQueueService.add).toHaveBeenCalledWith(
        CrmAnalyticsWorkspaceDailyJob.name,
        { workspaceId: WORKSPACE_ID },
      );
    });

    it('does not enqueue the daily job when a daily log row exists', async () => {
      const { syncJob, messageQueueService } = setup({ hasDailyLogRow: true });

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('ensures storage, then closes the log row as ok with the inserted count', async () => {
      const { syncJob, databaseService, readClosedLogRow } = setup();

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(databaseService.ensureStorage).toHaveBeenCalledTimes(1);
      expect(readClosedLogRow()).toEqual({
        id: LOG_ROW_ID,
        status: 'ok',
        processedCount: 3,
        restoredCount: 0,
        details: null,
        errorMessage: null,
      });
    });

    it('writes failed and rethrows when the timeline read fails', async () => {
      const { syncJob, readClosedLogRow, messageQueueService } = setup({
        hasDailyLogRow: false,
        failingSqlMarkers: [SQL_MARKERS.timelineRead],
      });

      await expect(
        syncJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(`failed on ${SQL_MARKERS.timelineRead}`);

      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        errorMessage: `failed on ${SQL_MARKERS.timelineRead}`,
      });
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('writes failed and rethrows on a bad tracking start value', async () => {
      const trackingStartError = new Error('Invalid tracking start');
      const { syncJob, readClosedLogRow } = setup({ trackingStartError });

      await expect(
        syncJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toBe(trackingStartError);

      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        errorMessage: 'Invalid tracking start',
      });
    });

    it('keeps the error message to its first 500 characters', async () => {
      const trackingStartError = new Error('x'.repeat(600));
      const { syncJob, readClosedLogRow } = setup({ trackingStartError });

      await expect(
        syncJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toBe(trackingStartError);

      expect(readClosedLogRow()?.errorMessage).toBe('x'.repeat(500));
    });

    it('rethrows the job failure even when the log row cannot be closed', async () => {
      const { syncJob } = setup({
        failingSqlMarkers: [SQL_MARKERS.timelineRead, SQL_MARKERS.closeLog],
      });

      await expect(
        syncJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(`failed on ${SQL_MARKERS.timelineRead}`);
    });

    it('returns with no connection and no log row when switched off', async () => {
      const { syncJob, databaseService, queries, messageQueueService } = setup({
        isDisabled: true,
      });

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expect(databaseService.runJob).not.toHaveBeenCalled();
      expect(queries).toEqual([]);
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it.each<CrmAnalyticsFieldStatus>(['MISSING', 'WRONG_TYPE'])(
      'logs skipped with no throw when the stage field is %s',
      async (stageStatus) => {
        const { syncJob, readClosedLogRow, findQuery, messageQueueService } =
          setup({ stageStatus, hasDailyLogRow: false });

        await syncJob.handle({ workspaceId: WORKSPACE_ID });

        expect(readClosedLogRow()).toMatchObject({
          status: 'skipped',
          details: { reason: 'NO_STAGE_FIELD' },
          errorMessage: null,
        });
        expect(findQuery(SQL_MARKERS.timelineRead)).toBeUndefined();
        expect(messageQueueService.add).not.toHaveBeenCalled();
      },
    );

    it('supplies a value for every SQL parameter', async () => {
      const { syncJob, queries } = setup();

      await syncJob.handle({ workspaceId: WORKSPACE_ID });

      expectEveryParameterSupplied(queries);
    });
  });

  describe('daily job', () => {
    it('re-reads the whole timeline from tracking start, whatever is stored', async () => {
      const { dailyJob, findQuery } = setup({
        latestSourceUpdatedAt: new Date('2026-11-01T10:00:00.000Z'),
      });

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expect(findQuery(SQL_MARKERS.cursor)).toBeUndefined();
      expect(findQuery(SQL_MARKERS.timelineRead)?.parameters).toEqual([
        WORKSPACE_ID,
        TRACKING_START,
        TRACKING_START,
      ]);
    });

    it('runs the steps in order and records each one', async () => {
      const { dailyJob, callOrder, readClosedLogRow, buildMissingReports, state } =
        setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expect(callOrder).toEqual([
        'timelineRead',
        'reconcile',
        'snapshot',
        'trimLog',
        'reports',
      ]);
      expect(buildMissingReports).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WORKSPACE_ID, state }),
      );
      expect(readClosedLogRow()).toEqual({
        id: LOG_ROW_ID,
        status: 'ok',
        processedCount: 3,
        restoredCount: 2,
        details: {
          steps: {
            timelineRead: { status: 'ok' },
            reconcile: { status: 'ok' },
            snapshot: { status: 'ok' },
            trimLog: { status: 'ok' },
            reports: { status: 'ok' },
          },
          consistency: 'OK',
          liveTotal: 10,
          allTotal: 10,
          sourceTotal: 10,
          reportsBuilt: 2,
        },
        errorMessage: null,
      });
    });

    it('still runs the later steps when one fails, then writes failed and rethrows', async () => {
      const reportsError = new Error('reports failed');
      const { dailyJob, callOrder, readClosedLogRow } = setup({
        failingSqlMarkers: [SQL_MARKERS.snapshot],
        reportsError,
      });

      await expect(
        dailyJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(`failed on ${SQL_MARKERS.snapshot}`);

      expect(callOrder).toEqual([
        'timelineRead',
        'reconcile',
        'trimLog',
        'reports',
      ]);
      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        processedCount: 3,
        restoredCount: 2,
        errorMessage: `failed on ${SQL_MARKERS.snapshot}`,
        details: {
          steps: {
            snapshot: {
              status: 'failed',
              errorMessage: `failed on ${SQL_MARKERS.snapshot}`,
            },
            trimLog: { status: 'ok' },
            reports: { status: 'failed', errorMessage: 'reports failed' },
          },
          consistency: 'NOT_RUN',
        },
      });
    });

    it('skips reconcile and reports when the timeline read fails, because their rows stay', async () => {
      const { dailyJob, callOrder, readClosedLogRow } = setup({
        failingSqlMarkers: [SQL_MARKERS.timelineRead],
      });

      await expect(
        dailyJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(`failed on ${SQL_MARKERS.timelineRead}`);

      expect(callOrder).toEqual(['snapshot', 'trimLog']);
      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        details: {
          steps: {
            reconcile: { status: 'skipped' },
            snapshot: { status: 'ok' },
            reports: { status: 'skipped' },
          },
        },
      });
    });

    it('skips reports when reconcile fails', async () => {
      const { dailyJob, callOrder, readClosedLogRow } = setup({
        failingSqlMarkers: [SQL_MARKERS.reconcile],
      });

      await expect(
        dailyJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(`failed on ${SQL_MARKERS.reconcile}`);

      expect(callOrder).toEqual(['timelineRead', 'snapshot', 'trimLog']);
      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        details: { steps: { reports: { status: 'skipped' } } },
      });
    });

    it('sets failed and MISMATCH with the three totals when totals differ', async () => {
      const { dailyJob, callOrder, readClosedLogRow } = setup({
        snapshotRow: {
          live_total: 10,
          inserted_rows: 25,
          all_total: 10,
          source_total: 9,
        },
      });

      await expect(
        dailyJob.handle({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow('Snapshot totals do not match the CRM');

      expect(callOrder).toContain('reports');
      expect(readClosedLogRow()).toMatchObject({
        status: 'failed',
        details: {
          consistency: 'MISMATCH',
          liveTotal: 10,
          allTotal: 10,
          sourceTotal: 9,
          steps: { snapshot: { status: 'failed' } },
        },
      });
    });

    it('gives NOT_RUN and stays ok when the snapshot inserted no rows', async () => {
      const { dailyJob, readClosedLogRow } = setup({
        snapshotRow: {
          live_total: 11,
          inserted_rows: 0,
          all_total: 0,
          source_total: 0,
        },
      });

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expect(readClosedLogRow()).toMatchObject({
        status: 'ok',
        details: {
          consistency: 'NOT_RUN',
          steps: { snapshot: { status: 'ok' } },
        },
      });
    });

    it('does not let a rerun add rows to a date that already has a snapshot', async () => {
      const { dailyJob, findQuery } = setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      const snapshotSql = findQuery(SQL_MARKERS.snapshot)?.sql;

      expect(snapshotSql).toContain('WHERE NOT EXISTS (');
      expect(snapshotSql).toContain('ON CONFLICT DO NOTHING');
    });

    it('stores the snapshot keys the contract names, under the reporting zone date', async () => {
      const { dailyJob, findQuery } = setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      const snapshotQuery = findQuery(SQL_MARKERS.snapshot);

      expect(snapshotQuery?.parameters).toEqual([WORKSPACE_ID, 'UTC']);
      expect(snapshotQuery?.sql).toContain(
        `(now() AT TIME ZONE $2::text)::date`,
      );
      expect(snapshotQuery?.sql).toContain(`''::text AS dimension_key`);
      expect(snapshotQuery?.sql).toContain(
        `COALESCE(NULLIF(p.source, ''), 'NONE')`,
      );
      expect(snapshotQuery?.sql).toContain(
        `COALESCE(x.raw_position, 'NONE')`,
      );
      expect(snapshotQuery?.sql).toContain(
        `CASE WHEN x.raw_position IS NULL THEN 'NONE' ELSE COALESCE(m.track_key, 'UNMAPPED') END`,
      );
    });

    it('reconciles only settled people and compares stages after mapping', async () => {
      const { dailyJob, findQuery } = setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      const reconcileQuery = findQuery(SQL_MARKERS.reconcile);

      expect(reconcileQuery?.parameters).toEqual([WORKSPACE_ID]);
      expect(reconcileQuery?.sql).toContain(
        `p.updated_at < now() - interval '30 minutes'`,
      );
      expect(reconcileQuery?.sql).toContain(
        'COALESCE(a.stage_key, l.to_stage) IS DISTINCT FROM COALESCE(b.stage_key, p.raw_stage)',
      );
    });

    it('trims only this workspace log rows older than 90 days', async () => {
      const { dailyJob, findQuery } = setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      const trimQuery = findQuery(SQL_MARKERS.trimLog);

      expect(trimQuery?.parameters).toEqual([WORKSPACE_ID]);
      expect(trimQuery?.sql).toContain(`interval '90 days'`);
    });

    it('returns with no log row when switched off', async () => {
      const { dailyJob, databaseService, queries, buildMissingReports } = setup(
        { isDisabled: true },
      );

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expect(databaseService.runJob).not.toHaveBeenCalled();
      expect(queries).toEqual([]);
      expect(buildMissingReports).not.toHaveBeenCalled();
    });

    it('logs skipped with no throw when the stage field is missing, and still trims the log', async () => {
      const { dailyJob, callOrder, readClosedLogRow } = setup({
        stageStatus: 'MISSING',
      });

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expect(callOrder).toEqual(['trimLog']);
      expect(readClosedLogRow()).toMatchObject({
        status: 'skipped',
        details: { reason: 'NO_STAGE_FIELD' },
      });
    });

    it('supplies a value for every SQL parameter', async () => {
      const { dailyJob, queries } = setup();

      await dailyJob.handle({ workspaceId: WORKSPACE_ID });

      expectEveryParameterSupplied(queries);
    });
  });
});
