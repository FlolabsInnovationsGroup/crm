import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import { buildCrmAnalyticsMappingCtes } from 'src/modules/analytics/utils/build-crm-analytics-cte.util';

const ERROR_MESSAGE_MAX_LENGTH = 500;
const MILLISECONDS_PER_MINUTE = 60_000;

export type CrmAnalyticsJobName = 'sync' | 'daily';

export type CrmAnalyticsJobContext = {
  state: CrmAnalyticsCrmState;
  trackingStart: string;
  run: CrmAnalyticsSqlRunner;
};

export type CrmAnalyticsJobOutcome = {
  status: 'ok' | 'failed' | 'skipped';
  processedCount?: number;
  restoredCount?: number;
  details?: Record<string, unknown>;
  // What the job rethrows when status is failed.
  failure?: unknown;
};

export const computeCrmAnalyticsErrorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(
    0,
    ERROR_MESSAGE_MAX_LENGTH,
  );

// A row seen before appends one more row from the person's last stored stage, because
// the CRM merges changes into its timeline row in place and stored rows never change.
// Another member's row can sit in between, so the merged row's own stage is not enough.
const buildTimelineReadSql = (
  stageChangeRelationSql: string,
): string => `WITH latest AS (
  SELECT DISTINCT ON (t.source_id) t.source_id, t.to_stage
  FROM analytics.stage_transition t
  WHERE t.workspace_id = $1 AND t.origin = 'timeline'
  ORDER BY t.source_id, t.source_updated_at DESC),
inserted AS (
  INSERT INTO analytics.stage_transition (source_id, workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
  SELECT c.id, $1::uuid, c.person_id,
    CASE WHEN l.source_id IS NULL THEN c.from_stage ELSE last_stored.to_stage END,
    c.to_stage,
    CASE WHEN l.source_id IS NULL THEN c.happened_at ELSE c.source_updated_at END,
    c.source_updated_at, 'timeline'
  FROM (${stageChangeRelationSql}) c
  LEFT JOIN latest l ON l.source_id = c.id
  LEFT JOIN LATERAL (SELECT s.to_stage FROM analytics.stage_transition s
    WHERE s.workspace_id = $1 AND s.person_id = c.person_id
    ORDER BY s.source_updated_at DESC, s.happened_at DESC LIMIT 1) last_stored ON l.source_id IS NOT NULL
  WHERE l.source_id IS NULL OR l.to_stage IS DISTINCT FROM c.to_stage
  ON CONFLICT (workspace_id, source_id, source_updated_at) DO NOTHING
  RETURNING 1)
SELECT count(*)::int AS inserted_count FROM inserted`;

// Recently updated people are left out because their timeline job may still be
// pending. Comparing after mapping means a renamed value with an alias is no move.
// Merged rows keep an old happensAt, so the last row by date can be stale while the
// real last stage sits just before it: any row inside the merge window counts.
const buildReconcileSql = (
  personRelationSql: string,
): string => `WITH ${buildCrmAnalyticsMappingCtes()},
crm_person AS (${personRelationSql}),
inserted AS (
  INSERT INTO analytics.stage_transition (workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
  SELECT $1::uuid, p.person_id, l.to_stage, p.raw_stage, now(), now(), 'reconcile'
  FROM crm_person p
  JOIN LATERAL (SELECT t.to_stage, t.happened_at FROM analytics.stage_transition t
    WHERE t.workspace_id = $1 AND t.person_id = p.person_id
    ORDER BY t.happened_at DESC, t.source_updated_at DESC LIMIT 1) l ON true
  LEFT JOIN stage_map a ON a.raw_stage = l.to_stage
  LEFT JOIN stage_map b ON b.raw_stage = p.raw_stage
  WHERE p.updated_at < now() - interval '30 minutes'
    AND COALESCE(a.stage_key, l.to_stage) IS DISTINCT FROM COALESCE(b.stage_key, p.raw_stage)
    AND NOT EXISTS (SELECT 1 FROM analytics.stage_transition w
      LEFT JOIN stage_map m ON m.raw_stage = w.to_stage
      WHERE w.workspace_id = $1 AND w.person_id = p.person_id
        AND w.happened_at >= l.happened_at - interval '10 minutes'
        AND COALESCE(m.stage_key, w.to_stage) IS NOT DISTINCT FROM COALESCE(b.stage_key, p.raw_stage))
  RETURNING 1)
SELECT count(*)::int AS restored_count FROM inserted`;

@Injectable()
export class CrmAnalyticsSyncService {
  private readonly logger = new Logger(CrmAnalyticsSyncService.name);

  constructor(
    private readonly crmAnalyticsFacadeService: CrmAnalyticsFacadeService,
    private readonly crmAnalyticsDatabaseService: CrmAnalyticsDatabaseService,
    private readonly crmAnalyticsSettingsService: CrmAnalyticsSettingsService,
  ) {}

  // Both jobs share this frame: off switch, storage, log row, stage check. A failed
  // outcome reaches the log row and is rethrown; the next tick is the retry.
  async runLoggedJob({
    workspaceId,
    jobName,
    work,
  }: {
    workspaceId: string;
    jobName: CrmAnalyticsJobName;
    work: (context: CrmAnalyticsJobContext) => Promise<CrmAnalyticsJobOutcome>;
  }): Promise<void> {
    if (await this.crmAnalyticsSettingsService.isDisabled(workspaceId)) {
      return;
    }

    await this.crmAnalyticsDatabaseService.runJob(async (run) => {
      await this.crmAnalyticsDatabaseService.ensureStorage(run);

      const logRowId = await this.openLogRow({ workspaceId, jobName, run });
      const outcome = await this.computeJobOutcome({
        workspaceId,
        jobName,
        work,
        run,
      });

      if (outcome.status !== 'failed') {
        await this.closeLogRow({ logRowId, outcome, run });

        return;
      }

      this.logger.error(
        `CRM analytics ${jobName} job failed for workspace ${workspaceId}`,
        outcome.failure instanceof Error
          ? outcome.failure.stack
          : String(outcome.failure),
      );

      try {
        await this.closeLogRow({ logRowId, outcome, run });
      } catch (closeError) {
        // The job's own failure is the one to rethrow. The open row reads as failed
        // once it passes the running limit.
        this.logger.error(
          `Could not close the CRM analytics log row ${logRowId}`,
          closeError instanceof Error ? closeError.stack : String(closeError),
        );
      }

      throw outcome.failure;
    });
  }

  // Reconcile rows carry now(), so only timeline rows may move this cursor.
  async computeSyncUpdatedSince({
    workspaceId,
    trackingStart,
    run,
  }: {
    workspaceId: string;
    trackingStart: string;
    run: CrmAnalyticsSqlRunner;
  }): Promise<string> {
    const rows = await run(
      `SELECT max(source_updated_at) FILTER (WHERE origin = 'timeline') AS latest_source_updated_at
FROM analytics.stage_transition
WHERE workspace_id = $1`,
      [workspaceId],
    );

    const latestSourceUpdatedAt = rows[0]?.latest_source_updated_at;

    if (!isDefined(latestSourceUpdatedAt)) {
      return trackingStart;
    }

    const latestTime = new Date(
      latestSourceUpdatedAt as string | Date,
    ).getTime();

    return new Date(
      latestTime -
        CRM_ANALYTICS_CONFIG.syncOverlapMinutes * MILLISECONDS_PER_MINUTE,
    ).toISOString();
  }

  async readTimeline({
    state,
    updatedSince,
    happenedSince,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    updatedSince: string;
    happenedSince: string;
    run: CrmAnalyticsSqlRunner;
  }): Promise<number> {
    const stageChangeRelationSql =
      this.crmAnalyticsFacadeService.buildStageChangeRelationSql({
        state,
        updatedSinceParameter: '$2',
        happenedSinceParameter: '$3',
      });

    const rows = await run(buildTimelineReadSql(stageChangeRelationSql), [
      state.workspaceId,
      updatedSince,
      happenedSince,
    ]);

    return Number(rows[0]?.inserted_count ?? 0);
  }

  async reconcile({
    state,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    run: CrmAnalyticsSqlRunner;
  }): Promise<number> {
    const rows = await run(
      buildReconcileSql(
        this.crmAnalyticsFacadeService.buildPersonRelationSql(state),
      ),
      [state.workspaceId],
    );

    return Number(rows[0]?.restored_count ?? 0);
  }

  async hasDailyLogRow({
    workspaceId,
    run,
  }: {
    workspaceId: string;
    run: CrmAnalyticsSqlRunner;
  }): Promise<boolean> {
    const rows = await run(
      `SELECT 1 FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'daily' AND status <> 'skipped' LIMIT 1`,
      [workspaceId],
    );

    return rows.length > 0;
  }

  async trimLog({
    workspaceId,
    run,
  }: {
    workspaceId: string;
    run: CrmAnalyticsSqlRunner;
  }): Promise<void> {
    await run(
      `DELETE FROM analytics.sync_log WHERE workspace_id = $1 AND started_at < now() - interval '90 days'`,
      [workspaceId],
    );
  }

  private async computeJobOutcome({
    workspaceId,
    jobName,
    work,
    run,
  }: {
    workspaceId: string;
    jobName: CrmAnalyticsJobName;
    work: (context: CrmAnalyticsJobContext) => Promise<CrmAnalyticsJobOutcome>;
    run: CrmAnalyticsSqlRunner;
  }): Promise<CrmAnalyticsJobOutcome> {
    try {
      const state =
        await this.crmAnalyticsFacadeService.getCrmState(workspaceId);

      if (state.stage.status !== 'OK') {
        // Skipped rows pile up every tick, and the trim step never runs here.
        if (jobName === 'daily') {
          await this.trimLog({ workspaceId, run });
        }

        return { status: 'skipped', details: { reason: 'NO_STAGE_FIELD' } };
      }

      const trackingStart =
        await this.crmAnalyticsSettingsService.getTrackingStart(workspaceId);

      return await work({ state, trackingStart, run });
    } catch (error) {
      return { status: 'failed', failure: error };
    }
  }

  private async openLogRow({
    workspaceId,
    jobName,
    run,
  }: {
    workspaceId: string;
    jobName: CrmAnalyticsJobName;
    run: CrmAnalyticsSqlRunner;
  }): Promise<string> {
    const rows = await run(
      `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, status)
VALUES ($1, $2, now(), 'running')
RETURNING id`,
      [workspaceId, jobName],
    );

    return String(rows[0]?.id);
  }

  private async closeLogRow({
    logRowId,
    outcome,
    run,
  }: {
    logRowId: string;
    outcome: CrmAnalyticsJobOutcome;
    run: CrmAnalyticsSqlRunner;
  }): Promise<void> {
    await run(
      `UPDATE analytics.sync_log
SET finished_at = now(), status = $2, processed_count = $3, restored_count = $4, details = $5::jsonb, error_message = $6
WHERE id = $1`,
      [
        logRowId,
        outcome.status,
        outcome.processedCount ?? 0,
        outcome.restoredCount ?? 0,
        isDefined(outcome.details) ? JSON.stringify(outcome.details) : null,
        outcome.status === 'failed'
          ? computeCrmAnalyticsErrorMessage(outcome.failure)
          : null,
      ],
    );
  }
}
