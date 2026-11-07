import { Injectable } from '@nestjs/common';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import { buildCrmAnalyticsMappingCtes } from 'src/modules/analytics/utils/build-crm-analytics-cte.util';
import { buildCrmAnalyticsLocalDateSql } from 'src/modules/analytics/utils/build-crm-analytics-local-date-sql.util';

export type CrmAnalyticsSnapshotResult = {
  consistency: 'OK' | 'MISMATCH' | 'NOT_RUN';
  insertedRows: number;
  liveTotal: number;
  allTotal: number;
  sourceTotal: number;
};

const LOCAL_TODAY_SQL = `${buildCrmAnalyticsLocalDateSql({
  columnSql: 'now()',
  timeZoneParameter: '$2',
})}::date`;

// One statement, so the totals and the stored rows read one database snapshot and a
// person created meanwhile cannot cause a false mismatch. NOT EXISTS keeps a rerun
// from adding a key combination that is new since the first run of the date, which
// would also read as a mismatch because only those new rows would be summed.
const buildSnapshotSql = (
  personRelationSql: string,
): string => `WITH ${buildCrmAnalyticsMappingCtes()},
crm_person AS (${personRelationSql}),
person_position AS (
  SELECT p.person_id, COALESCE(p.raw_stage, '') AS stage, position_value.raw_position
  FROM crm_person p
  LEFT JOIN LATERAL unnest(p.positions) AS position_value (raw_position) ON true),
snapshot_row AS (
  SELECT 'all'::text AS dimension, ''::text AS dimension_key, COALESCE(p.raw_stage, '') AS stage, count(*)::int AS person_count
  FROM crm_person p
  GROUP BY 3
  UNION ALL
  SELECT 'source', COALESCE(NULLIF(p.source, ''), 'NONE'), COALESCE(p.raw_stage, ''), count(*)::int
  FROM crm_person p
  GROUP BY 2, 3
  UNION ALL
  SELECT 'position', COALESCE(x.raw_position, 'NONE'), x.stage, count(DISTINCT x.person_id)::int
  FROM person_position x
  GROUP BY 2, 3
  UNION ALL
  SELECT 'track', CASE WHEN x.raw_position IS NULL THEN 'NONE' ELSE COALESCE(m.track_key, 'UNMAPPED') END, x.stage, count(DISTINCT x.person_id)::int
  FROM person_position x
  LEFT JOIN position_map m ON m.raw_position = x.raw_position
  GROUP BY 2, 3),
inserted AS (
  INSERT INTO analytics.daily_snapshot (workspace_id, snapshot_date, dimension, dimension_key, stage, person_count)
  SELECT $1::uuid, ${LOCAL_TODAY_SQL}, dimension, dimension_key, stage, person_count
  FROM snapshot_row
  WHERE NOT EXISTS (
    SELECT 1 FROM analytics.daily_snapshot d
    WHERE d.workspace_id = $1 AND d.snapshot_date = ${LOCAL_TODAY_SQL})
  ON CONFLICT DO NOTHING
  RETURNING dimension, person_count)
SELECT (SELECT count(*) FROM crm_person)::int AS live_total,
       (SELECT count(*) FROM inserted)::int AS inserted_rows,
       (SELECT COALESCE(sum(person_count), 0) FROM inserted WHERE dimension = 'all')::int AS all_total,
       (SELECT COALESCE(sum(person_count), 0) FROM inserted WHERE dimension = 'source')::int AS source_total`;

// Position and track rows are not compared because they do not sum: a person counts
// once per position and once per track.
const computeConsistency = ({
  insertedRows,
  liveTotal,
  allTotal,
  sourceTotal,
}: Omit<
  CrmAnalyticsSnapshotResult,
  'consistency'
>): CrmAnalyticsSnapshotResult['consistency'] => {
  if (insertedRows === 0) {
    return 'NOT_RUN';
  }

  return allTotal === liveTotal && sourceTotal === liveTotal
    ? 'OK'
    : 'MISMATCH';
};

@Injectable()
export class CrmAnalyticsSnapshotService {
  constructor(
    private readonly crmAnalyticsFacadeService: CrmAnalyticsFacadeService,
  ) {}

  async takeSnapshot({
    state,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    run: CrmAnalyticsSqlRunner;
  }): Promise<CrmAnalyticsSnapshotResult> {
    const rows = await run(
      buildSnapshotSql(
        this.crmAnalyticsFacadeService.buildPersonRelationSql(state),
      ),
      [state.workspaceId, CRM_ANALYTICS_CONFIG.reportingTimeZone],
    );

    const insertedRows = Number(rows[0]?.inserted_rows ?? 0);
    const liveTotal = Number(rows[0]?.live_total ?? 0);
    const allTotal = Number(rows[0]?.all_total ?? 0);
    const sourceTotal = Number(rows[0]?.source_total ?? 0);

    return {
      consistency: computeConsistency({
        insertedRows,
        liveTotal,
        allTotal,
        sourceTotal,
      }),
      insertedRows,
      liveTotal,
      allTotal,
      sourceTotal,
    };
  }
}
