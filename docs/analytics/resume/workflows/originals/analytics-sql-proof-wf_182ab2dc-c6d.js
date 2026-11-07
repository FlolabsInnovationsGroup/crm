export const meta = {
  name: 'analytics-sql-proof',
  description: 'Prove the analytics SQL on a real Postgres using a test harness outside the repo, and prepare local end-to-end tooling',
  whenToUse: 'Verification phase of the CRM Analytics build',
  phases: [
    { title: 'Harness', detail: 'real Postgres, realistic CRM tables, the real analytics code', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'

phase('Harness')
const result = await agent(`You are proving the CRM Analytics SQL on a real Postgres database, early, so wrong numbers or invalid SQL are found before the whole CRM has to run. Nothing has executed this SQL yet. The team will make decisions from these numbers.

Working copy: ${WT} (branch analytics_tool). Read ${WORK}/contract.md sections 3, 4, 5, 6 and 9 first.
Backend code is at ${WT}/packages/twenty-server/src/modules/analytics/. The foundation exists (facade, database service, DDL, CTE builders). Another agent is writing services/crm-analytics-sync.service.ts, services/crm-analytics-snapshot.service.ts, services/crm-analytics-metrics.service.ts and the rest right now.

RULES
- Put EVERYTHING you write in ${WORK}/e2e/. Add nothing to the repo. Do NOT edit any file under ${WT}/packages: other agents own them. If you find a bug, record it with the exact file, line and fix.
- Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint, a server build, or a CRM server. Keep memory use low.
- Docker Desktop is being started now and the local db container comes up with: docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db (postgres:16, user postgres, password postgres, port 5432). Check with docker ps. Create and use a separate database named analytics_proof, so you never disturb the CRM's "default" database. If Docker is not ready yet, write your files first and check again.

YOUR JOB
1. ${WORK}/e2e/sql-proof/: a repeatable harness, run with node or npx tsx from ${WT}, using pg from the repo's node_modules.
   - Create realistic CRM tables in the schema that getWorkspaceSchemaName gives for a fixed test workspace ID, with the REAL column shapes the code uses: person (stage as a Postgres enum, positionsAppliedFor as an enum array, applicantSource as an enum, createdAt, updatedAt, deletedAt, nameFirstName, nameLastName), timelineActivity (id, targetPersonId, linkedRecordId, properties jsonb, happensAt, createdAt, updatedAt), _crmForm, _formSubmission. Confirm the column names and types from the code that generates them, as the contract cites.
   - Reuse the REAL analytics code wherever it exists: DDL constant, facade relation builders, CTE builders, and the sync, snapshot, metrics and report services as they appear. Construct classes directly with fakes for dependency injection, as the module's specs do. Do not copy SQL into the harness: a proof of copied SQL proves nothing.
2. Fixtures and checks, running what exists now, and clearly listing what could not run yet because a service file does not exist:
   - DDL runs, and runs twice with no error.
   - Facade person relation, stage change relation and submission relation are valid SQL against those tables, including missing-field substitution.
   - The hand-calculated sample in contract section 9: exactly the expected table, and NEW median 5 with 5 completed stays.
   - Sync: first read; replay adds no rows; a merged row (update properties and updatedAt on the same timeline row) appends one row and leaves the first unchanged; A to B to A; cursor ignores reconcile rows.
   - Reconcile: a person changed with no timeline row gets one flagged row; a rerun adds none.
   - Snapshot and consistency check: one statement; rerun gives NOT_RUN and status ok; a person created between runs causes no false mismatch.
   - Stage totals' top rows sum to total contacts, including an Unmapped value and no stage.
   - Several positions: counted once in each, distinct totals correct.
   - Too recent: never 0%, never dropped. Soft-deleted people excluded. Imported people outside cohorts.
   - Reports: built once, frozen on rerun.
   Print a clear PASS or FAIL per check, with expected and actual on failure.
3. ${WORK}/e2e/fields.mjs and ${WORK}/e2e/people.mjs for the later full local run in contract section 9, copying ensureField from packages/twenty-utils/flolabs/setup-forms.mjs. Write them, but do not run them, since the CRM server is not running.
4. ${WORK}/e2e/RESULTS.md: the check table, exact SQL errors, every bug with file, line and proposed fix, and the exact command to rerun. Make the rerun simple, because this harness will be run again when the remaining services exist.

Your final text must be at most 200 words: what passed, what failed, what could not run yet, and the rerun command.`, { label: 'sql-proof', phase: 'Harness', model: 'opus', effort: 'max' })
return { result }