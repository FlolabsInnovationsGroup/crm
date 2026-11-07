import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { escapeLiteral } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import {
  CRM_ANALYTICS_CONFIG,
  type CrmAnalyticsConfig,
} from 'src/modules/analytics/constants/crm-analytics-config.constant';

const buildTextSql = (value: string): string => `${escapeLiteral(value)}::text`;

const buildIntegerSql = (value: number | null): string =>
  isDefined(value) ? `${value}::int` : 'NULL::int';

const buildConditionSql = (conditionSql: string): string =>
  isNonEmptyString(conditionSql.trim()) ? conditionSql : 'TRUE';

// stage_map, position_map and funnel_stage, without the leading WITH.
export const buildCrmAnalyticsMappingCtes = ({
  stages,
  tracks,
}: Pick<CrmAnalyticsConfig, 'stages' | 'tracks'> = CRM_ANALYTICS_CONFIG): string => {
  const stageMapRowsSql = stages.flatMap((stage) =>
    stage.rawValues.map(
      ({ rawValue }) =>
        `(${buildTextSql(rawValue)}, ${buildTextSql(stage.stageKey)}, ${buildIntegerSql(stage.rank)}, ${buildTextSql(stage.kind)}, ${buildIntegerSql(stage.limitDays)})`,
    ),
  );

  const positionMapRowsSql = tracks.flatMap((track) =>
    track.positions.map(
      (position) =>
        `(${buildTextSql(position)}, ${buildTextSql(track.trackKey)})`,
    ),
  );

  const funnelStageRowsSql = stages
    .filter((stage) => isDefined(stage.rank))
    .map(
      (stage) =>
        `(${buildTextSql(stage.stageKey)}, ${buildIntegerSql(stage.rank)}, ${buildIntegerSql(stage.windowDays)})`,
    );

  return `stage_map (raw_stage, stage_key, rank, kind, limit_days) AS (VALUES ${stageMapRowsSql.join(', ')}),
position_map (raw_position, track_key) AS (VALUES ${positionMapRowsSql.join(', ')}),
funnel_stage (stage_key, rank, window_days) AS (VALUES ${funnelStageRowsSql.join(', ')})`;
};

// crm_person through person_step, without the leading WITH; place after the mapping
// CTEs. Binds $1 workspace and $2 tracking start, so filter values start at $3.
export const buildCrmAnalyticsBaseCtes = ({
  personRelationSql,
  scopeFilterSql,
  cohortDateFilterSql,
}: {
  // facade.buildPersonRelationSql(state)
  personRelationSql: string;
  // Condition over p (crm_person) and m (stage_map). Empty means no filter.
  scopeFilterSql: string;
  // Condition over s.created_at. Empty means no filter.
  cohortDateFilterSql: string;
}): string =>
  `crm_person AS (${personRelationSql}),
scope AS (SELECT p.*, m.stage_key AS current_key, m.rank AS current_rank, m.kind AS current_kind
  FROM crm_person p LEFT JOIN stage_map m ON m.raw_stage = p.raw_stage WHERE ${buildConditionSql(scopeFilterSql)}),
transition AS (SELECT t.person_id, t.happened_at, t.origin,
    f.stage_key AS from_key, f.rank AS from_rank, x.stage_key AS to_key, x.rank AS to_rank, x.kind AS to_kind
  FROM analytics.stage_transition t
  LEFT JOIN stage_map f ON f.raw_stage = t.from_stage
  LEFT JOIN stage_map x ON x.raw_stage = t.to_stage
  WHERE t.workspace_id = $1 AND t.happened_at >= $2 AND t.from_stage IS DISTINCT FROM t.to_stage),
first_move AS (SELECT DISTINCT ON (person_id) person_id, from_key, from_rank FROM transition ORDER BY person_id, happened_at),
cohort AS (SELECT s.person_id, s.created_at,
    CASE WHEN fm.person_id IS NULL THEN s.current_key ELSE fm.from_key END AS initial_key,
    CASE WHEN fm.person_id IS NULL THEN s.current_rank ELSE fm.from_rank END AS initial_rank
  FROM scope s LEFT JOIN first_move fm USING (person_id)
  WHERE s.created_at >= $2 AND ${buildConditionSql(cohortDateFilterSql)}),
arrival AS (
  SELECT person_id, initial_rank AS rank, created_at AS arrived_at FROM cohort WHERE initial_rank IS NOT NULL
  UNION ALL
  SELECT t.person_id, t.to_rank, t.happened_at FROM transition t JOIN cohort c USING (person_id) WHERE t.to_rank IS NOT NULL),
person_step AS (SELECT a.person_id, f.stage_key, f.rank, f.window_days,
    min(a.arrived_at) AS entered_at,
    min(a.arrived_at) FILTER (WHERE a.rank > f.rank) AS next_at
  FROM arrival a JOIN funnel_stage f ON a.rank >= f.rank GROUP BY 1, 2, 3, 4)`;
