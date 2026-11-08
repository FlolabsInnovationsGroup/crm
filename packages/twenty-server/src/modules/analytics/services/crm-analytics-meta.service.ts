import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type AnalyticsMeta,
  type AnalyticsPageState,
  type AnalyticsSyncState,
} from 'src/modules/analytics/types/analytics-api.type';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import { toCrmAnalyticsIsoString } from 'src/modules/analytics/utils/compute-crm-analytics-report-periods.util';

// One sync per 15 minutes and a 30 minute running limit leave at most a few young
// running rows, so a real attempt is always among these.
const RECENT_SYNC_ROWS_LIMIT = 10;

const MILLISECONDS_PER_MINUTE = 60000;

const UNMAPPED_TRACK_KEY = 'UNMAPPED';

const EMPTY_SYNC_STATE: AnalyticsSyncState = {
  lastSuccessfulSyncAt: null,
  lastReconciliationAt: null,
  lastAttemptAt: null,
  lastAttemptStatus: null,
  isStale: false,
  restoredInLastReconciliation: null,
};

const toNullableIsoString = (value: unknown): string | null =>
  isDefined(value) ? toCrmAnalyticsIsoString(value) : null;

const readLastAttempt = (
  recentSyncRows: Record<string, unknown>[],
  nowMilliseconds: number,
): {
  lastAttemptAt: string | null;
  lastAttemptStatus: AnalyticsSyncState['lastAttemptStatus'];
} => {
  const runningLimitMilliseconds =
    CRM_ANALYTICS_CONFIG.runningLimitMinutes * MILLISECONDS_PER_MINUTE;

  // A young running row is a job still in progress, so the row before it says more.
  const lastAttemptRow = recentSyncRows.find(
    (row) =>
      row.status !== 'running' ||
      nowMilliseconds -
        new Date(toCrmAnalyticsIsoString(row.started_at)).getTime() >=
        runningLimitMilliseconds,
  );

  if (!isDefined(lastAttemptRow)) {
    return { lastAttemptAt: null, lastAttemptStatus: null };
  }

  const lastAttemptAt = toCrmAnalyticsIsoString(lastAttemptRow.started_at);

  switch (lastAttemptRow.status) {
    case 'ok':
      return { lastAttemptAt, lastAttemptStatus: 'OK' };
    case 'skipped':
      return { lastAttemptAt, lastAttemptStatus: 'SKIPPED' };
    // A running row past the limit was killed mid-job.
    default:
      return { lastAttemptAt, lastAttemptStatus: 'FAILED' };
  }
};

@Injectable()
export class CrmAnalyticsMetaService {
  constructor(
    private readonly databaseService: CrmAnalyticsDatabaseService,
    private readonly facadeService: CrmAnalyticsFacadeService,
    private readonly settingsService: CrmAnalyticsSettingsService,
  ) {}

  async getMeta(workspaceId: string): Promise<AnalyticsMeta> {
    // Switched off means no read at all beyond the switch itself.
    if (await this.settingsService.isDisabled(workspaceId)) {
      return this.buildMeta({
        pageState: 'DISABLED',
        asOf: new Date().toISOString(),
        trackingStartedAt: CRM_ANALYTICS_CONFIG.trackingStartAt,
        sync: EMPTY_SYNC_STATE,
        crmState: null,
      });
    }

    const crmState = await this.facadeService.getCrmState(workspaceId);
    const trackingStartedAt =
      await this.settingsService.getTrackingStart(workspaceId);

    const { asOf, hasStorage, sync } =
      await this.databaseService.runPageTransaction(workspaceId, (run) =>
        this.readSyncState(workspaceId, run),
      );

    return this.buildMeta({
      pageState: this.computePageState({ crmState, hasStorage, sync }),
      asOf,
      trackingStartedAt,
      sync,
      crmState,
    });
  }

  private computePageState({
    crmState,
    hasStorage,
    sync,
  }: {
    crmState: CrmAnalyticsCrmState;
    hasStorage: boolean;
    sync: AnalyticsSyncState;
  }): AnalyticsPageState {
    if (crmState.stage.status !== 'OK') {
      return 'NO_STAGE_FIELD';
    }

    return hasStorage && isDefined(sync.lastSuccessfulSyncAt)
      ? 'READY'
      : 'NEVER_SYNCED';
  }

  private async readSyncState(
    workspaceId: string,
    run: CrmAnalyticsSqlRunner,
  ): Promise<{
    asOf: string;
    hasStorage: boolean;
    sync: AnalyticsSyncState;
  }> {
    const clockRows = await run(
      `SELECT now() AS as_of, to_regclass('analytics.sync_log') IS NOT NULL AS has_storage`,
      [],
    );
    const asOf = toCrmAnalyticsIsoString(clockRows[0]?.as_of);

    // Page transactions never create storage, so nothing may read it before this check.
    if (clockRows[0]?.has_storage !== true) {
      return { asOf, hasStorage: false, sync: EMPTY_SYNC_STATE };
    }

    const lastSuccessRows = await run(
      `SELECT l.finished_at
FROM analytics.sync_log l
WHERE l.workspace_id = $1::uuid AND l.job_name = 'sync' AND l.status = 'ok'
ORDER BY l.finished_at DESC NULLS LAST
LIMIT 1`,
      [workspaceId],
    );
    const recentSyncRows = await run(
      `SELECT l.status, l.started_at
FROM analytics.sync_log l
WHERE l.workspace_id = $1::uuid AND l.job_name = 'sync'
ORDER BY l.started_at DESC
LIMIT $2::int`,
      [workspaceId, RECENT_SYNC_ROWS_LIMIT],
    );
    const lastReconciliationRows = await run(
      `SELECT l.finished_at, l.restored_count
FROM analytics.sync_log l
WHERE l.workspace_id = $1::uuid AND l.job_name = 'daily' AND l.status = 'ok'
ORDER BY l.finished_at DESC NULLS LAST
LIMIT 1`,
      [workspaceId],
    );

    const nowMilliseconds = new Date(asOf).getTime();
    const lastSuccessfulSyncAt = toNullableIsoString(
      lastSuccessRows[0]?.finished_at,
    );
    const lastAttempt = readLastAttempt(recentSyncRows, nowMilliseconds);
    const reconciliationRow = lastReconciliationRows[0];

    return {
      asOf,
      hasStorage: true,
      sync: {
        lastSuccessfulSyncAt,
        lastReconciliationAt: toNullableIsoString(
          reconciliationRow?.finished_at,
        ),
        ...lastAttempt,
        // Daily rows play no part here, so a daily success cannot hide a stopped sync.
        isStale: isDefined(lastSuccessfulSyncAt)
          ? nowMilliseconds - new Date(lastSuccessfulSyncAt).getTime() >
            CRM_ANALYTICS_CONFIG.staleAfterMinutes * MILLISECONDS_PER_MINUTE
          : isDefined(lastAttempt.lastAttemptAt),
        restoredInLastReconciliation: isDefined(reconciliationRow)
          ? Number(reconciliationRow.restored_count ?? 0)
          : null,
      },
    };
  }

  private buildMeta({
    pageState,
    asOf,
    trackingStartedAt,
    sync,
    crmState,
  }: {
    pageState: AnalyticsPageState;
    asOf: string;
    trackingStartedAt: string;
    sync: AnalyticsSyncState;
    crmState: CrmAnalyticsCrmState | null;
  }): AnalyticsMeta {
    const positionOptions = crmState?.positionsAppliedFor.options ?? [];
    const mappedPositions = new Set(
      CRM_ANALYTICS_CONFIG.tracks.flatMap((track) => track.positions),
    );

    return {
      asOf,
      trackingStartedAt,
      reportingTimeZone: CRM_ANALYTICS_CONFIG.reportingTimeZone,
      minimumSample: CRM_ANALYTICS_CONFIG.minimumSample,
      state: pageState,
      isProvisional: CRM_ANALYTICS_CONFIG.isProvisional,
      showSignedFigure: CRM_ANALYTICS_CONFIG.showSignedFigure,
      sync,
      fields: {
        stage: crmState?.stage.status ?? 'MISSING',
        isStageAuditLogged: crmState?.stage.isAuditLogged ?? false,
        positionsAppliedFor: crmState?.positionsAppliedFor.status ?? 'MISSING',
        applicantSource: crmState?.applicantSource.status ?? 'MISSING',
        hasFormSubmissionObject: crmState?.hasFormSubmissionObject ?? false,
        hasApplicationObject: crmState?.hasApplicationObject ?? false,
      },
      stages: CRM_ANALYTICS_CONFIG.stages.map(
        ({ stageKey, label, kind, rank, limitDays, windowDays, isSuccess }) => ({
          stageKey,
          label,
          kind,
          rank,
          limitDays,
          windowDays,
          isSuccess,
        }),
      ),
      tracks: CRM_ANALYTICS_CONFIG.tracks.map(({ trackKey, label }) => ({
        key: trackKey,
        label,
      })),
      programs: [
        ...CRM_ANALYTICS_CONFIG.tracks.flatMap((track) =>
          track.positions.map((position) => ({
            key: position,
            label:
              positionOptions.find(({ value }) => value === position)?.label ??
              position,
            trackKey: track.trackKey,
          })),
        ),
        ...positionOptions
          .filter(({ value }) => !mappedPositions.has(value))
          .map(({ value, label }) => ({
            key: value,
            label,
            trackKey: UNMAPPED_TRACK_KEY,
          })),
      ],
      sources: (crmState?.applicantSource.options ?? []).map(
        ({ value, label }) => ({ key: value, label }),
      ),
    };
  }
}
