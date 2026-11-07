export const meta = {
  name: 'analytics-backend',
  description: 'Build the CRM Analytics backend module: foundation, sync pipeline, metrics and API, then review and fix',
  whenToUse: 'Backend phase of the CRM Analytics build',
  phases: [
    { title: 'Foundation', detail: 'config, storage, facade, database and settings services', model: 'opus' },
    { title: 'Build', detail: 'sync pipeline and jobs, metrics, reports and API', model: 'opus' },
    { title: 'Review and fix', detail: 'independent review against the contract, then fixes', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SERVER = `${WT}/packages/twenty-server`
const MOD = `${SERVER}/src/modules/analytics`

const COMMON = `You are building part of the CRM Analytics tool inside FloLabs CRM, a fork of Twenty. This is the company's live CRM, so be careful and precise.

Working copy: ${WT} (branch analytics_tool). Use absolute paths, and cd there in Bash. Never touch D:/Coding/Flolabs/crm/packages, which is a different checkout.

Read first, in full: ${WORK}/contract.md (the build contract, the single source of truth), then ${WORK}/brief.md. Background if you need it: ${WORK}/research/backend.md and ${WORK}/research/critique.md. Near the end of your work, re-read the end of contract.md for a "Verifier notes" section or other changes, since a verifier may amend it while you work.

Rules:
- Create only the files you own, listed below. Never edit an existing CRM file. A later integration workflow wires the module in, so it is not connected yet.
- Do not run git add, commit, stash or checkout. Do not run yarn install, nx, tsgo, lint, lingui, docker or any build. The only command you may run is a single spec at a time: cd ${WT} && npx jest <path> --config=packages/twenty-server/jest.config.mjs. Run your specs once your files are written. packages/twenty-shared/dist is being built now; if jest complains about twenty-shared, retry later and say so in your report.
- Before using any existing CRM API, open its file and confirm the import path and signature. The contract cites the reference to copy. If the contract is wrong about the code, follow the code, keep the contract's intent, and report the deviation.
- CLAUDE.md conventions apply: types not interfaces, no any, named exports only, no abbreviations in names, string literals not enums, use existing helpers such as isDefined, match the adjacent code, comment only a non-obvious why and keep it short.
- All Nest classes and GraphQL names start with CrmAnalytics. A bad provider or duplicate GraphQL type would stop the whole CRM from booting, so be exact about decorators and module wiring.
- All values reach SQL as parameters. Identifiers go through the escape helpers named in the contract.
- Build what the contract says, nothing more. Do not add scope.

Your final text must be at most 200 words: files written, specs run with pass or fail, deviations from the contract, and anything not verified.`

phase('Foundation')
const foundation = await agent(`${COMMON}

YOUR JOB: the backend foundation, everything the other backend agents will build on. Two more agents start as soon as you finish and will read your code, so keep exports clear and stable.

Files you own, under ${MOD}/ (contract sections 1 to 4, 6 and 7):
- constants/crm-analytics-config.constant.ts: stages, reminders and aliases, tracks with all 39 positions, windows, limits, zone, form names, stale minutes, isProvisional, showSignedFigure
- constants/crm-analytics-ddl.constant.ts: CRM_ANALYTICS_DDL_STATEMENTS, section 3 verbatim
- constants/crm-analytics-cron-patterns.constant.ts
- types/analytics-api.type.ts: section 7 block byte for byte, no imports
- types/crm-analytics-crm-state.type.ts
- dtos/crm-analytics-payload.dto.ts and dtos/crm-analytics-filter.input.ts
- facade/crm-analytics-facade.service.ts: read-only, the only code that touches CRM tables. It must never throw for absent fields or objects
- services/crm-analytics-database.service.ts: page transaction, job connection, ensureStorage
- services/crm-analytics-settings.service.ts: off switch and tracking start
- utils/build-crm-analytics-cte.util.ts: stage_map, position_map, and the base CTEs in section 6
- utils/build-crm-analytics-local-date-sql.util.ts

Specs you own, in __tests__/ beside each, from section 9: crm-analytics-facade.service.spec.ts, crm-analytics-read-only.spec.ts, crm-analytics-api-types.spec.ts, timeline-diff-shape.spec.ts, crm-analytics-ddl.constant.spec.ts, crm-analytics-config.constant.spec.ts, build-crm-analytics-cte.util.spec.ts, build-crm-analytics-local-date-sql.util.spec.ts.
crm-analytics-api-types.spec.ts compares with packages/twenty-front/src/modules/crm-analytics/types/AnalyticsApi.ts, which the UI workflow is writing now. If that file does not exist yet, that one test may fail for now: say so in your report.`, { label: 'backend-foundation', phase: 'Foundation', model: 'opus', effort: 'max' })
log('Backend foundation done: ' + (foundation ? 'ok' : 'FAILED'))

phase('Build')
const SHARED_SIGNATURES = `Agreed interface between the two agents working now:
- The metrics and API agent writes CrmAnalyticsReportService with: buildMissingReports(args: { workspaceId: string; state: CrmAnalyticsCrmState; run: CrmAnalyticsSqlRunner }): Promise<number>. It is safe to call repeatedly, capped at 8 reports per run, oldest first, using ON CONFLICT DO NOTHING.
- The pipeline agent writes CrmAnalyticsSnapshotService, CrmAnalyticsSyncService, the jobs, and crm-analytics.module.ts, and calls buildMissingReports from the daily job.
- Read the foundation code that already exists under ${MOD}/ and use it. If you truly need a small change to a foundation file, make it and report it.`

const [pipeline, readSide] = await parallel([
  () => agent(`${COMMON}

YOUR JOB: the data pipeline and jobs (contract sections 2, 3 and 5). Foundation files already exist under ${MOD}/.
${SHARED_SIGNATURES}

Files you own, under ${MOD}/:
- services/crm-analytics-sync.service.ts: timeline re-read, reconcile
- services/crm-analytics-snapshot.service.ts: daily snapshot, consistency check
- crons/commands/crm-analytics.cron.command.ts: command cron:crm-analytics, registers both crons
- crons/commands/crm-analytics-run.command.ts: crm-analytics:run --workspace-id <id> --job sync|daily
- crons/jobs/crm-analytics-sync.cron.job.ts and crons/jobs/crm-analytics-daily.cron.job.ts: only enqueue, on cronQueue
- jobs/crm-analytics-workspace-sync.job.ts and jobs/crm-analytics-workspace-daily.job.ts: real work, on workspaceQueue
- crm-analytics.module.ts: lists every class in the contract's section 2 file list as a provider, including the ones the other agent is writing now (CrmAnalyticsMetricsService, CrmAnalyticsReportService, CrmAnalyticsMetaService, CrmAnalyticsResolver). Check how cron commands, jobs and resolvers in comparable modules are registered, for example the trash-cleanup and notifications-seen modules, and copy that exactly.

Specs you own, from section 9: crm-analytics-sync.service.spec.ts, crm-analytics-sync.cron.job.spec.ts.

Daily job order, each step in its own try/catch recorded in details: full re-read, reconcile, snapshot, consistency check, trim the sync log, build missing reports. On failure the log row is set to failed and the job rethrows. The off switch and missing stage field behave as section 5 says. Sync enqueues the daily job on first run when no daily log row exists.`, { label: 'backend-pipeline', phase: 'Build', model: 'opus', effort: 'max' }),

  () => agent(`${COMMON}

YOUR JOB: metrics, reports and the API (contract sections 6 and 7). This is where correctness matters most: the team will make decisions from these numbers. Foundation files already exist under ${MOD}/.
${SHARED_SIGNATURES}

Files you own, under ${MOD}/:
- services/crm-analytics-metrics.service.ts: all metric SQL. Implement every definition in section 6 exactly. Reports call the same methods
- services/crm-analytics-report.service.ts
- services/crm-analytics-meta.service.ts: page state, sync state, stages, tracks, programs, sources
- utils/parse-crm-analytics-filter.util.ts
- utils/compute-crm-analytics-report-periods.util.ts
- utils/compute-crm-analytics-significant-changes.util.ts
- resolvers/crm-analytics.resolver.ts: exactly the guards and queries in section 7, one small JSON payload DTO

Specs you own, from section 9: parse-crm-analytics-filter.util.spec.ts, compute-crm-analytics-report-periods.util.spec.ts, compute-crm-analytics-significant-changes.util.spec.ts, crm-analytics-metrics.service.spec.ts, crm-analytics.resolver.spec.ts.

Before finishing, walk the hand-calculated sample at the end of contract section 9 through your SQL by hand, row by row, and confirm you get the expected table, including the NEW median of 5 with 5 completed stays. Report whether it matches. There is no database available in this phase, so be rigorous about SQL validity: column aliases, GROUP BY, CTE order, parameter numbering, casts, and DISTINCT ON ordering.
Every read must ignore no-op rows. Too-recent people must never count as 0% or as dropped. Page transactions are read-only and must never create anything, so reads check to_regclass first as section 3 says.`, { label: 'backend-metrics-api', phase: 'Build', model: 'opus', effort: 'max' }),
])
log('Backend build done: pipeline ' + (pipeline ? 'ok' : 'FAILED') + ', metrics ' + (readSide ? 'ok' : 'FAILED'))

phase('Review and fix')
const REVIEW = {
  type: 'object',
  properties: {
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['file', 'severity', 'problem', 'evidence', 'fix'],
      },
    },
    specsRun: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['defects', 'specsRun', 'summary'],
}

const reviewPrompt = (round) => `You are an independent senior reviewer of the CRM Analytics backend, review round ${round}. You did not write this code. This module will run inside the company's live CRM, so assume there are mistakes and find them.

Working copy: ${WT} (branch analytics_tool). Code under review: ${MOD}/. Read ${WORK}/contract.md and ${WORK}/brief.md in full first.
Do not edit any file. Do not run git add, commit, stash or checkout. Do not run yarn install, nx, tsgo, lint or docker. You may run specs one at a time: cd ${WT} && npx jest <path> --config=packages/twenty-server/jest.config.mjs. Run every spec under ${MOD}/. A failure of crm-analytics-api-types.spec.ts only because the front file is not there yet is not a defect.

Check:
1. CRM safety: would anything stop the CRM booting (bad providers, missing imports in the module, duplicate GraphQL types, wrong decorators, a circular dependency)? Could anything write to a CRM table, slow the CRM, or block a shared queue? Does the job connection get destroyed in finally? Is the read-only rule truly enforced?
2. Every metric against contract section 6. Execute the hand-calculated sample in section 9 mentally through the actual SQL and compare it to the expected table. Check the SQL is valid Postgres: aliases, GROUP BY, CTE order, parameter numbering and types, casts, enum to text.
3. Idempotency, failure handling, off switch, missing field and never-synced behaviour against sections 3 and 5.
4. Security: SQL injection through any value or identifier, guards on every query, no personal data stored.
5. Existing API usage: open each referenced file and confirm the imports and signatures are real.
6. Code matches CLAUDE.md conventions and has no scope beyond the contract. Flag over-engineering.
Report real defects only, with file and line evidence and a concrete fix. Do not report style preferences. An empty list is fine if it is right.`

const fixPrompt = (defects) => `You are fixing review findings in the CRM Analytics backend. Live CRM: be careful.
Working copy: ${WT} (branch analytics_tool). Only edit files under ${MOD}/. Do not edit existing CRM files. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint or docker. Read ${WORK}/contract.md for intent. You may run specs one at a time: cd ${WT} && npx jest <path> --config=packages/twenty-server/jest.config.mjs.
Confirm each finding in the code first, since a reviewer can be wrong. Fix the real ones and re-run the affected specs. For any finding you reject, say why.
Findings:
${JSON.stringify(defects, null, 1)}
Your final text must be at most 150 words: what you fixed, what you rejected and why, and spec results.`

const reviews = []
const fixes = []
for (let round = 1; round <= 3; round++) {
  const review = await agent(reviewPrompt(round), { label: `backend-review-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max', schema: REVIEW })
  reviews.push(review)
  const serious = review ? review.defects.filter((defect) => defect.severity !== 'minor') : []
  log(`Backend review ${round}: ${review ? review.defects.length : 'no'} findings, ${serious.length} serious`)
  if (!review || serious.length === 0 || round === 3) {
    break
  }
  fixes.push(await agent(fixPrompt(serious), { label: `backend-fix-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max' }))
}

return { foundation, pipeline, readSide, reviews, fixes }