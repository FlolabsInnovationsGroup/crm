import {
  CRM_ANALYTICS_CONFIG,
  type CrmAnalyticsStageConfig,
} from 'src/modules/analytics/constants/crm-analytics-config.constant';
import {
  buildCrmAnalyticsBaseCtes,
  buildCrmAnalyticsMappingCtes,
} from 'src/modules/analytics/utils/build-crm-analytics-cte.util';

const PERSON_RELATION_SQL = 'SELECT 1 AS person_id';

const buildBaseCtes = (
  filters: { scopeFilterSql?: string; cohortDateFilterSql?: string } = {},
) =>
  buildCrmAnalyticsBaseCtes({
    personRelationSql: PERSON_RELATION_SQL,
    scopeFilterSql: filters.scopeFilterSql ?? 'TRUE',
    cohortDateFilterSql: filters.cohortDateFilterSql ?? 'TRUE',
  });

const extractCte = (sql: string, cteName: string, nextCteName: string) =>
  sql.slice(sql.indexOf(`${cteName} AS (`), sql.indexOf(`${nextCteName} AS (`));

const NEW_STAGE: CrmAnalyticsStageConfig = {
  stageKey: 'NEW',
  label: 'New',
  kind: 'MAIN',
  rank: 0,
  limitDays: 14,
  windowDays: 14,
  isSuccess: false,
  rawValues: [{ rawValue: 'NEW', isReminder: false }],
};

describe('buildCrmAnalyticsMappingCtes', () => {
  it('leaves out the leading WITH and defines the three CTEs in order', () => {
    const sql = buildCrmAnalyticsMappingCtes();

    expect(
      sql.startsWith(
        'stage_map (raw_stage, stage_key, rank, kind, limit_days) AS (VALUES ',
      ),
    ).toBe(true);
    expect(sql).toContain('position_map (raw_position, track_key) AS (VALUES ');
    expect(sql).toContain(
      'funnel_stage (stage_key, rank, window_days) AS (VALUES ',
    );
    expect(sql.indexOf('position_map')).toBeLessThan(
      sql.indexOf('funnel_stage'),
    );
    expect(sql.trimEnd().endsWith(')')).toBe(true);
    expect(sql.trimEnd().endsWith(',')).toBe(false);
  });

  it('quotes values through the escape helper', () => {
    const sql = buildCrmAnalyticsMappingCtes({
      stages: [
        {
          ...NEW_STAGE,
          rawValues: [{ rawValue: "O'Brien\\stage", isReminder: false }],
        },
      ],
      tracks: [
        { trackKey: 'ROB"OT', label: 'Robots', positions: ["pos'ition"] },
      ],
    });

    expect(sql).toContain("E'O''Brien\\\\stage'::text");
    expect(sql).toContain(`('pos''ition'::text, 'ROB"OT'::text)`);
  });

  it('gives a reminder the rank and kind of its parent', () => {
    const sql = buildCrmAnalyticsMappingCtes({
      stages: [
        {
          ...NEW_STAGE,
          rawValues: [
            { rawValue: 'NEW', isReminder: false },
            { rawValue: 'NEW_REMINDER_1', isReminder: true },
          ],
        },
      ],
      tracks: [],
    });

    expect(sql).toContain(
      "('NEW'::text, 'NEW'::text, 0::int, 'MAIN'::text, 14::int)",
    );
    expect(sql).toContain(
      "('NEW_REMINDER_1'::text, 'NEW'::text, 0::int, 'MAIN'::text, 14::int)",
    );
  });

  it('puts Signed Paid and Signed Non paid on one rank', () => {
    const sql = buildCrmAnalyticsMappingCtes();

    expect(sql).toContain(
      "('SIGNED_PAID'::text, 'SIGNED'::text, 7::int, 'MAIN'::text, NULL::int)",
    );
    expect(sql).toContain(
      "('SIGNED_NON_PAID'::text, 'SIGNED'::text, 7::int, 'MAIN'::text, NULL::int)",
    );
  });

  it('leaves exit and other stages with no rank and no limit', () => {
    const sql = buildCrmAnalyticsMappingCtes();

    expect(sql).toContain(
      "('NO_ANSWER'::text, 'NO_ANSWER'::text, NULL::int, 'EXIT'::text, NULL::int)",
    );
    expect(sql).toContain(
      "('INTERESTED'::text, 'INTERESTED'::text, NULL::int, 'OTHER'::text, NULL::int)",
    );
  });

  it('writes one stage_map row per raw value and one position_map row per position', () => {
    const sql = buildCrmAnalyticsMappingCtes();
    const stageMapSql = sql.slice(0, sql.indexOf('position_map'));

    expect(stageMapSql.match(/\('/g)).toHaveLength(
      CRM_ANALYTICS_CONFIG.stages.flatMap((stage) => stage.rawValues).length,
    );
    expect(sql).toContain("('AI_AGI_INTERN'::text, 'AI_SOFTWARE'::text)");
    expect(sql).toContain(
      "('SPORT_SCIENCE_INTERN'::text, 'EMERGING_SCIENCES'::text)",
    );
    expect(sql.match(/\('[A-Z_]+'::text, '[A-Z_]+'::text\)/g)).toHaveLength(39);
  });

  it('holds only ranked stages in funnel_stage, with no window on the last', () => {
    const sql = buildCrmAnalyticsMappingCtes();
    const funnelStageSql = sql.slice(sql.indexOf('funnel_stage'));

    expect(funnelStageSql).toContain("('NEW'::text, 0::int, 14::int)");
    expect(funnelStageSql).toContain("('SIGNED'::text, 7::int, NULL::int)");
    expect(funnelStageSql).not.toContain('NO_ANSWER');
    expect(funnelStageSql).not.toContain('INTERESTED');
  });
});

describe('buildCrmAnalyticsBaseCtes', () => {
  it('leaves out the leading WITH and defines the CTEs in dependency order', () => {
    const sql = buildBaseCtes();

    expect(sql.startsWith(`crm_person AS (${PERSON_RELATION_SQL})`)).toBe(true);

    const positions = [
      'crm_person',
      'scope',
      'transition',
      'first_move',
      'cohort',
      'arrival',
      'person_step',
    ].map((cteName) => sql.indexOf(`${cteName} AS (`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((first, second) => first - second)).toEqual(
      positions,
    );
  });

  it('ignores no-op rows in every transition read', () => {
    expect(extractCte(buildBaseCtes(), 'transition', 'first_move')).toContain(
      't.from_stage IS DISTINCT FROM t.to_stage',
    );
  });

  it('binds the workspace and the tracking start', () => {
    const sql = buildBaseCtes();

    expect(extractCte(sql, 'transition', 'first_move')).toContain(
      't.workspace_id = $1 AND t.happened_at >= $2',
    );
    expect(extractCte(sql, 'cohort', 'arrival')).toContain('s.created_at >= $2');
  });

  it('places the filters where they apply, as parameters only', () => {
    const sql = buildBaseCtes({
      scopeFilterSql: 'p.source = $3',
      cohortDateFilterSql: 's.created_at < $4',
    });

    expect(extractCte(sql, 'scope', 'transition')).toContain(
      'WHERE p.source = $3)',
    );
    expect(extractCte(sql, 'cohort', 'arrival')).toContain(
      'WHERE s.created_at >= $2 AND s.created_at < $4)',
    );
    expect(sql).not.toContain("'");
  });

  it('treats an empty filter as no filter', () => {
    const sql = buildBaseCtes({ scopeFilterSql: '', cohortDateFilterSql: ' ' });

    expect(extractCte(sql, 'scope', 'transition')).toContain('WHERE TRUE)');
    expect(extractCte(sql, 'cohort', 'arrival')).toContain(
      'WHERE s.created_at >= $2 AND TRUE)',
    );
  });

  it('carries the initial stage key for stage durations', () => {
    const sql = buildBaseCtes();

    expect(extractCte(sql, 'first_move', 'cohort')).toContain('from_key');
    expect(extractCte(sql, 'cohort', 'arrival')).toContain('AS initial_key');
  });

  it('counts a person at rank r as reached at every rank up to r', () => {
    expect(buildBaseCtes()).toContain(
      'FROM arrival a JOIN funnel_stage f ON a.rank >= f.rank',
    );
  });
});
