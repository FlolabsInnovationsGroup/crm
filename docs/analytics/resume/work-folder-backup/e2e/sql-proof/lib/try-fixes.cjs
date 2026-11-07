'use strict';
// PROOF_TRY_FIXES=1 applies the fixes proposed in ../RESULTS.md around the real classes,
// to show they work before anyone edits the repo. Delete a block once its fix is in the
// real code: after that this only repeats it.
const isOn = process.env.PROOF_TRY_FIXES === '1';

// B2: no nested loops on page reads or jobs. JIT goes too: a nested loop that cannot be
// avoided still carries the disabled-plan cost, which would switch JIT on for every statement.
const PLANNER_STATEMENTS_FOR_JOB = ['SET enable_nestloop = off', 'SET jit = off'];
const PLANNER_STATEMENTS_FOR_PAGE = ['SET LOCAL enable_nestloop = off', 'SET LOCAL jit = off'];

// B1: a soft-deleted person's submissions leave the relation; a submission with no person stays.
const applyFacadeFix = (facade, getWorkspaceSchemaName) => {
  const original = facade.buildApplicationSubmissionRelationSql.bind(facade);

  facade.buildApplicationSubmissionRelationSql = (state) => {
    const sql = original(state);

    if (sql === null) return sql;

    const personTable = `"${getWorkspaceSchemaName(state.workspaceId)}"."person"`;

    return sql.replace(
      `WHERE s."deletedAt" IS NULL`,
      `LEFT JOIN ${personTable} p ON p.id = s."personId"
WHERE s."deletedAt" IS NULL AND (s."personId" IS NULL OR p."deletedAt" IS NULL)`,
    );
  };
};

module.exports = { isOn, PLANNER_STATEMENTS_FOR_JOB, PLANNER_STATEMENTS_FOR_PAGE, applyFacadeFix };
