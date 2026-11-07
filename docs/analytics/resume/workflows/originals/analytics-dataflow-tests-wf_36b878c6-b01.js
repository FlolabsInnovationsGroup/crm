export const meta = {
  name: 'analytics-dataflow-tests',
  description: 'Write data flow graph tests: map every path from CRM tables to the screen, and test each definition-use edge',
  whenToUse: 'Data flow testing for the CRM Analytics build',
  phases: [
    { title: 'Write data flow tests', detail: 'graph, edge coverage check, and a test for every edge', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SUITE = `${WT}/packages/twenty-utils/flolabs/analytics-tests`
const RESULTS = `${WORK}/test-results`

phase('Write data flow tests')
const result = await agent(`You add data flow graph testing to the permanent automated test suite of the CRM Analytics tool in FloLabs CRM, a fork of Twenty. The user asked for this explicitly. The spec's own data flow is in ${WORK}/spec.txt section 2. Data flow testing means: model how each piece of data is defined and used across the system, then test every definition-use path, so a value that gets lost, altered or leaked anywhere along the way fails a test.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages. Read ${WORK}/contract.md (sections 3 to 9) first.
Product code is off limits, other agents are writing it now under packages/twenty-server/src/modules/analytics/ and packages/twenty-front/src/modules/crm-analytics/. Never edit it. Do not run git add, commit, stash or checkout, nor yarn install or heavy builds.
Another agent is writing the rest of the suite under ${SUITE}/ right now, including run-tests.mjs and integration/, and a harness may exist at ${WORK}/e2e/sql-proof/. You own only ${SUITE}/dataflow/. Reuse their real-Postgres setup when it exists, and only make the small edit to run-tests.mjs described below. Safety rule for the whole suite: local database and localhost only, refuse anything else.

WRITE, under ${SUITE}/dataflow/:
1. dataflow-graph.json: the machine-readable graph. Nodes: CRM tables and columns (person.stage, person.positionsAppliedFor, person.applicantSource, person.createdAt, person.deletedAt, timelineActivity.properties.diff.stage, timelineActivity.happensAt, timelineActivity.updatedAt, formSubmission.submittedAt, crmForm.name), facade relations, the mapping constant, sync and reconcile, analytics.stage_transition columns, analytics.daily_snapshot, analytics.report, analytics.sync_log, the CTEs, each metric, each GraphQL payload field, and the UI component that shows it. Edges: each carries an ID (DF-01 and so on), the field defined at the source, and where it is used.
2. DATAFLOW.md: the same graph as a Mermaid diagram plus a short table of edges, so the team can read it. Keep it short.
3. Tests, run against real Postgres with the REAL analytics code, never copied SQL:
   - Every edge has at least one test named with its edge ID. A coverage test reads dataflow-graph.json and FAILS if any edge has no test, so the graph and tests cannot drift apart.
   - Forward propagation: change one input at the source and assert the change reaches every sink it should, with the right value, and changes nothing else. For example, one stage change must add one transition, move the funnel's entered and reachedNext numbers, the stage totals, and the Overview payload. Changing a person's position must move only position and track rows. Soft delete must remove them from counts and leave transitions. Do this for each input field in the graph.
   - Taint test for data minimization (spec section 9): seed sentinel values in names, emails, phones and form answers, run sync, daily, snapshot and reports, then scan every column of every table in the analytics schema and every report payload. The sentinels must appear nowhere. The only allowed use is the stuck list's live displayName in its page response, which is read live and never stored.
   - Unit consistency: a value must not change meaning along the path. happened_at stays UTC, local dates are used for buckets only, rates stay fractions from 0 to 1 until the UI, counts stay integers.
   - Unknown values: an unmapped stage must reach the Unmapped row and never a funnel step. Too-recent people must reach inWindow and never a failure count.
   - Front half of the graph: where a payload field is rendered, a small test that the component shows that field. Use the existing front jest setup only if it fits; otherwise leave those edges to the blackbox and ui layers, and mark them in the graph with which layer covers them, so the coverage test accepts them.
4. A small edit to ${SUITE}/run-tests.mjs when that file exists: add a dataflow layer, and make the integration layer also run it, since it needs the same database, so the agents that run the suite pick it up automatically. Include it in "all". If run-tests.mjs does not exist yet, provide dataflow/run.mjs that works alone and writes ${RESULTS}/latest-dataflow.json in the same format the suite's README describes; check again at the end of your work, and make the edit if it has appeared by then.

If a service file is not written yet, the tests that need it must report SKIPPED with the reason rather than fail. Docker's Postgres is up on localhost:5432 (postgres, password postgres), and you may run your tests now: cd ${WT} && node packages/twenty-utils/flolabs/analytics-tests/dataflow/run.mjs. Keep memory use low.

Your final text must be at most 150 words: number of nodes and edges, test results now, and what is still skipped.`, { label: 'dataflow-tests', phase: 'Write data flow tests', model: 'opus', effort: 'max' })
return { result }