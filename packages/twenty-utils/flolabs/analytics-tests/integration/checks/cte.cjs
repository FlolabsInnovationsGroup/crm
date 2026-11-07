'use strict';
const { createBaseCteReader, CTE_REQUEST } = require('../lib/base-ctes.cjs');

const LOCAL_DATE_REQUEST = 'src/modules/analytics/utils/build-crm-analytics-local-date-sql.util';

module.exports = {
  title: 'CTE builders: valid SQL with real parameters',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo }) => {
    const readBaseCtes = createBaseCteReader({ loader, services });
    const { buildCrmAnalyticsMappingCtes } = loader.real(CTE_REQUEST);
    const { buildCrmAnalyticsLocalDateSql } = loader.real(LOCAL_DATE_REQUEST);
    const database = services.get('CrmAnalyticsDatabaseService');

    await harness.check({ id: 'K1', title: 'Mapping CTEs: 13 raw stages, 39 positions, 8 funnel stages' }, async (t) => {
      const [row] = await query(
        `WITH ${buildCrmAnalyticsMappingCtes()}
         SELECT (SELECT count(*) FROM stage_map)::int AS stages,
                (SELECT count(*) FROM position_map)::int AS positions,
                (SELECT count(*) FROM funnel_stage)::int AS funnel,
                (SELECT count(DISTINCT raw_position) FROM position_map)::int AS distinct_positions,
                (SELECT array_agg(raw_stage ORDER BY raw_stage) FROM stage_map WHERE stage_key = 'SIGNED') AS signed,
                (SELECT rank FROM stage_map WHERE raw_stage = 'INTERESTED') AS interested_rank,
                (SELECT kind FROM stage_map WHERE raw_stage = 'INTERESTED') AS interested_kind`,
      );

      t.equal('stage_map rows', row.stages, 13);
      t.equal('position_map rows', row.positions, 39);
      t.equal('positions are unique', row.distinct_positions, 39);
      t.equal('funnel_stage rows', row.funnel, 8);
      t.equal('Signed Paid and Non paid share a key', row.signed, ['SIGNED_NON_PAID', 'SIGNED_PAID']);
      t.equal('INTERESTED has no rank', row.interested_rank, null);
      t.equal('INTERESTED is OTHER', row.interested_kind, 'OTHER');
    });

    const workspace = await harness.fixture('K0', 'workspace for the base CTEs', async () => {
      const created = await newWorkspace();
      const { insertPerson, insertStageChange } = created.fixtures;

      created.trackingStart = daysAgo(60);
      created.vars.set('CRM_ANALYTICS_TRACKING_START_AT', created.trackingStart.toISOString());
      created.personId = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20) });
      created.noOpPersonId = await insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });
      await insertStageChange({ personId: created.personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(10) });
      await insertStageChange({ personId: created.noOpPersonId, before: 'NEW', after: 'NEW', happensAt: daysAgo(10) });

      return created;
    });

    await harness.check({ id: 'K2', title: 'Base CTEs: every CTE is selectable with empty filters', needs: [workspace] }, async (t) => {
      await database.runJob((run) => database.ensureStorage(run));
      await services.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId: workspace.workspaceId });

      for (const cteName of ['crm_person', 'scope', 'transition', 'first_move', 'cohort', 'arrival', 'person_step']) {
        const rows = await readBaseCtes({
          workspaceId: workspace.workspaceId,
          trackingStart: workspace.trackingStart,
          select: `SELECT * FROM ${cteName}`,
        });

        t.ok(`${cteName} returns rows`, rows.length > 0, rows);
      }
    });

    await harness.check({ id: 'K3', title: 'Base CTEs: scope and cohort filters take parameters from $3', needs: [workspace] }, async (t) => {
      const rows = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT (SELECT count(*) FROM scope)::int AS in_scope, (SELECT count(*) FROM cohort)::int AS in_cohort`,
        scopeFilterSql: `p.raw_stage = $3 AND m.kind = 'MAIN'`,
        cohortDateFilterSql: `s.created_at >= $4`,
        extraParameters: ['CONTACTED', daysAgo(25)],
      });

      t.equal('filtered', rows[0], { in_scope: 1, in_cohort: 1 });

      const later = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT (SELECT count(*) FROM cohort)::int AS in_cohort`,
        cohortDateFilterSql: `s.created_at >= $3`,
        extraParameters: [daysAgo(5)],
      });

      t.equal('date filter removes the cohort', later[0], { in_cohort: 0 });
    });

    await harness.check({ id: 'K4', title: 'Base CTEs: no-op rows never reach the transition CTE', needs: [workspace] }, async (t) => {
      const rows = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT person_id FROM transition`,
      });

      t.equal('only the real move', rows.map((row) => row.person_id), [workspace.personId]);
    });

    await harness.check({ id: 'K5', title: 'Local date helper buckets by the reporting zone' }, async (t) => {
      const localSql = buildCrmAnalyticsLocalDateSql({
        columnSql: `'2026-11-02T03:30:00Z'::timestamptz`,
        timeZoneParameter: '$1',
      });
      const [utc] = await query(`SELECT (${localSql}::date)::text AS day`, ['UTC']);
      const [newYork] = await query(`SELECT (${localSql}::date)::text AS day`, ['America/New_York']);

      t.equal('UTC', utc.day, '2026-11-02');
      t.equal('New York is the day before', newYork.day, '2026-11-01');
    });
  },
};
