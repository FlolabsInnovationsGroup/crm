import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import {
  CRM_ANALYTICS_CONFIG,
  type CrmAnalyticsStageConfig,
} from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CRM_ANALYTICS_SERIES_LIMITS } from 'src/modules/analytics/constants/crm-analytics-series-limits.constant';
import { CRM_ANALYTICS_SERIES_STAGES } from 'src/modules/analytics/constants/crm-analytics-series-stages.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import {
  type AnalyticsBase,
  type AnalyticsCategories,
  type AnalyticsCategoryGroupBy,
  type AnalyticsCategoryRow,
  type AnalyticsCohortRow,
  type AnalyticsFilter,
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
  type AnalyticsMovementRow,
  type AnalyticsOverview,
  type AnalyticsOption,
  type AnalyticsPeriod,
  type AnalyticsSeries,
  type AnalyticsSeriesBundle,
  type AnalyticsSeriesRequest,
  type AnalyticsStageTotalRow,
  type AnalyticsStatusFilter,
  type AnalyticsStuckRow,
  type AnalyticsTrendMetric,
  type AnalyticsTrendPoint,
  type AnalyticsTrends,
} from 'src/modules/analytics/types/analytics-api.type';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsFieldOption,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';
import {
  buildCrmAnalyticsBaseCtes,
  buildCrmAnalyticsMappingCtes,
} from 'src/modules/analytics/utils/build-crm-analytics-cte.util';
import { buildCrmAnalyticsLocalDateSql } from 'src/modules/analytics/utils/build-crm-analytics-local-date-sql.util';
import {
  addCrmAnalyticsLocalDays,
  addCrmAnalyticsPeriods,
  computeCrmAnalyticsLocalDate,
  computeCrmAnalyticsPeriodStart,
  computeCrmAnalyticsTrendBuckets,
  countCrmAnalyticsLocalDays,
  type CrmAnalyticsTrendBucket,
  toCrmAnalyticsIsoString,
} from 'src/modules/analytics/utils/compute-crm-analytics-report-periods.util';

export type CrmAnalyticsPersonFilter = Pick<
  AnalyticsFilter,
  'trackKey' | 'programKey' | 'sourceKey' | 'status'
>;

export type CrmAnalyticsDateRange = { from: string | null; to: string | null };

export type CrmAnalyticsClosedDateRange = { from: string; to: string };

export type CrmAnalyticsQueryContext = {
  state: CrmAnalyticsCrmState;
  run: CrmAnalyticsSqlRunner;
  trackingStart: string;
  timeZone: string;
  asOf: string;
  localToday: string;
  hasStorage: boolean;
};

export const CRM_ANALYTICS_NO_PERSON_FILTER: CrmAnalyticsPersonFilter = {
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
};

export const CRM_ANALYTICS_NO_DATE_RANGE: CrmAnalyticsDateRange = {
  from: null,
  to: null,
};

type SqlRow = Record<string, unknown>;

type SqlStatement = {
  parameters: unknown[];
  bind: (value: unknown) => string;
  localDate: (columnSql: string) => string;
};

type BaseSqlStatement = SqlStatement & { withSql: string };

type StepTotals = {
  entered: number;
  eligible: number;
  reachedNext: number;
  exited: number;
  reachedSoFar: number;
};

type FunnelGroup = {
  entered: number;
  overallEligible: number;
  overallReached: number;
  overallReachedSoFar: number;
  steps: Map<string, StepTotals>;
};

type TrendValue = { value: number | null; size: number | null };

type SeriesGroup = {
  groupKey: string | null;
  groupLabel: string | null;
  filter: AnalyticsFilter;
  stageKey: string | null;
};

const NONE_CATEGORY_KEY = 'NONE';
const UNMAPPED_CATEGORY_KEY = 'UNMAPPED';
const CATEGORY_GROUP_SEPARATOR = '/';
const STUCK_ROWS_LIMIT = 100;
const NO_POSITIONS_SQL = 'cardinality(p.positions) = 0';

const PERIOD_SQL_UNITS: Record<AnalyticsPeriod, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
};

const RANKED_STAGES = CRM_ANALYTICS_CONFIG.stages
  .filter((stage) => isDefined(stage.rank))
  .sort((first, second) => (first.rank ?? 0) - (second.rank ?? 0));
const STEP_STAGES = RANKED_STAGES.filter((stage) =>
  isDefined(stage.windowDays),
);
const ENTRY_STAGE_KEY = RANKED_STAGES[0]?.stageKey ?? null;
const ENTRY_RANK = RANKED_STAGES[0]?.rank ?? 0;
const SUCCESS_STAGE_KEY =
  CRM_ANALYTICS_CONFIG.stages.find((stage) => stage.isSuccess)?.stageKey ??
  null;
const HAS_STAGE_LIMITS = CRM_ANALYTICS_CONFIG.stages.some((stage) =>
  isDefined(stage.limitDays),
);
const STAGE_BY_KEY = new Map(
  CRM_ANALYTICS_CONFIG.stages.map((stage): [string, CrmAnalyticsStageConfig] => [
    stage.stageKey,
    stage,
  ]),
);
const STAGE_BY_RAW_VALUE = new Map(
  CRM_ANALYTICS_CONFIG.stages.flatMap((stage) =>
    stage.rawValues.map(({ rawValue }): [string, CrmAnalyticsStageConfig] => [
      rawValue,
      stage,
    ]),
  ),
);
const TRACK_LABEL_BY_KEY = new Map(
  CRM_ANALYTICS_CONFIG.tracks.map((track): [string, string] => [
    track.trackKey,
    track.label,
  ]),
);
const TRACK_KEY_BY_POSITION = new Map(
  CRM_ANALYTICS_CONFIG.tracks.flatMap((track) =>
    track.positions.map((position): [string, string] => [
      position,
      track.trackKey,
    ]),
  ),
);

const EMPTY_STEP_TOTALS: StepTotals = {
  entered: 0,
  eligible: 0,
  reachedNext: 0,
  exited: 0,
  reachedSoFar: 0,
};

const EMPTY_FUNNEL_GROUP: FunnelGroup = {
  entered: 0,
  overallEligible: 0,
  overallReached: 0,
  overallReachedSoFar: 0,
  steps: new Map(),
};

const toCount = (value: unknown): number => Number(value ?? 0);

const computeRate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

const roundDays = (days: number): number => Math.round(days * 10) / 10;

const buildOptionLabels = (
  options: CrmAnalyticsFieldOption[],
): Map<string, string> =>
  new Map(
    options.map(({ value, label }): [string, string] => [value, label]),
  );

const createSqlStatement = (
  initialParameters: unknown[],
  timeZone: string,
): SqlStatement => {
  const parameters = [...initialParameters];

  const bind = (value: unknown): string => {
    parameters.push(value);

    return `$${parameters.length}`;
  };

  let timeZoneParameter: string | null = null;

  return {
    parameters,
    bind,
    localDate: (columnSql) => {
      timeZoneParameter = timeZoneParameter ?? bind(timeZone);

      return buildCrmAnalyticsLocalDateSql({ columnSql, timeZoneParameter });
    },
  };
};

const joinCtes = (...ctes: string[]): string =>
  ctes.filter(isNonEmptyString).join(',\n');

const buildActiveConditionSql = (
  statement: SqlStatement,
  kindSql: string,
  stageKeySql: string,
): string =>
  `${kindSql} IN ('MAIN', 'OTHER') AND ${stageKeySql} IS DISTINCT FROM ${statement.bind(SUCCESS_STAGE_KEY)}::text`;

const buildStatusConditions = (
  statement: SqlStatement,
  status: AnalyticsStatusFilter,
  rawStageSql: string,
): string[] => {
  switch (status) {
    case 'ALL':
      return [];
    case 'ACTIVE':
      return [buildActiveConditionSql(statement, 'm.kind', 'm.stage_key')];
    case 'SUCCESS':
      return [`m.stage_key = ${statement.bind(SUCCESS_STAGE_KEY)}::text`];
    case 'EXITED':
      return [`m.kind = 'EXIT'`];
    case 'UNMAPPED':
      return [`COALESCE(${rawStageSql}, '') <> '' AND m.stage_key IS NULL`];
    case 'NO_STAGE':
      return [`COALESCE(${rawStageSql}, '') = ''`];
  }
};

// Over p (crm_person) and m (stage_map), inside the scope CTE.
const buildPersonFilterConditions = (
  statement: SqlStatement,
  filter: CrmAnalyticsPersonFilter,
): string[] => {
  const conditions = buildStatusConditions(
    statement,
    filter.status,
    'p.raw_stage',
  );

  if (isDefined(filter.trackKey)) {
    conditions.push(
      filter.trackKey === NONE_CATEGORY_KEY
        ? NO_POSITIONS_SQL
        : `EXISTS (SELECT 1 FROM unnest(p.positions) AS position_row (position_value)
    LEFT JOIN position_map pm ON pm.raw_position = position_row.position_value
    WHERE COALESCE(pm.track_key, '${UNMAPPED_CATEGORY_KEY}') = ${statement.bind(filter.trackKey)}::text)`,
    );
  }

  if (isDefined(filter.programKey)) {
    conditions.push(
      filter.programKey === NONE_CATEGORY_KEY
        ? NO_POSITIONS_SQL
        : `${statement.bind(filter.programKey)}::text = ANY (p.positions)`,
    );
  }

  if (isDefined(filter.sourceKey)) {
    conditions.push(
      filter.sourceKey === NONE_CATEGORY_KEY
        ? `COALESCE(p.source, '') = ''`
        : `p.source = ${statement.bind(filter.sourceKey)}::text`,
    );
  }

  return conditions;
};

const buildLocalDateRangeConditions = (
  statement: SqlStatement,
  columnSql: string,
  { from, to }: CrmAnalyticsDateRange,
): string[] => [
  ...(isDefined(from)
    ? [`${statement.localDate(columnSql)}::date >= ${statement.bind(from)}::date`]
    : []),
  ...(isDefined(to)
    ? [`${statement.localDate(columnSql)}::date <= ${statement.bind(to)}::date`]
    : []),
];

// Imported people have no known application date, so any date filter drops them.
const buildCurrentStateDateConditions = (
  statement: SqlStatement,
  range: CrmAnalyticsDateRange,
): string[] =>
  isDefined(range.from) || isDefined(range.to)
    ? [
        'p.created_at >= $2',
        ...buildLocalDateRangeConditions(statement, 'p.created_at', range),
      ]
    : [];

const hasPersonFilter = (filter: CrmAnalyticsPersonFilter): boolean =>
  isDefined(filter.trackKey) ||
  isDefined(filter.programKey) ||
  isDefined(filter.sourceKey) ||
  filter.status !== 'ALL';

// Rates on only the people still active, or only those signed, read near 0% or 100%,
// so the cohort behind a rate never narrows by status.
const withoutStatusFilter = (
  filter: CrmAnalyticsPersonFilter,
): CrmAnalyticsPersonFilter => ({ ...filter, status: 'ALL' });

const buildBucketSql = (
  statement: SqlStatement,
  period: AnalyticsPeriod,
  columnSql: string,
): string =>
  `date_trunc(${statement.bind(PERIOD_SQL_UNITS[period])}::text, ${statement.localDate(columnSql)})::date::text`;

// EXISTS over a repeated CTE would rescan it per row; step_exit is a hash join.
const buildFunnelCtes = ({
  groupSql,
  overallWindowParameter,
  successStageParameter,
  entryRankParameter,
  windowsClosedAtParameter,
}: {
  groupSql: string;
  overallWindowParameter: string;
  successStageParameter: string;
  entryRankParameter: string;
  windowsClosedAtParameter?: string;
}): string => {
  const windowsClosedAtSql = isDefined(windowsClosedAtParameter)
    ? `${windowsClosedAtParameter}::timestamptz`
    : 'now()';
  // Someone who reached the funnel only after that moment was not in it yet.
  const stepEnteredFilterSql = isDefined(windowsClosedAtParameter)
    ? ` WHERE ps.entered_at < ${windowsClosedAtSql}`
    : '';
  const overallEnteredFilterSql = isDefined(windowsClosedAtParameter)
    ? ` AND e.entered_at < ${windowsClosedAtSql}`
    : '';

  return `funnel_group AS (${groupSql}),
step_row AS (
  SELECT g.group_key, ps.person_id, ps.stage_key, ps.entered_at, ps.next_at,
    ps.entered_at + ps.window_days * interval '1 day' AS window_end
  FROM person_step ps JOIN funnel_group g ON g.person_id = ps.person_id${stepEnteredFilterSql}),
step_exit AS (
  SELECT DISTINCT r.group_key, r.person_id, r.stage_key
  FROM step_row r JOIN transition t ON t.person_id = r.person_id
  WHERE t.to_kind = 'EXIT' AND t.happened_at >= r.entered_at AND t.happened_at <= r.window_end),
step_total AS (
  SELECT r.group_key, r.stage_key,
    count(*)::int AS entered,
    count(*) FILTER (WHERE r.window_end <= ${windowsClosedAtSql})::int AS eligible,
    count(*) FILTER (WHERE r.window_end <= ${windowsClosedAtSql} AND r.next_at <= r.window_end)::int AS reached_next,
    count(*) FILTER (WHERE r.window_end <= ${windowsClosedAtSql} AND (r.next_at IS NULL OR r.next_at > r.window_end) AND x.person_id IS NOT NULL)::int AS exited,
    count(r.next_at)::int AS reached_so_far
  FROM step_row r
  LEFT JOIN step_exit x ON x.group_key = r.group_key AND x.person_id = r.person_id AND x.stage_key = r.stage_key
  GROUP BY r.group_key, r.stage_key),
overall_row AS (
  SELECT g.group_key, e.entered_at + ${overallWindowParameter}::int * interval '1 day' AS window_end, f.entered_at AS success_at
  FROM person_step e
  JOIN funnel_group g ON g.person_id = e.person_id
  LEFT JOIN person_step f ON f.person_id = e.person_id AND f.stage_key = ${successStageParameter}::text
  WHERE e.rank = ${entryRankParameter}::int${overallEnteredFilterSql}),
overall_total AS (
  SELECT o.group_key,
    count(*)::int AS entered,
    count(*) FILTER (WHERE o.window_end <= ${windowsClosedAtSql})::int AS eligible,
    count(*) FILTER (WHERE o.window_end <= ${windowsClosedAtSql} AND o.success_at <= o.window_end)::int AS reached,
    count(o.success_at)::int AS reached_so_far
  FROM overall_row o
  GROUP BY o.group_key)`;
};

const FUNNEL_SELECT_SQL = `SELECT a.group_key, a.entered, a.eligible, a.reached, a.reached_so_far,
  (SELECT json_agg(json_build_object(
      'stage_key', t.stage_key, 'entered', t.entered, 'eligible', t.eligible,
      'reached_next', t.reached_next, 'exited', t.exited, 'reached_so_far', t.reached_so_far))
    FROM step_total t WHERE t.group_key = a.group_key) AS steps
FROM overall_total a`;

const parseFunnelGroup = (row: SqlRow): FunnelGroup => ({
  entered: toCount(row.entered),
  overallEligible: toCount(row.eligible),
  overallReached: toCount(row.reached),
  overallReachedSoFar: toCount(row.reached_so_far),
  steps: new Map(
    ((row.steps ?? []) as SqlRow[]).map((step): [string, StepTotals] => [
      String(step.stage_key),
      {
        entered: toCount(step.entered),
        eligible: toCount(step.eligible),
        reachedNext: toCount(step.reached_next),
        exited: toCount(step.exited),
        reachedSoFar: toCount(step.reached_so_far),
      },
    ]),
  ),
});

// The created-at row opens a stay in the initial stage. Rows whose stage key does not
// change are dropped, so reminder moves stay inside a stage.
const STAY_CTES = `stay_event AS (
  SELECT c.person_id, c.initial_key AS stage_key, c.created_at AS happened_at, NULL::text AS origin, 0 AS event_order
  FROM cohort c
  UNION ALL
  SELECT t.person_id, t.to_key, t.happened_at, t.origin, 1
  FROM transition t JOIN cohort c ON c.person_id = t.person_id),
ordered_event AS (
  SELECT e.person_id, e.stage_key, e.happened_at, e.origin, e.event_order,
    row_number() OVER person_events AS event_number,
    lag(e.stage_key) OVER person_events AS previous_key
  FROM stay_event e
  WINDOW person_events AS (PARTITION BY e.person_id ORDER BY e.happened_at, e.event_order)),
kept_event AS (
  SELECT o.person_id, o.stage_key, o.happened_at, o.origin, o.event_order
  FROM ordered_event o
  WHERE o.event_number = 1 OR o.previous_key IS DISTINCT FROM o.stage_key),
stay AS (
  SELECT k.person_id, k.stage_key, k.happened_at AS started_at, k.origin AS started_origin,
    lead(k.happened_at) OVER next_kept AS ended_at,
    lead(k.origin) OVER next_kept AS ended_origin
  FROM kept_event k
  WINDOW next_kept AS (PARTITION BY k.person_id ORDER BY k.happened_at, k.event_order)),
completed_stay AS (
  SELECT st.stage_key, st.ended_at, (extract(epoch FROM st.ended_at - st.started_at) / 86400)::float8 AS stay_days
  FROM stay st
  WHERE st.stage_key IS NOT NULL AND st.ended_at IS NOT NULL
    AND st.started_origin IS DISTINCT FROM 'reconcile' AND st.ended_origin IS DISTINCT FROM 'reconcile')`;

const buildStageClockCtes = (statement: SqlStatement): string => `latest_entry AS (
  SELECT DISTINCT ON (t.person_id) t.person_id, t.happened_at, t.origin
  FROM transition t JOIN scope s ON s.person_id = t.person_id
  WHERE t.to_key = s.current_key AND t.from_key IS DISTINCT FROM t.to_key
  ORDER BY t.person_id, t.happened_at DESC),
moved_person AS (SELECT DISTINCT t.person_id FROM transition t),
stage_clock AS (
  SELECT s.person_id, s.current_key, m.limit_days,
    s.created_at < $2 AND mp.person_id IS NULL AS is_inactive,
    CASE WHEN e.person_id IS NOT NULL THEN e.happened_at WHEN s.created_at >= $2 THEN s.created_at END AS stage_entered_at,
    e.origin IS NOT DISTINCT FROM 'reconcile' AS is_lower_bound
  FROM scope s
  JOIN stage_map m ON m.raw_stage = s.raw_stage
  LEFT JOIN latest_entry e ON e.person_id = s.person_id
  LEFT JOIN moved_person mp ON mp.person_id = s.person_id
  WHERE ${buildActiveConditionSql(statement, 's.current_kind', 's.current_key')}),
stage_age AS (
  SELECT c.person_id, c.current_key, c.limit_days, c.is_inactive, c.stage_entered_at, c.is_lower_bound,
    floor(extract(epoch FROM now() - c.stage_entered_at) / 86400)::int AS days_in_stage
  FROM stage_clock c)`;

const STUCK_CONDITION_SQL =
  'NOT a.is_inactive AND a.days_in_stage > a.limit_days';

const buildCategoryMemberCtes = ({
  statement,
  groupBy,
  personFilter,
}: {
  statement: SqlStatement;
  groupBy: AnalyticsCategoryGroupBy;
  personFilter: CrmAnalyticsPersonFilter;
}): string => {
  if (groupBy === 'SOURCE') {
    return `category_member AS (
  SELECT s.person_id, COALESCE(NULLIF(s.source, ''), '${NONE_CATEGORY_KEY}') AS category_key, NULL::text AS parent_key
  FROM scope s)`;
  }

  const trackKeySql = `COALESCE(pm.track_key, '${UNMAPPED_CATEGORY_KEY}')`;
  // Scope keeps anyone with one matching position, so their other positions stop here;
  // otherwise the rows would list tracks and programs outside the filter.
  const positionConditions = [
    ...(isDefined(personFilter.trackKey)
      ? [`${trackKeySql} = ${statement.bind(personFilter.trackKey)}::text`]
      : []),
    ...(isDefined(personFilter.programKey)
      ? [
          `position_row.position_value = ${statement.bind(personFilter.programKey)}::text`,
        ]
      : []),
  ];

  return `person_position AS (
  SELECT DISTINCT s.person_id, position_row.position_value AS position_key,
    ${trackKeySql} AS track_key
  FROM scope s
  CROSS JOIN LATERAL unnest(s.positions) AS position_row (position_value)
  LEFT JOIN position_map pm ON pm.raw_position = position_row.position_value
  WHERE ${isNonEmptyArray(positionConditions) ? positionConditions.join(' AND ') : 'TRUE'}),
category_member AS (
  SELECT pp.person_id, pp.position_key AS category_key, pp.track_key AS parent_key
  FROM person_position pp
  UNION ALL
  SELECT DISTINCT pp.person_id, pp.track_key, NULL::text
  FROM person_position pp
  UNION ALL
  SELECT s.person_id, '${NONE_CATEGORY_KEY}'::text, NULL::text
  FROM scope s WHERE cardinality(s.positions) = 0)`;
};

const CATEGORY_GROUP_KEY_SQL = `COALESCE(cm.parent_key, '') || '${CATEGORY_GROUP_SEPARATOR}' || cm.category_key`;

const buildCategoryGroupKey = (
  parentKey: unknown,
  categoryKey: unknown,
): string =>
  `${isNonEmptyString(parentKey) ? parentKey : ''}${CATEGORY_GROUP_SEPARATOR}${String(categoryKey)}`;

const parseCategoryGroupKey = (
  groupKey: string,
): { parentKey: string | null; key: string } => {
  const separatorIndex = groupKey.indexOf(CATEGORY_GROUP_SEPARATOR);
  const parentKey = groupKey.slice(0, separatorIndex);

  return {
    parentKey: isNonEmptyString(parentKey) ? parentKey : null,
    key: groupKey.slice(separatorIndex + CATEGORY_GROUP_SEPARATOR.length),
  };
};

// Unmapped and no-value rows sit under the real categories, whatever their size.
const computeCategoryRowOrder = ({
  key,
  isUnmapped,
}: Pick<AnalyticsCategoryRow, 'key' | 'isUnmapped'>): number => {
  if (key === NONE_CATEGORY_KEY) {
    return 2;
  }

  return isUnmapped ? 1 : 0;
};

const compareCategoryRows = (
  first: Pick<AnalyticsCategoryRow, 'key' | 'isUnmapped' | 'people'>,
  second: Pick<AnalyticsCategoryRow, 'key' | 'isUnmapped' | 'people'>,
): number => {
  const orderDifference =
    computeCategoryRowOrder(first) - computeCategoryRowOrder(second);

  if (orderDifference !== 0) {
    return orderDifference;
  }

  if (first.people !== second.people) {
    return second.people - first.people;
  }

  return first.key < second.key ? -1 : 1;
};

const computeOverallRate = (group: FunnelGroup): number | null =>
  isDefined(SUCCESS_STAGE_KEY)
    ? computeRate(group.overallReached, group.overallEligible)
    : null;

const computeOverallSoFarRate = (group: FunnelGroup): number | null =>
  isDefined(SUCCESS_STAGE_KEY)
    ? computeRate(group.overallReachedSoFar, group.entered)
    : null;

// Final stage: no next stage, so the step columns stay 0 or null.
const buildFunnelRow = ({
  stage,
  group,
  durations,
}: {
  stage: CrmAnalyticsStageConfig;
  group: FunnelGroup;
  durations: Map<string, { medianDays: number; completedStays: number }>;
}): AnalyticsFunnelRow => {
  const hasNextStage = isDefined(stage.windowDays);
  const step = group.steps.get(stage.stageKey) ?? EMPTY_STEP_TOTALS;
  const eligible = hasNextStage ? step.eligible : 0;
  const reachedNext = hasNextStage ? step.reachedNext : 0;
  const exited = hasNextStage ? step.exited : 0;
  const duration = durations.get(stage.stageKey);

  return {
    stageKey: stage.stageKey,
    label: stage.label,
    windowDays: stage.windowDays,
    entered: step.entered,
    eligible,
    reachedNext,
    timedOut: eligible - reachedNext - exited,
    exited,
    inWindow: hasNextStage ? step.entered - eligible : 0,
    stepRate: computeRate(reachedNext, eligible),
    soFarRate: hasNextStage ? computeRate(step.reachedSoFar, step.entered) : null,
    dropOffRate: computeRate(eligible - reachedNext, eligible),
    isUnderMinimum: eligible < CRM_ANALYTICS_CONFIG.minimumSample,
    medianDays: duration?.medianDays ?? null,
    completedStays: duration?.completedStays ?? 0,
  };
};

// The first step is named only when no later step has enough people to qualify.
const computeLowestStepStageKey = (
  rows: AnalyticsFunnelRow[],
): string | null => {
  const qualifyingRows = rows.filter(
    (row) =>
      isDefined(row.stepRate) &&
      row.eligible >= CRM_ANALYTICS_CONFIG.minimumSample,
  );
  const laterRows = qualifyingRows.filter(
    (row) => row.stageKey !== rows[0]?.stageKey,
  );
  const candidateRows = laterRows.length > 0 ? laterRows : qualifyingRows;

  const lowestRow = candidateRows.reduce<AnalyticsFunnelRow | undefined>(
    (lowest, row) =>
      !isDefined(lowest) || (row.stepRate ?? 0) < (lowest.stepRate ?? 0)
        ? row
        : lowest,
    undefined,
  );

  return lowestRow?.stageKey ?? null;
};

const buildCohortRow = (
  bucketStart: string,
  group: FunnelGroup,
): AnalyticsCohortRow => ({
  bucketStart,
  size: group.entered,
  cells: STEP_STAGES.map((stage) => {
    const step = group.steps.get(stage.stageKey) ?? EMPTY_STEP_TOTALS;
    const isMature = step.eligible === step.entered;

    return {
      stageKey: stage.stageKey,
      entered: step.entered,
      eligible: step.eligible,
      rate: isMature ? computeRate(step.reachedNext, step.eligible) : null,
      soFarRate: computeRate(step.reachedSoFar, step.entered),
      isMature,
    };
  }),
  overallRate:
    group.overallEligible === group.entered ? computeOverallRate(group) : null,
  overallSoFarRate: computeOverallSoFarRate(group),
});

const buildTrendSeries = (
  buckets: CrmAnalyticsTrendBucket[],
  readValue: (bucketStart: string) => TrendValue,
  isRateMetric: boolean,
): AnalyticsTrendPoint[] =>
  buckets.map(({ bucketStart, previousBucketStart, isPartial }) => {
    const current = readValue(bucketStart);
    const previous = readValue(previousBucketStart);

    return {
      bucketStart,
      value: current.value,
      previousValue: previous.value,
      size: current.size,
      previousSize: isRateMetric ? previous.size : null,
      isPartial,
    };
  });

const computeLastBucketDay = (
  { bucketStart }: CrmAnalyticsTrendBucket,
  period: AnalyticsPeriod,
): string =>
  addCrmAnalyticsLocalDays(addCrmAnalyticsPeriods(bucketStart, period, 1), -1);

// A rate waits until everyone in the bucket is past the window, so the line stops
// instead of dipping towards 0 while the newest people are still in progress.
const readRateTrendValue = ({
  group,
  metric,
  stageKey,
}: {
  group: FunnelGroup | undefined;
  metric: AnalyticsTrendMetric;
  stageKey: string | null;
}): TrendValue => {
  if (!isDefined(group)) {
    return { value: null, size: 0 };
  }

  if (metric === 'OVERALL_CONVERSION') {
    return {
      value:
        group.overallEligible === group.entered
          ? computeOverallRate(group)
          : null,
      size: group.entered,
    };
  }

  const step = group.steps.get(stageKey ?? '') ?? EMPTY_STEP_TOTALS;

  return {
    value:
      step.eligible === step.entered
        ? computeRate(step.eligible - step.reachedNext, step.eligible)
        : null,
    size: step.entered,
  };
};

const resolveSnapshotDimension = (
  filter: CrmAnalyticsPersonFilter,
): { dimension: string; dimensionKey: string } | null => {
  // A program inside the chosen track already implies that track.
  const isTrackImplied =
    isDefined(filter.programKey) &&
    TRACK_KEY_BY_POSITION.get(filter.programKey) === filter.trackKey;

  const dimensions = [
    ...(isDefined(filter.trackKey) && !isTrackImplied
      ? [{ dimension: 'track', dimensionKey: filter.trackKey }]
      : []),
    ...(isDefined(filter.programKey)
      ? [{ dimension: 'position', dimensionKey: filter.programKey }]
      : []),
    ...(isDefined(filter.sourceKey)
      ? [{ dimension: 'source', dimensionKey: filter.sourceKey }]
      : []),
  ];

  if (dimensions.length > 1) {
    return null;
  }

  return dimensions[0] ?? { dimension: 'all', dimensionKey: '' };
};

@Injectable()
export class CrmAnalyticsMetricsService {
  constructor(
    private readonly databaseService: CrmAnalyticsDatabaseService,
    private readonly facadeService: CrmAnalyticsFacadeService,
    private readonly settingsService: CrmAnalyticsSettingsService,
  ) {}

  async getOverview({
    workspaceId,
    filter,
  }: {
    workspaceId: string;
    filter: AnalyticsFilter;
  }): Promise<AnalyticsOverview | null> {
    return this.runPageRead(workspaceId, (context) =>
      this.computeOverview(context, filter),
    );
  }

  async getFunnel({
    workspaceId,
    filter,
  }: {
    workspaceId: string;
    filter: AnalyticsFilter;
  }): Promise<AnalyticsFunnel | null> {
    return this.runPageRead(workspaceId, (context) =>
      this.computeFunnel({
        context,
        personFilter: filter,
        cohortDateRange: { from: filter.dateFrom, to: filter.dateTo },
      }),
    );
  }

  async getCategories({
    workspaceId,
    filter,
    groupBy,
  }: {
    workspaceId: string;
    filter: AnalyticsFilter;
    groupBy: AnalyticsCategoryGroupBy;
  }): Promise<AnalyticsCategories | null> {
    return this.runPageRead(workspaceId, (context) => {
      const dateRange = { from: filter.dateFrom, to: filter.dateTo };

      return this.computeCategories({
        context,
        personFilter: filter,
        groupBy,
        peopleDateRange: dateRange,
        submissionRange: this.resolveNewApplicationRanges(context, filter)
          .current,
        cohortDateRange: dateRange,
      });
    });
  }

  async getTrends({
    workspaceId,
    filter,
    metric,
    stageKey,
  }: {
    workspaceId: string;
    filter: AnalyticsFilter;
    metric: AnalyticsTrendMetric;
    stageKey: string | null;
  }): Promise<AnalyticsTrends | null> {
    return this.runPageRead(workspaceId, (context) =>
      this.computeTrends({ context, filter, metric, stageKey }),
    );
  }

  async getSeries({
    workspaceId,
    filter,
    requests,
  }: {
    workspaceId: string;
    filter: AnalyticsFilter;
    requests: AnalyticsSeriesRequest[];
  }): Promise<AnalyticsSeriesBundle | null> {
    return this.runPageRead(workspaceId, (context) =>
      this.computeSeriesBundle({ context, filter, requests }),
    );
  }

  async buildQueryContext({
    state,
    trackingStart,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    trackingStart: string;
    run: CrmAnalyticsSqlRunner;
  }): Promise<CrmAnalyticsQueryContext> {
    const timeZone = CRM_ANALYTICS_CONFIG.reportingTimeZone;
    const localTodaySql = buildCrmAnalyticsLocalDateSql({
      columnSql: 'now()',
      timeZoneParameter: '$1',
    });

    const rows = await run(
      `SELECT now() AS as_of, ${localTodaySql}::date::text AS local_today,
  to_regclass('analytics.sync_log') IS NOT NULL AS has_storage`,
      [timeZone],
    );

    return {
      state,
      run,
      trackingStart,
      timeZone,
      asOf: toCrmAnalyticsIsoString(rows[0]?.as_of),
      localToday: String(rows[0]?.local_today),
      hasStorage: rows[0]?.has_storage === true,
    };
  }

  // Imported applications have no dates and stage moves are read only from tracking
  // start, so a period that starts before it has no known total, whatever rows it holds.
  hasRangeStartedBeforeTracking(
    context: CrmAnalyticsQueryContext,
    { from }: CrmAnalyticsClosedDateRange,
  ): boolean {
    return (
      from <
      computeCrmAnalyticsLocalDate(context.trackingStart, context.timeZone)
    );
  }

  // For a frozen report: buckets end at lastDay whenever this runs, and a rate counts
  // only windows closed by then, so a backfill matches a report built on time.
  async computeReportSeries({
    context,
    metric,
    period,
    lastDay,
    windowsClosedAt,
  }: {
    context: CrmAnalyticsQueryContext;
    metric: AnalyticsTrendMetric;
    period: AnalyticsPeriod;
    lastDay: string;
    windowsClosedAt: string;
  }): Promise<AnalyticsSeries> {
    const stageKey = this.resolveTrendStageKey(metric, null);
    const { series: points, unavailableReason } = await this.computeTrendSeries(
      {
        context,
        filter: {
          ...CRM_ANALYTICS_NO_PERSON_FILTER,
          dateFrom: null,
          dateTo: lastDay,
          period,
        },
        metric,
        stageKey,
        windowsClosedAt,
      },
    );

    return {
      metric,
      stageKey,
      groupKey: null,
      groupLabel: null,
      unavailableReason,
      points,
    };
  }

  async computeNewApplications({
    context,
    personFilter,
    range,
    previousRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    range: CrmAnalyticsClosedDateRange;
    previousRange: CrmAnalyticsClosedDateRange;
  }): Promise<{ current: number | null; previous: number | null }> {
    const submissionRelationSql =
      this.facadeService.buildApplicationSubmissionRelationSql(context.state);

    if (!isDefined(submissionRelationSql)) {
      return { current: null, previous: null };
    }

    const statement = this.createBaseStatement({ context, personFilter });
    const localDateSql = `${statement.localDate('sub.submitted_at')}::date`;

    const rows = await context.run(
      `${joinCtes(statement.withSql, `submission AS (${submissionRelationSql})`)}
SELECT
  count(*) FILTER (WHERE ${localDateSql} >= ${statement.bind(range.from)}::date AND ${localDateSql} <= ${statement.bind(range.to)}::date)::int AS current_count,
  count(*) FILTER (WHERE ${localDateSql} >= ${statement.bind(previousRange.from)}::date AND ${localDateSql} <= ${statement.bind(previousRange.to)}::date)::int AS previous_count
FROM submission sub${this.buildSubmissionScopeJoinSql(personFilter)}`,
      statement.parameters,
    );

    return {
      current: toCount(rows[0]?.current_count),
      previous: this.hasRangeStartedBeforeTracking(context, previousRange)
        ? null
        : toCount(rows[0]?.previous_count),
    };
  }

  async computeFunnel({
    context,
    personFilter,
    cohortDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    cohortDateRange: CrmAnalyticsDateRange;
  }): Promise<AnalyticsFunnel> {
    const groups = await this.readFunnelGroups({
      context,
      personFilter,
      cohortDateRange,
      buildGroupSql: () => `SELECT c.person_id, ''::text AS group_key FROM cohort c`,
    });
    const group = groups.get('') ?? EMPTY_FUNNEL_GROUP;

    const durationStatement = this.createBaseStatement({
      context,
      personFilter: withoutStatusFilter(personFilter),
      cohortDateRange,
    });
    const durationRows = await context.run(
      `${joinCtes(durationStatement.withSql, STAY_CTES)}
SELECT cs.stage_key, percentile_cont(0.5) WITHIN GROUP (ORDER BY cs.stay_days) AS median_days,
  count(*)::int AS completed_stays
FROM completed_stay cs
GROUP BY cs.stage_key`,
      durationStatement.parameters,
    );
    const durations = new Map(
      durationRows.map(
        (row): [string, { medianDays: number; completedStays: number }] => [
          String(row.stage_key),
          {
            medianDays: roundDays(Number(row.median_days)),
            completedStays: toCount(row.completed_stays),
          },
        ],
      ),
    );

    const rows = RANKED_STAGES.map((stage) =>
      buildFunnelRow({ stage, group, durations }),
    );

    return {
      ...this.buildBase(context),
      cohortSize: group.entered,
      cohortExcludedUnmapped: await this.countCohortExcludedUnmapped({
        context,
        personFilter: withoutStatusFilter(personFilter),
        cohortDateRange,
      }),
      overall: {
        finalStageKey: SUCCESS_STAGE_KEY,
        windowDays: CRM_ANALYTICS_CONFIG.overallWindowDays,
        eligible: group.overallEligible,
        reached: group.overallReached,
        rate: computeOverallRate(group),
        soFarRate: computeOverallSoFarRate(group),
        isUnderMinimum:
          group.overallEligible < CRM_ANALYTICS_CONFIG.minimumSample,
      },
      rows,
      lowestStepStageKey: computeLowestStepStageKey(rows),
    };
  }

  async computeCategories({
    context,
    personFilter,
    groupBy,
    peopleDateRange,
    submissionRange,
    cohortDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    groupBy: AnalyticsCategoryGroupBy;
    peopleDateRange: CrmAnalyticsDateRange;
    submissionRange: CrmAnalyticsClosedDateRange;
    cohortDateRange: CrmAnalyticsDateRange;
  }): Promise<AnalyticsCategories> {
    const peopleRows = await this.readCategoryPeople({
      context,
      personFilter,
      groupBy,
      peopleDateRange,
    });

    const overlap = await this.readCategoryOverlap({
      context,
      personFilter,
      groupBy,
      peopleDateRange,
    });
    const newApplicationCounts = await this.readCategoryNewApplications({
      context,
      personFilter,
      groupBy,
      submissionRange,
    });
    const funnelGroups = await this.readFunnelGroups({
      context,
      personFilter,
      cohortDateRange,
      buildExtraCtes: (statement) =>
        buildCategoryMemberCtes({ statement, groupBy, personFilter }),
      buildGroupSql: () =>
        `SELECT cm.person_id, ${CATEGORY_GROUP_KEY_SQL} AS group_key FROM category_member cm`,
    });

    const peopleByGroup = new Map(
      peopleRows.map((row): [string, SqlRow] => [
        buildCategoryGroupKey(row.parent_key, row.category_key),
        row,
      ]),
    );
    const groupKeys = new Set([
      ...peopleByGroup.keys(),
      ...(newApplicationCounts?.keys() ?? []),
      ...funnelGroups.keys(),
    ]);

    const rows = [...groupKeys].map((groupKey): AnalyticsCategoryRow => {
      const { parentKey, key } = parseCategoryGroupKey(groupKey);
      const peopleRow = peopleByGroup.get(groupKey);
      const group = funnelGroups.get(groupKey) ?? EMPTY_FUNNEL_GROUP;

      return {
        key,
        parentKey,
        label: this.buildCategoryLabel({
          state: context.state,
          groupBy,
          parentKey,
          key,
        }),
        isUnmapped: this.isCategoryUnmapped({
          state: context.state,
          groupBy,
          parentKey,
          key,
        }),
        people: toCount(peopleRow?.people),
        activePeople: toCount(peopleRow?.active_people),
        newApplications: isDefined(newApplicationCounts)
          ? (newApplicationCounts.get(groupKey) ?? 0)
          : null,
        cohortSize: group.entered,
        overallEligible: group.overallEligible,
        overallRate: computeOverallRate(group),
        overallSoFarRate: computeOverallSoFarRate(group),
        stepRates: STEP_STAGES.map((stage) => {
          const step = group.steps.get(stage.stageKey) ?? EMPTY_STEP_TOTALS;

          return {
            stageKey: stage.stageKey,
            eligible: step.eligible,
            rate: computeRate(step.reachedNext, step.eligible),
            soFarRate: computeRate(step.reachedSoFar, step.entered),
          };
        }),
      };
    });

    const orderedRows = rows
      .filter((row) => !isDefined(row.parentKey))
      .sort(compareCategoryRows)
      .flatMap((topRow) => [
        topRow,
        ...rows
          .filter((row) => row.parentKey === topRow.key)
          .sort(compareCategoryRows),
      ]);

    return {
      ...this.buildBase(context),
      groupBy,
      ...overlap,
      stepStageKeys: STEP_STAGES.map((stage) => stage.stageKey),
      rows: orderedRows,
    };
  }

  async computeMovement({
    context,
    personFilter,
    range,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    range: CrmAnalyticsClosedDateRange;
  }): Promise<AnalyticsMovementRow[]> {
    // No date on scope: movement goes by event date and includes imported people.
    const statement = this.createBaseStatement({ context, personFilter });
    const localDateSql = `${statement.localDate('t.happened_at')}::date`;

    const rows = await context.run(
      `${joinCtes(
        statement.withSql,
        `period_move AS (
  SELECT t.from_key, t.to_key
  FROM transition t JOIN scope s ON s.person_id = t.person_id
  WHERE ${localDateSql} >= ${statement.bind(range.from)}::date AND ${localDateSql} <= ${statement.bind(range.to)}::date
    AND t.from_key IS DISTINCT FROM t.to_key)`,
        `entered_total AS (
  SELECT mv.to_key AS stage_key, count(*) AS moved
  FROM period_move mv WHERE mv.to_key IS NOT NULL GROUP BY mv.to_key)`,
        `left_total AS (
  SELECT mv.from_key AS stage_key, count(*) AS moved
  FROM period_move mv WHERE mv.from_key IS NOT NULL GROUP BY mv.from_key)`,
        `current_total AS (
  SELECT s.current_key AS stage_key, count(*) AS people
  FROM scope s WHERE s.current_key IS NOT NULL GROUP BY s.current_key)`,
      )}
SELECT k.stage_key, COALESCE(e.moved, 0)::int AS entered_in_period,
  COALESCE(l.moved, 0)::int AS left_in_period, COALESCE(c.people, 0)::int AS count_now
FROM (SELECT DISTINCT sm.stage_key FROM stage_map sm) k
LEFT JOIN entered_total e ON e.stage_key = k.stage_key
LEFT JOIN left_total l ON l.stage_key = k.stage_key
LEFT JOIN current_total c ON c.stage_key = k.stage_key`,
      statement.parameters,
    );

    const rowByStage = new Map(
      rows.map((row): [string, SqlRow] => [String(row.stage_key), row]),
    );

    return CRM_ANALYTICS_CONFIG.stages.map((stage) => {
      const row = rowByStage.get(stage.stageKey);

      return {
        stageKey: stage.stageKey,
        label: stage.label,
        enteredInPeriod: toCount(row?.entered_in_period),
        leftInPeriod: toCount(row?.left_in_period),
        countNow: toCount(row?.count_now),
      };
    });
  }

  async computeStuckByStage({
    context,
    personFilter,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
  }): Promise<{ stageKey: string; label: string; count: number }[]> {
    const { stuckByStage } = await this.readStageClockTotals({
      context,
      personFilter,
      scopeDateRange: CRM_ANALYTICS_NO_DATE_RANGE,
    });

    return CRM_ANALYTICS_CONFIG.stages
      .filter((stage) => isDefined(stage.limitDays))
      .map((stage) => ({
        stageKey: stage.stageKey,
        label: stage.label,
        count: stuckByStage.get(stage.stageKey) ?? 0,
      }));
  }

  async computeCohorts({
    context,
    personFilter,
    period,
    cohortDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    period: AnalyticsPeriod;
    cohortDateRange: CrmAnalyticsDateRange;
  }): Promise<AnalyticsCohortRow[]> {
    const groups = await this.readFunnelGroups({
      context,
      personFilter,
      cohortDateRange,
      buildGroupSql: (statement) =>
        `SELECT c.person_id, ${buildBucketSql(statement, period, 'c.created_at')} AS group_key FROM cohort c`,
    });

    return [...groups.entries()]
      .sort(([firstBucket], [secondBucket]) =>
        firstBucket < secondBucket ? -1 : 1,
      )
      .map(([bucketStart, group]) => buildCohortRow(bucketStart, group));
  }

  private async runPageRead<TResult>(
    workspaceId: string,
    work: (context: CrmAnalyticsQueryContext) => Promise<TResult>,
  ): Promise<TResult | null> {
    if (await this.settingsService.isDisabled(workspaceId)) {
      return null;
    }

    const state = await this.facadeService.getCrmState(workspaceId);
    const trackingStart =
      await this.settingsService.getTrackingStart(workspaceId);

    return this.databaseService.runPageTransaction(workspaceId, async (run) => {
      const context = await this.buildQueryContext({
        state,
        trackingStart,
        run,
      });

      // Page transactions never create storage; the page shows NEVER_SYNCED instead.
      return context.hasStorage ? work(context) : null;
    });
  }

  private buildBase(context: CrmAnalyticsQueryContext): AnalyticsBase {
    return {
      asOf: context.asOf,
      trackingStartedAt: context.trackingStart,
      reportingTimeZone: context.timeZone,
      minimumSample: CRM_ANALYTICS_CONFIG.minimumSample,
    };
  }

  private createBaseStatement({
    context,
    personFilter,
    scopeDateRange = CRM_ANALYTICS_NO_DATE_RANGE,
    cohortDateRange = CRM_ANALYTICS_NO_DATE_RANGE,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    scopeDateRange?: CrmAnalyticsDateRange;
    cohortDateRange?: CrmAnalyticsDateRange;
  }): BaseSqlStatement {
    const statement = createSqlStatement(
      [context.state.workspaceId, context.trackingStart],
      context.timeZone,
    );

    const baseCtes = buildCrmAnalyticsBaseCtes({
      personRelationSql: this.facadeService.buildPersonRelationSql(
        context.state,
      ),
      scopeFilterSql: [
        ...buildPersonFilterConditions(statement, personFilter),
        ...buildCurrentStateDateConditions(statement, scopeDateRange),
      ].join(' AND '),
      cohortDateFilterSql: buildLocalDateRangeConditions(
        statement,
        's.created_at',
        cohortDateRange,
      ).join(' AND '),
    });

    return {
      ...statement,
      withSql: `WITH ${joinCtes(buildCrmAnalyticsMappingCtes(), baseCtes)}`,
    };
  }

  private buildSubmissionScopeJoinSql(
    personFilter: CrmAnalyticsPersonFilter,
  ): string {
    return hasPersonFilter(personFilter)
      ? ' JOIN scope s ON s.person_id = sub.person_id'
      : '';
  }

  private resolveNewApplicationRanges(
    context: CrmAnalyticsQueryContext,
    { dateFrom, dateTo }: Pick<AnalyticsFilter, 'dateFrom' | 'dateTo'>,
  ): {
    current: CrmAnalyticsClosedDateRange;
    previous: CrmAnalyticsClosedDateRange;
  } {
    const hasDateFilter = isDefined(dateFrom) || isDefined(dateTo);
    const to = dateTo ?? context.localToday;
    const requestedFrom = hasDateFilter
      ? (dateFrom ??
        computeCrmAnalyticsLocalDate(context.trackingStart, context.timeZone))
      : addCrmAnalyticsLocalDays(context.localToday, -6);
    const from = requestedFrom > to ? to : requestedFrom;
    const dayCount = countCrmAnalyticsLocalDays(from, to);

    return {
      current: { from, to },
      previous: {
        from: addCrmAnalyticsLocalDays(from, -dayCount),
        to: addCrmAnalyticsLocalDays(from, -1),
      },
    };
  }

  private async computeOverview(
    context: CrmAnalyticsQueryContext,
    filter: AnalyticsFilter,
  ): Promise<AnalyticsOverview> {
    const dateRange = { from: filter.dateFrom, to: filter.dateTo };
    const hasDateFilter = isDefined(filter.dateFrom) || isDefined(filter.dateTo);

    const stageCounts = await this.readStageCounts({
      context,
      personFilter: filter,
      scopeDateRange: dateRange,
    });
    const { stuckByStage, stuckPeople, inactivePeople } =
      await this.readStageClockTotals({
        context,
        personFilter: filter,
        scopeDateRange: dateRange,
      });
    const stuck = await this.readStuckRows({
      context,
      personFilter: filter,
      scopeDateRange: dateRange,
    });

    const newApplicationRanges = this.resolveNewApplicationRanges(
      context,
      filter,
    );
    const newApplications = await this.computeNewApplications({
      context,
      personFilter: filter,
      range: newApplicationRanges.current,
      previousRange: newApplicationRanges.previous,
    });

    const totalContacts = [...stageCounts.values()].reduce(
      (total, count) => total + count,
      0,
    );

    const countPeopleWhere = (
      isIncluded: (stage: CrmAnalyticsStageConfig) => boolean,
    ): number =>
      [...stageCounts.entries()].reduce((total, [rawStage, count]) => {
        const stage = isDefined(rawStage)
          ? STAGE_BY_RAW_VALUE.get(rawStage)
          : undefined;

        return isDefined(stage) && isIncluded(stage) ? total + count : total;
      }, 0);

    return {
      ...this.buildBase(context),
      importedExcludedByDate: hasDateFilter
        ? await this.countImportedPeople(context, filter)
        : 0,
      figures: {
        totalContacts,
        activePeople: countPeopleWhere(
          (stage) => stage.kind !== 'EXIT' && !stage.isSuccess,
        ),
        newApplications: newApplications.current,
        newApplicationsPrevious: newApplications.previous,
        newApplicationsFrom: newApplicationRanges.current.from,
        newApplicationsTo: newApplicationRanges.current.to,
        importedApplications: await this.facadeService.countImportedApplications(
          { state: context.state, run: context.run },
        ),
        stuckPeople,
        inactivePeople,
        signedPeople: CRM_ANALYTICS_CONFIG.showSignedFigure
          ? countPeopleWhere((stage) => stage.isSuccess)
          : null,
      },
      stageTotals: this.buildStageTotals(
        context.state,
        stageCounts,
        stuckByStage,
      ),
      stuck,
    };
  }

  private async readStageCounts({
    context,
    personFilter,
    scopeDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    scopeDateRange: CrmAnalyticsDateRange;
  }): Promise<Map<string | null, number>> {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      scopeDateRange,
    });
    const rows = await context.run(
      `${statement.withSql}
SELECT s.raw_stage, count(*)::int AS person_count
FROM scope s
GROUP BY s.raw_stage`,
      statement.parameters,
    );

    const stageCounts = new Map<string | null, number>();

    for (const row of rows) {
      // A TEXT stage field stores no stage as an empty string.
      const rawStage = isNonEmptyString(row.raw_stage) ? row.raw_stage : null;

      stageCounts.set(
        rawStage,
        (stageCounts.get(rawStage) ?? 0) + toCount(row.person_count),
      );
    }

    return stageCounts;
  }

  private buildStageTotals(
    state: CrmAnalyticsCrmState,
    stageCounts: Map<string | null, number>,
    stuckByStage: Map<string, number>,
  ): AnalyticsStageTotalRow[] {
    const optionLabels = buildOptionLabels(state.stage.options);

    const mappedRows = CRM_ANALYTICS_CONFIG.stages.flatMap(
      (stage): AnalyticsStageTotalRow[] => {
        const rawCounts = stage.rawValues.map(({ rawValue }) => ({
          rawValue,
          count: stageCounts.get(rawValue) ?? 0,
        }));

        return [
          {
            rowKey: stage.stageKey,
            label: stage.label,
            rowKind: stage.kind,
            parentStageKey: null,
            count: rawCounts.reduce((total, { count }) => total + count, 0),
            pastLimitCount: isDefined(stage.limitDays)
              ? (stuckByStage.get(stage.stageKey) ?? 0)
              : null,
          },
          ...(rawCounts.length > 1
            ? rawCounts.map(({ rawValue, count }) => ({
                rowKey: `${stage.stageKey}:${rawValue}`,
                label: optionLabels.get(rawValue) ?? rawValue,
                rowKind: 'NESTED' as const,
                parentStageKey: stage.stageKey,
                count,
                pastLimitCount: null,
              }))
            : []),
        ];
      },
    );

    const unmappedRows = [...stageCounts.entries()]
      .flatMap(([rawStage, count]): AnalyticsStageTotalRow[] =>
        isDefined(rawStage) && !STAGE_BY_RAW_VALUE.has(rawStage)
          ? [
              {
                rowKey: `${UNMAPPED_CATEGORY_KEY}:${rawStage}`,
                label: rawStage,
                rowKind: 'UNMAPPED',
                parentStageKey: null,
                count,
                pastLimitCount: null,
              },
            ]
          : [],
      )
      .sort((first, second) => second.count - first.count);

    const noStageCount = stageCounts.get(null) ?? 0;

    return [
      ...mappedRows,
      ...unmappedRows,
      ...(noStageCount > 0
        ? [
            {
              rowKey: 'NO_STAGE',
              label: 'No stage',
              rowKind: 'NO_STAGE' as const,
              parentStageKey: null,
              count: noStageCount,
              pastLimitCount: null,
            },
          ]
        : []),
    ];
  }

  private async readStageClockTotals({
    context,
    personFilter,
    scopeDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    scopeDateRange: CrmAnalyticsDateRange;
  }): Promise<{
    stuckByStage: Map<string, number>;
    stuckPeople: number;
    inactivePeople: number;
  }> {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      scopeDateRange,
    });
    const rows = await context.run(
      `${joinCtes(statement.withSql, buildStageClockCtes(statement))}
SELECT a.current_key,
  count(*) FILTER (WHERE a.is_inactive)::int AS inactive_count,
  count(*) FILTER (WHERE ${STUCK_CONDITION_SQL})::int AS stuck_count
FROM stage_age a
GROUP BY a.current_key`,
      statement.parameters,
    );

    return {
      stuckByStage: new Map(
        rows.map((row): [string, number] => [
          String(row.current_key),
          toCount(row.stuck_count),
        ]),
      ),
      stuckPeople: rows.reduce(
        (total, row) => total + toCount(row.stuck_count),
        0,
      ),
      inactivePeople: rows.reduce(
        (total, row) => total + toCount(row.inactive_count),
        0,
      ),
    };
  }

  private async readStuckRows({
    context,
    personFilter,
    scopeDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    scopeDateRange: CrmAnalyticsDateRange;
  }): Promise<AnalyticsOverview['stuck']> {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      scopeDateRange,
    });
    // With no limits at all the list falls back to the longest stays, with a notice.
    const listConditionSql = HAS_STAGE_LIMITS
      ? STUCK_CONDITION_SQL
      : 'NOT a.is_inactive AND a.stage_entered_at IS NOT NULL';
    const orderSql = HAS_STAGE_LIMITS
      ? 'a.days_in_stage - a.limit_days DESC'
      : 'a.days_in_stage DESC';

    const rows = await context.run(
      `${joinCtes(statement.withSql, buildStageClockCtes(statement))}
SELECT a.person_id, a.current_key, a.stage_entered_at, a.days_in_stage,
  a.days_in_stage - a.limit_days AS days_over_limit, a.is_lower_bound,
  (count(*) OVER ())::int AS total_count
FROM stage_age a
WHERE ${listConditionSql}
ORDER BY ${orderSql}, a.person_id
LIMIT ${statement.bind(STUCK_ROWS_LIMIT)}::int`,
      statement.parameters,
    );

    const displayNames = await this.facadeService.getPersonDisplayNames({
      state: context.state,
      personIds: rows.map((row) => String(row.person_id)),
      run: context.run,
    });

    const stuckRows = rows.map((row): AnalyticsStuckRow => {
      const personId = String(row.person_id);
      const stageKey = String(row.current_key);

      return {
        personId,
        displayName: displayNames.get(personId) ?? '',
        stageKey,
        stageLabel: STAGE_BY_KEY.get(stageKey)?.label ?? stageKey,
        stageEnteredAt: toCrmAnalyticsIsoString(row.stage_entered_at),
        daysInStage: toCount(row.days_in_stage),
        daysOverLimit: isDefined(row.days_over_limit)
          ? toCount(row.days_over_limit)
          : null,
        isLowerBound: row.is_lower_bound === true,
      };
    });

    return {
      rows: stuckRows,
      total: toCount(rows[0]?.total_count),
      hasLimits: HAS_STAGE_LIMITS,
    };
  }

  private async countImportedPeople(
    context: CrmAnalyticsQueryContext,
    personFilter: CrmAnalyticsPersonFilter,
  ): Promise<number> {
    const statement = this.createBaseStatement({ context, personFilter });
    const rows = await context.run(
      `${statement.withSql}
SELECT count(*)::int AS imported_count
FROM scope s
WHERE s.created_at < $2`,
      statement.parameters,
    );

    return toCount(rows[0]?.imported_count);
  }

  private async countCohortExcludedUnmapped({
    context,
    personFilter,
    cohortDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    cohortDateRange: CrmAnalyticsDateRange;
  }): Promise<number> {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      cohortDateRange,
    });
    const rows = await context.run(
      `${joinCtes(
        statement.withSql,
        `mapped_mover AS (
  SELECT DISTINCT t.person_id FROM transition t
  WHERE t.from_key IS NOT NULL OR t.to_key IS NOT NULL)`,
      )}
SELECT count(*)::int AS excluded_count
FROM cohort c
JOIN scope s ON s.person_id = c.person_id
LEFT JOIN mapped_mover mm ON mm.person_id = c.person_id
WHERE COALESCE(s.raw_stage, '') <> '' AND s.current_key IS NULL AND mm.person_id IS NULL`,
      statement.parameters,
    );

    return toCount(rows[0]?.excluded_count);
  }

  private async readFunnelGroups({
    context,
    personFilter,
    cohortDateRange,
    buildExtraCtes,
    buildGroupSql,
    windowsClosedAt,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    cohortDateRange: CrmAnalyticsDateRange;
    buildExtraCtes?: (statement: SqlStatement) => string;
    buildGroupSql: (statement: SqlStatement) => string;
    windowsClosedAt?: string;
  }): Promise<Map<string, FunnelGroup>> {
    const statement = this.createBaseStatement({
      context,
      personFilter: withoutStatusFilter(personFilter),
      cohortDateRange,
    });
    const extraCtes = buildExtraCtes?.(statement) ?? '';
    const funnelCtes = buildFunnelCtes({
      groupSql: buildGroupSql(statement),
      overallWindowParameter: statement.bind(
        CRM_ANALYTICS_CONFIG.overallWindowDays,
      ),
      successStageParameter: statement.bind(SUCCESS_STAGE_KEY),
      entryRankParameter: statement.bind(ENTRY_RANK),
      windowsClosedAtParameter: isDefined(windowsClosedAt)
        ? statement.bind(windowsClosedAt)
        : undefined,
    });

    const rows = await context.run(
      `${joinCtes(statement.withSql, extraCtes, funnelCtes)}
${FUNNEL_SELECT_SQL}`,
      statement.parameters,
    );

    return new Map(
      rows.map((row): [string, FunnelGroup] => [
        String(row.group_key),
        parseFunnelGroup(row),
      ]),
    );
  }

  private async readCategoryPeople({
    context,
    personFilter,
    groupBy,
    peopleDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    groupBy: AnalyticsCategoryGroupBy;
    peopleDateRange: CrmAnalyticsDateRange;
  }): Promise<SqlRow[]> {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      scopeDateRange: peopleDateRange,
    });
    const activeConditionSql = buildActiveConditionSql(
      statement,
      's.current_kind',
      's.current_key',
    );

    return context.run(
      `${joinCtes(
        statement.withSql,
        buildCategoryMemberCtes({ statement, groupBy, personFilter }),
      )}
SELECT cm.parent_key, cm.category_key, count(*)::int AS people,
  count(*) FILTER (WHERE ${activeConditionSql})::int AS active_people
FROM category_member cm JOIN scope s ON s.person_id = cm.person_id
GROUP BY cm.parent_key, cm.category_key`,
      statement.parameters,
    );
  }

  private async readCategoryOverlap({
    context,
    personFilter,
    groupBy,
    peopleDateRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    groupBy: AnalyticsCategoryGroupBy;
    peopleDateRange: CrmAnalyticsDateRange;
  }): Promise<
    Pick<
      AnalyticsCategories,
      'distinctPeople' | 'peopleInSeveral' | 'peopleInSeveralTracks'
    >
  > {
    const statement = this.createBaseStatement({
      context,
      personFilter,
      scopeDateRange: peopleDateRange,
    });
    // Source is single-valued, so its rows add up and overlap is always 0.
    const overlapSql =
      groupBy === 'SOURCE'
        ? `${statement.withSql}
SELECT (SELECT count(*) FROM scope)::int AS distinct_people, 0 AS people_in_several, 0 AS people_in_several_tracks`
        : `${joinCtes(statement.withSql, buildCategoryMemberCtes({ statement, groupBy, personFilter }))}
SELECT (SELECT count(*) FROM scope)::int AS distinct_people,
  (SELECT count(*) FROM (
      SELECT pp.person_id FROM person_position pp GROUP BY pp.person_id HAVING count(*) >= 2) several)::int AS people_in_several,
  (SELECT count(*) FROM (
      SELECT pp.person_id FROM person_position pp GROUP BY pp.person_id HAVING count(DISTINCT pp.track_key) >= 2) several)::int AS people_in_several_tracks`;

    const rows = await context.run(overlapSql, statement.parameters);

    return {
      distinctPeople: toCount(rows[0]?.distinct_people),
      peopleInSeveral: toCount(rows[0]?.people_in_several),
      peopleInSeveralTracks: toCount(rows[0]?.people_in_several_tracks),
    };
  }

  private async readCategoryNewApplications({
    context,
    personFilter,
    groupBy,
    submissionRange,
  }: {
    context: CrmAnalyticsQueryContext;
    personFilter: CrmAnalyticsPersonFilter;
    groupBy: AnalyticsCategoryGroupBy;
    submissionRange: CrmAnalyticsClosedDateRange;
  }): Promise<Map<string, number> | null> {
    const submissionRelationSql =
      this.facadeService.buildApplicationSubmissionRelationSql(context.state);

    if (!isDefined(submissionRelationSql)) {
      return null;
    }

    const statement = this.createBaseStatement({ context, personFilter });
    const localDateSql = `${statement.localDate('sub.submitted_at')}::date`;

    const rows = await context.run(
      `${joinCtes(
        statement.withSql,
        buildCategoryMemberCtes({ statement, groupBy, personFilter }),
        `submission AS (${submissionRelationSql})`,
      )}
SELECT cm.parent_key, cm.category_key, count(*)::int AS new_applications
FROM submission sub JOIN category_member cm ON cm.person_id = sub.person_id
WHERE ${localDateSql} >= ${statement.bind(submissionRange.from)}::date AND ${localDateSql} <= ${statement.bind(submissionRange.to)}::date
GROUP BY cm.parent_key, cm.category_key`,
      statement.parameters,
    );

    return new Map(
      rows.map((row): [string, number] => [
        buildCategoryGroupKey(row.parent_key, row.category_key),
        toCount(row.new_applications),
      ]),
    );
  }

  private buildCategoryLabel({
    state,
    groupBy,
    parentKey,
    key,
  }: {
    state: CrmAnalyticsCrmState;
    groupBy: AnalyticsCategoryGroupBy;
    parentKey: string | null;
    key: string;
  }): string {
    if (groupBy === 'SOURCE') {
      return key === NONE_CATEGORY_KEY
        ? 'No source'
        : (buildOptionLabels(state.applicantSource.options).get(key) ?? key);
    }

    if (isDefined(parentKey)) {
      return (
        buildOptionLabels(state.positionsAppliedFor.options).get(key) ?? key
      );
    }

    if (key === NONE_CATEGORY_KEY) {
      return 'No position';
    }

    return key === UNMAPPED_CATEGORY_KEY
      ? 'Unmapped'
      : (TRACK_LABEL_BY_KEY.get(key) ?? key);
  }

  private isCategoryUnmapped({
    state,
    groupBy,
    parentKey,
    key,
  }: {
    state: CrmAnalyticsCrmState;
    groupBy: AnalyticsCategoryGroupBy;
    parentKey: string | null;
    key: string;
  }): boolean {
    if (groupBy === 'SOURCE') {
      // A TEXT source field has no option list to be missing from.
      const sourceOptions = state.applicantSource.options;

      return (
        key !== NONE_CATEGORY_KEY &&
        sourceOptions.length > 0 &&
        !sourceOptions.some(({ value }) => value === key)
      );
    }

    return (parentKey ?? key) === UNMAPPED_CATEGORY_KEY;
  }

  private async computeTrends({
    context,
    filter,
    metric,
    stageKey,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    metric: AnalyticsTrendMetric;
    stageKey: string | null;
  }): Promise<AnalyticsTrends> {
    const resolvedStageKey = this.resolveTrendStageKey(metric, stageKey);
    const { series, unavailableReason } = await this.computeTrendSeries({
      context,
      filter,
      metric,
      stageKey: resolvedStageKey,
    });

    const movementRange = this.resolveMovementRange(context, filter);

    return {
      ...this.buildBase(context),
      metric,
      stageKey: resolvedStageKey,
      period: filter.period,
      unavailableReason,
      series,
      cohorts: await this.computeTrendCohorts(context, filter, metric),
      movement: {
        ...movementRange,
        rows: await this.computeMovement({
          context,
          personFilter: filter,
          range: movementRange,
        }),
      },
    };
  }

  private async computeSeriesBundle({
    context,
    filter,
    requests,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    requests: AnalyticsSeriesRequest[];
  }): Promise<AnalyticsSeriesBundle> {
    const topSources = requests.some(({ groupBy }) => groupBy === 'SOURCE')
      ? await this.readTopSources(context, filter)
      : [];
    const series: AnalyticsSeries[] = [];

    // One transaction runs one statement at a time, so these stay sequential.
    for (const request of requests) {
      for (const group of this.buildSeriesGroups({
        context,
        filter,
        request,
        topSources,
      })) {
        const stageKey = this.resolveTrendStageKey(
          request.metric,
          group.stageKey,
        );
        const { series: points, unavailableReason } =
          await this.computeTrendSeries({
            context,
            filter: group.filter,
            metric: request.metric,
            stageKey,
          });

        series.push({
          metric: request.metric,
          stageKey,
          groupKey: group.groupKey,
          groupLabel: group.groupLabel,
          unavailableReason,
          points,
        });
      }
    }

    return { ...this.buildBase(context), period: filter.period, series };
  }

  private buildSeriesGroups({
    context,
    filter,
    request: { stageKey, groupBy },
    topSources,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    request: AnalyticsSeriesRequest;
    topSources: AnalyticsOption[];
  }): SeriesGroup[] {
    switch (groupBy) {
      case 'NONE':
        return [{ groupKey: null, groupLabel: null, filter, stageKey }];
      case 'TRACK':
        return this.resolveSeriesTrackKeys(filter).map((trackKey) => ({
          groupKey: trackKey,
          groupLabel: this.buildCategoryLabel({
            state: context.state,
            groupBy: 'TRACK_PROGRAM',
            parentKey: null,
            key: trackKey,
          }),
          // A chosen program already narrows further than its track, and adding the track
          // could only turn a snapshot metric unavailable.
          filter: isDefined(filter.programKey)
            ? filter
            : { ...filter, trackKey },
          stageKey,
        }));
      case 'SOURCE':
        return topSources.map(({ key, label }) => ({
          groupKey: key,
          groupLabel: label,
          filter: { ...filter, sourceKey: key },
          stageKey,
        }));
      case 'STAGE':
        return CRM_ANALYTICS_SERIES_STAGES.map((stage) => ({
          groupKey: stage.stageKey,
          groupLabel: stage.label,
          filter,
          stageKey: stage.stageKey,
        }));
    }
  }

  // Filtering the page to one track or program leaves one line, not every track's.
  private resolveSeriesTrackKeys({
    trackKey,
    programKey,
  }: Pick<AnalyticsFilter, 'trackKey' | 'programKey'>): string[] {
    if (isDefined(trackKey)) {
      return [trackKey];
    }

    if (!isDefined(programKey)) {
      return CRM_ANALYTICS_CONFIG.tracks.map((track) => track.trackKey);
    }

    return [
      programKey === NONE_CATEGORY_KEY
        ? NONE_CATEGORY_KEY
        : (TRACK_KEY_BY_POSITION.get(programKey) ?? UNMAPPED_CATEGORY_KEY),
    ];
  }

  // Ranked as the source bars are, so the lines and the bars name the same sources.
  private async readTopSources(
    context: CrmAnalyticsQueryContext,
    filter: AnalyticsFilter,
  ): Promise<AnalyticsOption[]> {
    const rows = await this.readCategoryPeople({
      context,
      personFilter: filter,
      groupBy: 'SOURCE',
      peopleDateRange: { from: filter.dateFrom, to: filter.dateTo },
    });
    const sourceCategory = {
      state: context.state,
      groupBy: 'SOURCE',
      parentKey: null,
    } as const;

    return rows
      .map((row) => {
        const key = String(row.category_key);

        return {
          key,
          people: toCount(row.people),
          isUnmapped: this.isCategoryUnmapped({ ...sourceCategory, key }),
        };
      })
      .sort(compareCategoryRows)
      .slice(0, CRM_ANALYTICS_SERIES_LIMITS.topSources)
      .map(({ key }) => ({
        key,
        label: this.buildCategoryLabel({ ...sourceCategory, key }),
      }));
  }

  // Daily conversion is out of scope, and the page explains an empty table at DAY.
  private async computeTrendCohorts(
    context: CrmAnalyticsQueryContext,
    filter: AnalyticsFilter,
    metric: AnalyticsTrendMetric,
  ): Promise<AnalyticsCohortRow[]> {
    if (filter.period === 'DAY') {
      return [];
    }

    const buckets = computeCrmAnalyticsTrendBuckets({
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      period: filter.period,
      localToday: context.localToday,
      metric,
    });
    const firstBucket = buckets[0];
    const lastBucket = buckets[buckets.length - 1];

    if (!isDefined(firstBucket) || !isDefined(lastBucket)) {
      return [];
    }

    // The series' whole periods, so a week means the same people in the line and the table.
    return this.computeCohorts({
      context,
      personFilter: filter,
      period: filter.period,
      cohortDateRange: {
        from: firstBucket.bucketStart,
        to: computeLastBucketDay(lastBucket, filter.period),
      },
    });
  }

  // MEDIAN_DAYS with no stage means every stage together.
  private resolveTrendStageKey(
    metric: AnalyticsTrendMetric,
    stageKey: string | null,
  ): string | null {
    switch (metric) {
      case 'STAGE_COUNT':
      case 'DROP_OFF':
        return stageKey ?? ENTRY_STAGE_KEY;
      case 'MEDIAN_DAYS':
        return stageKey;
      default:
        return null;
    }
  }

  private resolveMovementRange(
    context: CrmAnalyticsQueryContext,
    filter: AnalyticsFilter,
  ): CrmAnalyticsClosedDateRange {
    if (!isDefined(filter.dateFrom) && !isDefined(filter.dateTo)) {
      return {
        from: computeCrmAnalyticsPeriodStart(context.localToday, filter.period),
        to: context.localToday,
      };
    }

    return {
      from:
        filter.dateFrom ??
        computeCrmAnalyticsLocalDate(context.trackingStart, context.timeZone),
      to: filter.dateTo ?? context.localToday,
    };
  }

  private async computeTrendSeries({
    context,
    filter,
    metric,
    stageKey,
    windowsClosedAt,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    metric: AnalyticsTrendMetric;
    stageKey: string | null;
    windowsClosedAt?: string;
  }): Promise<Pick<AnalyticsTrends, 'series' | 'unavailableReason'>> {
    const isRateMetric = metric === 'OVERALL_CONVERSION' || metric === 'DROP_OFF';

    if (isRateMetric && filter.period === 'DAY') {
      return { series: [], unavailableReason: 'DAILY_RATE' };
    }

    if (metric === 'NEW_APPLICATIONS' && !context.state.hasFormSubmissionObject) {
      return { series: [], unavailableReason: 'NO_SUBMISSION_OBJECT' };
    }

    const snapshotDimension = resolveSnapshotDimension(filter);
    const isSnapshotMetric =
      metric === 'TOTAL_CONTACTS' ||
      metric === 'ACTIVE_PEOPLE' ||
      metric === 'STAGE_COUNT';

    if (isSnapshotMetric && !isDefined(snapshotDimension)) {
      return { series: [], unavailableReason: 'SNAPSHOT_FILTER_COMBINATION' };
    }

    const buckets = computeCrmAnalyticsTrendBuckets({
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      period: filter.period,
      localToday: context.localToday,
      metric,
    });
    const firstBucket = buckets[0];
    const lastBucket = buckets[buckets.length - 1];

    if (!isDefined(firstBucket) || !isDefined(lastBucket)) {
      return { series: [], unavailableReason: null };
    }

    // Covers the previous buckets too, up to the last day of the last bucket.
    const range: CrmAnalyticsClosedDateRange = {
      from: firstBucket.previousBucketStart,
      to: computeLastBucketDay(lastBucket, filter.period),
    };

    const readValue = await this.readTrendValues({
      context,
      filter,
      metric,
      stageKey,
      range,
      snapshotDimension,
      windowsClosedAt,
    });

    return {
      series: buildTrendSeries(buckets, readValue, isRateMetric),
      unavailableReason: null,
    };
  }

  private async readTrendValues({
    context,
    filter,
    metric,
    stageKey,
    range,
    snapshotDimension,
    windowsClosedAt,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    metric: AnalyticsTrendMetric;
    stageKey: string | null;
    range: CrmAnalyticsClosedDateRange;
    snapshotDimension: { dimension: string; dimensionKey: string } | null;
    windowsClosedAt?: string;
  }): Promise<(bucketStart: string) => TrendValue> {
    switch (metric) {
      case 'NEW_APPLICATIONS': {
        const counts = await this.readNewApplicationBuckets({
          context,
          filter,
          range,
        });
        const firstTrackedBucketStart = computeCrmAnalyticsPeriodStart(
          computeCrmAnalyticsLocalDate(context.trackingStart, context.timeZone),
          filter.period,
        );

        // A bucket wholly before tracking start has no known total, however many rows it holds.
        return (bucketStart) => ({
          value:
            bucketStart < firstTrackedBucketStart
              ? null
              : (counts.get(bucketStart) ?? 0),
          size: null,
        });
      }
      case 'TOTAL_CONTACTS':
      case 'ACTIVE_PEOPLE':
      case 'STAGE_COUNT': {
        const counts = await this.readSnapshotBuckets({
          context,
          filter,
          metric,
          stageKey,
          range,
          snapshotDimension: snapshotDimension ?? {
            dimension: 'all',
            dimensionKey: '',
          },
        });

        // No snapshot in a bucket is unknown, not zero.
        return (bucketStart) => ({
          value: counts.get(bucketStart) ?? null,
          size: null,
        });
      }
      case 'OVERALL_CONVERSION':
      case 'DROP_OFF': {
        const groups = await this.readFunnelGroups({
          context,
          personFilter: filter,
          cohortDateRange: range,
          buildGroupSql: (statement) =>
            `SELECT c.person_id, ${buildBucketSql(statement, filter.period, 'c.created_at')} AS group_key FROM cohort c`,
          windowsClosedAt,
        });

        return (bucketStart) =>
          readRateTrendValue({
            group: groups.get(bucketStart),
            metric,
            stageKey,
          });
      }
      case 'MEDIAN_DAYS': {
        const medians = await this.readMedianBuckets({
          context,
          filter,
          stageKey,
          range,
        });

        return (bucketStart) =>
          medians.get(bucketStart) ?? { value: null, size: 0 };
      }
    }
  }

  private async readNewApplicationBuckets({
    context,
    filter,
    range,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    range: CrmAnalyticsClosedDateRange;
  }): Promise<Map<string, number>> {
    const submissionRelationSql =
      this.facadeService.buildApplicationSubmissionRelationSql(context.state);

    if (!isDefined(submissionRelationSql)) {
      return new Map();
    }

    const statement = this.createBaseStatement({
      context,
      personFilter: filter,
    });
    const localDateSql = `${statement.localDate('sub.submitted_at')}::date`;

    const rows = await context.run(
      `${joinCtes(statement.withSql, `submission AS (${submissionRelationSql})`)}
SELECT ${buildBucketSql(statement, filter.period, 'sub.submitted_at')} AS bucket_start, count(*)::int AS bucket_value
FROM submission sub${this.buildSubmissionScopeJoinSql(filter)}
WHERE ${localDateSql} >= ${statement.bind(range.from)}::date AND ${localDateSql} <= ${statement.bind(range.to)}::date
GROUP BY 1`,
      statement.parameters,
    );

    return new Map(
      rows.map((row): [string, number] => [
        String(row.bucket_start),
        toCount(row.bucket_value),
      ]),
    );
  }

  // The 'all' rows prove a snapshot ran that day, so a category with nobody in it reads
  // as 0 rather than as a missing snapshot.
  private async readSnapshotBuckets({
    context,
    filter,
    metric,
    stageKey,
    range,
    snapshotDimension,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    metric: AnalyticsTrendMetric;
    stageKey: string | null;
    range: CrmAnalyticsClosedDateRange;
    snapshotDimension: { dimension: string; dimensionKey: string };
  }): Promise<Map<string, number>> {
    const statement = createSqlStatement(
      [context.state.workspaceId],
      context.timeZone,
    );
    const stageConditions = [
      ...buildStatusConditions(statement, filter.status, 'sn.stage'),
      ...(metric === 'ACTIVE_PEOPLE'
        ? [buildActiveConditionSql(statement, 'm.kind', 'm.stage_key')]
        : []),
      ...(metric === 'STAGE_COUNT'
        ? [`m.stage_key = ${statement.bind(stageKey)}::text`]
        : []),
    ];
    const matchingConditionsSql = [
      'sn.workspace_id = $1::uuid',
      `sn.dimension = ${statement.bind(snapshotDimension.dimension)}::text`,
      `sn.dimension_key = ${statement.bind(snapshotDimension.dimensionKey)}::text`,
      ...stageConditions,
    ].join(' AND ');

    const rows = await context.run(
      `WITH ${joinCtes(
        buildCrmAnalyticsMappingCtes(),
        `snapshot_day AS (
  SELECT DISTINCT sn.snapshot_date
  FROM analytics.daily_snapshot sn
  WHERE sn.workspace_id = $1::uuid AND sn.dimension = 'all'
    AND sn.snapshot_date >= ${statement.bind(range.from)}::date AND sn.snapshot_date <= ${statement.bind(range.to)}::date)`,
        `bucket_day AS (
  SELECT date_trunc(${statement.bind(PERIOD_SQL_UNITS[filter.period])}::text, sd.snapshot_date::timestamp)::date AS bucket_start,
    max(sd.snapshot_date) AS snapshot_date
  FROM snapshot_day sd
  GROUP BY 1)`,
        `matching_row AS (
  SELECT sn.snapshot_date, sn.person_count
  FROM analytics.daily_snapshot sn
  LEFT JOIN stage_map m ON m.raw_stage = sn.stage
  WHERE ${matchingConditionsSql})`,
      )}
SELECT b.bucket_start::text AS bucket_start, COALESCE(sum(r.person_count), 0)::int AS bucket_value
FROM bucket_day b
LEFT JOIN matching_row r ON r.snapshot_date = b.snapshot_date
GROUP BY b.bucket_start`,
      statement.parameters,
    );

    return new Map(
      rows.map((row): [string, number] => [
        String(row.bucket_start),
        toCount(row.bucket_value),
      ]),
    );
  }

  private async readMedianBuckets({
    context,
    filter,
    stageKey,
    range,
  }: {
    context: CrmAnalyticsQueryContext;
    filter: AnalyticsFilter;
    stageKey: string | null;
    range: CrmAnalyticsClosedDateRange;
  }): Promise<Map<string, TrendValue>> {
    // The window applies to when the stay ended, so the cohort has no date filter.
    const statement = this.createBaseStatement({
      context,
      personFilter: filter,
    });
    const localDateSql = `${statement.localDate('cs.ended_at')}::date`;
    const conditionsSql = [
      `${localDateSql} >= ${statement.bind(range.from)}::date`,
      `${localDateSql} <= ${statement.bind(range.to)}::date`,
      ...(isDefined(stageKey)
        ? [`cs.stage_key = ${statement.bind(stageKey)}::text`]
        : []),
    ].join(' AND ');

    const rows = await context.run(
      `${joinCtes(statement.withSql, STAY_CTES)}
SELECT ${buildBucketSql(statement, filter.period, 'cs.ended_at')} AS bucket_start,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY cs.stay_days) AS median_days,
  count(*)::int AS completed_stays
FROM completed_stay cs
WHERE ${conditionsSql}
GROUP BY 1`,
      statement.parameters,
    );

    return new Map(
      rows.map((row): [string, TrendValue] => [
        String(row.bucket_start),
        {
          value: roundDays(Number(row.median_days)),
          size: toCount(row.completed_stays),
        },
      ]),
    );
  }
}
