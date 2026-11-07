'use strict';
// Runs a plain SELECT on top of the real mapping and base CTEs inside the real page
// transaction. The CTE text is all from the code under test; callers only name which
// CTE to read.
const CTE_REQUEST = 'src/modules/analytics/utils/build-crm-analytics-cte.util';

const createBaseCteReader = ({ loader, services }) => {
  const { buildCrmAnalyticsMappingCtes, buildCrmAnalyticsBaseCtes } = loader.real(CTE_REQUEST);

  return async ({
    workspaceId,
    trackingStart,
    select,
    scopeFilterSql = '',
    cohortDateFilterSql = '',
    extraParameters = [],
  }) => {
    const facade = services.get('CrmAnalyticsFacadeService');
    const database = services.get('CrmAnalyticsDatabaseService');
    const state = await facade.getCrmState(workspaceId);
    const sql = `WITH ${buildCrmAnalyticsMappingCtes()},
${buildCrmAnalyticsBaseCtes({
  personRelationSql: facade.buildPersonRelationSql(state),
  scopeFilterSql,
  cohortDateFilterSql,
})}
${select}`;

    return database.runPageTransaction(workspaceId, (run) =>
      run(sql, [workspaceId, trackingStart, ...extraParameters]),
    );
  };
};

module.exports = { createBaseCteReader, CTE_REQUEST };
