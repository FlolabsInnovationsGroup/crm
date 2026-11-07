import { Injectable } from '@nestjs/common';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import {
  CRM_ANALYTICS_NO_DATE_RANGE,
  CRM_ANALYTICS_NO_PERSON_FILTER,
  CrmAnalyticsMetricsService,
  type CrmAnalyticsQueryContext,
} from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type AnalyticsReport,
  type AnalyticsReportListItem,
  type AnalyticsReportPeriodType,
} from 'src/modules/analytics/types/analytics-api.type';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import {
  addCrmAnalyticsLocalDays,
  computeCrmAnalyticsPreviousReportPeriod,
  computeCrmAnalyticsReportPeriods,
  type CrmAnalyticsReportPeriod,
  toCrmAnalyticsIsoString,
} from 'src/modules/analytics/utils/compute-crm-analytics-report-periods.util';
import { computeCrmAnalyticsSignificantChanges } from 'src/modules/analytics/utils/compute-crm-analytics-significant-changes.util';

const STORAGE_EXISTS_SQL = `SELECT to_regclass('analytics.sync_log') IS NOT NULL AS has_storage`;

const REPORT_PAYLOAD_VERSION = 1;

const toInclusiveRange = ({
  periodStart,
  periodEnd,
}: CrmAnalyticsReportPeriod): { from: string; to: string } => ({
  from: periodStart,
  to: addCrmAnalyticsLocalDays(periodEnd, -1),
});

@Injectable()
export class CrmAnalyticsReportService {
  constructor(
    private readonly databaseService: CrmAnalyticsDatabaseService,
    private readonly metricsService: CrmAnalyticsMetricsService,
    private readonly settingsService: CrmAnalyticsSettingsService,
  ) {}

  async listReports(
    workspaceId: string,
  ): Promise<AnalyticsReportListItem[] | null> {
    if (await this.settingsService.isDisabled(workspaceId)) {
      return null;
    }

    return this.databaseService.runPageTransaction(workspaceId, async (run) => {
      if (!(await this.hasStorage(run))) {
        return [];
      }

      const rows = await run(
        `SELECT r.period_type, r.period_start::text AS period_start, r.period_end::text AS period_end, r.generated_at
FROM analytics.report r
WHERE r.workspace_id = $1::uuid
ORDER BY r.period_start DESC, r.period_type`,
        [workspaceId],
      );

      return rows.map((row) => ({
        periodType: row.period_type as AnalyticsReportPeriodType,
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        generatedAt: toCrmAnalyticsIsoString(row.generated_at),
      }));
    });
  }

  async getReport({
    workspaceId,
    periodType,
    periodStart,
  }: {
    workspaceId: string;
    periodType: AnalyticsReportPeriodType;
    periodStart: string;
  }): Promise<AnalyticsReport | null> {
    if (await this.settingsService.isDisabled(workspaceId)) {
      return null;
    }

    return this.databaseService.runPageTransaction(workspaceId, async (run) => {
      if (!(await this.hasStorage(run))) {
        return null;
      }

      const rows = await run(
        `SELECT r.payload
FROM analytics.report r
WHERE r.workspace_id = $1::uuid AND r.period_type = $2::text AND r.period_start = $3::date`,
        [workspaceId, periodType, periodStart],
      );

      return (rows[0]?.payload ?? null) as AnalyticsReport | null;
    });
  }

  // Safe to call repeatedly: only missing periods are built, and the first report
  // stored for a period stands, unless it was built on provisional definitions that
  // have since been confirmed. Runs on the job connection.
  async buildMissingReports({
    workspaceId,
    state,
    run,
  }: {
    workspaceId: string;
    state: CrmAnalyticsCrmState;
    run: CrmAnalyticsSqlRunner;
  }): Promise<number> {
    const trackingStart =
      await this.settingsService.getTrackingStart(workspaceId);
    const context = await this.metricsService.buildQueryContext({
      state,
      trackingStart,
      run,
    });

    const existingRows = await run(
      `SELECT r.period_type, r.period_start::text AS period_start,
  r.payload->>'isProvisional' = 'true' AS is_provisional
FROM analytics.report r
WHERE r.workspace_id = $1::uuid`,
      [workspaceId],
    );

    const periods = computeCrmAnalyticsReportPeriods({
      trackingStartAt: trackingStart,
      now: context.asOf,
      timeZone: context.timeZone,
      existingPeriods: existingRows
        .filter(
          (row) =>
            CRM_ANALYTICS_CONFIG.isProvisional || row.is_provisional !== true,
        )
        .map((row) => ({
          periodType: String(row.period_type),
          periodStart: String(row.period_start),
        })),
    });

    let builtCount = 0;

    for (const period of periods) {
      const report = await this.buildReport(context, period);

      const insertedRows = await run(
        `INSERT INTO analytics.report AS stored_report (workspace_id, period_type, period_start, period_end, generated_at, payload)
VALUES ($1::uuid, $2::text, $3::date, $4::date, $5::timestamptz, $6::jsonb)
ON CONFLICT (workspace_id, period_type, period_start) DO UPDATE
SET period_end = EXCLUDED.period_end, generated_at = EXCLUDED.generated_at, payload = EXCLUDED.payload
WHERE stored_report.payload->>'isProvisional' = 'true' AND EXCLUDED.payload->>'isProvisional' = 'false'
RETURNING period_start::text AS period_start`,
        [
          workspaceId,
          period.periodType,
          period.periodStart,
          period.periodEnd,
          context.asOf,
          JSON.stringify(report),
        ],
      );

      builtCount += insertedRows.length;
    }

    return builtCount;
  }

  private async hasStorage(run: CrmAnalyticsSqlRunner): Promise<boolean> {
    const rows = await run(STORAGE_EXISTS_SQL, []);

    return rows[0]?.has_storage === true;
  }

  private async buildReport(
    context: CrmAnalyticsQueryContext,
    period: CrmAnalyticsReportPeriod,
  ): Promise<AnalyticsReport> {
    const personFilter = CRM_ANALYTICS_NO_PERSON_FILTER;
    const range = toInclusiveRange(period);
    const previousRange = toInclusiveRange(
      computeCrmAnalyticsPreviousReportPeriod(period),
    );
    // A period's own applications are too recent to rate, so rates read every cohort
    // person up to the end of the period, past their window at generation time.
    const cohortDateRange = { from: null, to: range.to };

    const newApplications = await this.metricsService.computeNewApplications({
      context,
      personFilter,
      range,
      previousRange,
    });
    const movement = await this.metricsService.computeMovement({
      context,
      personFilter,
      range,
    });
    const previousMovement = await this.metricsService.computeMovement({
      context,
      personFilter,
      range: previousRange,
    });
    const previousEnteredByStage = new Map(
      previousMovement.map((row): [string, number] => [
        row.stageKey,
        row.enteredInPeriod,
      ]),
    );
    const hasPreviousPeriodStartedBeforeTracking =
      this.metricsService.hasRangeStartedBeforeTracking(context, previousRange);

    return {
      isProvisional: CRM_ANALYTICS_CONFIG.isProvisional,
      payloadVersion: REPORT_PAYLOAD_VERSION,
      periodType: period.periodType,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      generatedAt: context.asOf,
      asOf: context.asOf,
      trackingStartedAt: context.trackingStart,
      reportingTimeZone: context.timeZone,
      minimumSample: CRM_ANALYTICS_CONFIG.minimumSample,
      newApplications: newApplications.current,
      newApplicationsPrevious: newApplications.previous,
      categories: await this.metricsService.computeCategories({
        context,
        personFilter,
        groupBy: 'TRACK_PROGRAM',
        peopleDateRange: CRM_ANALYTICS_NO_DATE_RANGE,
        submissionRange: range,
        cohortDateRange,
      }),
      funnel: await this.metricsService.computeFunnel({
        context,
        personFilter,
        cohortDateRange,
      }),
      movement,
      stuckByStage: await this.metricsService.computeStuckByStage({
        context,
        personFilter,
      }),
      comparisons: computeCrmAnalyticsSignificantChanges({
        changes: [
          {
            metricKey: 'NEW_APPLICATIONS',
            label: 'New applications',
            current: newApplications.current,
            previous: newApplications.previous,
          },
          ...movement.map((row) => ({
            metricKey: `ENTERED_${row.stageKey}`,
            label: `Entered ${row.label}`,
            current: row.enteredInPeriod,
            previous: hasPreviousPeriodStartedBeforeTracking
              ? null
              : (previousEnteredByStage.get(row.stageKey) ?? 0),
          })),
        ],
        minimumSample: CRM_ANALYTICS_CONFIG.minimumSample,
        significantChangeRatio: CRM_ANALYTICS_CONFIG.significantChangeRatio,
      }),
      cohorts:
        period.periodType === 'MONTH'
          ? await this.metricsService.computeCohorts({
              context,
              personFilter,
              period: 'MONTH',
              cohortDateRange,
            })
          : [],
    };
  }
}
