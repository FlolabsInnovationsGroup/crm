export const meta = {
  name: 'analytics-backend-continue',
  description: 'Continue the CRM Analytics backend: apply the known server fix, then review and fix rounds 2 and 3',
  whenToUse: 'Resume point for the backend workflow. Foundation, build, review 1 and fix 1 are already done',
  phases: [
    { title: 'Known fixes', detail: 'the server fix UI review 1 asked for', model: 'opus' },
    { title: 'Review and fix', detail: 'independent review against the contract, then fixes', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SERVER = `${WT}/packages/twenty-server`
const MOD = `${SERVER}/src/modules/analytics`

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
Report real defects only, with file and line evidence and a concrete fix. Do not report style preferences. An empty list is fine if it is right.
Already settled, do not report again: round 1's planner guard and soft-deleted applications fixes are in; its open minor about server-built English strings is being handled on the front by the UI workflow; the contract section "Decisions from testing" is settled.`

const fixPrompt = (defects) => `You are fixing review findings in the CRM Analytics backend. Live CRM: be careful.
Working copy: ${WT} (branch analytics_tool). Only edit files under ${MOD}/. Do not edit existing CRM files. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint or docker. Read ${WORK}/contract.md for intent. You may run specs one at a time: cd ${WT} && npx jest <path> --config=packages/twenty-server/jest.config.mjs.
Confirm each finding in the code first, since a reviewer can be wrong. Fix the real ones and re-run the affected specs. For any finding you reject, say why.
Findings:
${JSON.stringify(defects, null, 1)}
Your final text must be at most 150 words: what you fixed, what you rejected and why, and spec results.`

phase('Known fixes')
const knownFixes = await agent(fixPrompt([
  {
    file: 'packages/twenty-server/src/modules/analytics/services/crm-analytics-metrics.service.ts',
    severity: 'major',
    problem: 'Trends reports 0 new applications for periods before tracking started, which reads as a real count and produces false comparisons. Found by UI review 1, which could not fix server code.',
    evidence: 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work/test-results/ui-review-1.md, around line 38.',
    fix: 'In the NEW_APPLICATIONS branch of readTrendValues, return null for any bucket that ends before the local tracking start date. The existing null handling on the front then removes the gray line, the column and the delta.',
  },
]), { label: 'backend-known-fixes', phase: 'Known fixes', model: 'opus', effort: 'max' })

phase('Review and fix')
const reviews = []
const fixes = []
for (let round = 2; round <= 3; round++) {
  const review = await agent(reviewPrompt(round), { label: `backend-review-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max', schema: REVIEW })
  reviews.push(review)
  const serious = review ? review.defects.filter((defect) => defect.severity !== 'minor') : []
  log(`Backend review ${round}: ${review ? review.defects.length : 'no'} findings, ${serious.length} serious`)
  if (!review || serious.length === 0 || round === 3) {
    break
  }
  fixes.push(await agent(fixPrompt(serious), { label: `backend-fix-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max' }))
}

return { knownFixes, reviews, fixes }
