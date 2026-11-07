export const meta = {
  name: 'analytics-seed-data-small',
  description: 'Write small seed data that covers every use case, with independently calculated expected results',
  whenToUse: 'Test data for the CRM Analytics build',
  phases: [
    { title: 'Seed data', detail: 'use case list, small seed, expected results, coverage check', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SUITE = `${WT}/packages/twenty-utils/flolabs/analytics-tests`
const RESULTS = `${WORK}/test-results`

phase('Seed data')
const result = await agent(`You write the seed data for testing the CRM Analytics tool in FloLabs CRM, a fork of Twenty. The user's instruction is explicit: do NOT make the test data large. Keep it optimized: small, but reflecting EVERY use case. No production data is available or allowed.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages. Read ${WORK}/contract.md (sections 1, 3 to 6, and 9) and ${WORK}/brief.md first.
Product code is off limits, other agents are writing it now. Never edit it. Do not run git add, commit, stash or checkout, nor yarn install or heavy builds. Other agents are writing ${SUITE}/ too (run-tests.mjs, integration/, dataflow/), and a harness may exist at ${WORK}/e2e/sql-proof/. You own only ${SUITE}/seed/. An earlier agent may have left files in seed/ from a brief that asked for a large dataset: reuse what is good, and remove anything about large data or scale tests. Reuse the others' table setup if it exists, so column shapes match, and confirm shapes against the code the contract cites.

HARD SAFETY RULE: every loader must refuse any database host other than localhost or 127.0.0.1. All data is fake: invented names and example.com emails only. It must be impossible to run this against production by accident.

DESIGN: hand-designed cases, not random volume. Every seeded person exists for a stated reason. If two people prove the same thing, remove one. Aim for roughly 60 to 120 people, and go lower if every case is still covered. No generator of bulk rows, no sizes.

WRITE, under ${SUITE}/seed/:
1. use-cases.json: the numbered list of every use case (UC-01 and so on), each with a one-line description and the contract section it comes from. Be thorough, and derive it from the contract rather than this list. It must include at least:
   - Stages: every main stage occupied; every exit; INTERESTED reset after a later stage; a reminder under its parent; an unmapped raw stage; no stage at all; Signed Paid and Signed Non paid both counting as one success.
   - Movement: a normal step in the window; a late step; skipped stages; backward move; an exit inside and outside the window; timed out; A to B to C merged before any sync; A to B seen by a sync and then merged to A to C; A to B to A both ways; a reconcile-only change.
   - Timing: too recent, inside a step window; too recent for overall conversion; old enough for all; a stuck person over the limit; one exactly at the limit; an imported person inactive with no move; an imported person who then moves ("at least N days"); created exactly at the tracking start; a late-night change that falls on a different local day when a non-UTC zone is set.
   - Categories: one position; several positions in one track; several positions across tracks; no position; an unmapped position; every one of the 5 tracks present; a program below and above the minimum sample, enough for the "lowest step needs the minimum" rule; a known source, an unknown source, no source.
   - Volume: form submissions from the Internship Application form, from another form that must not count, one submission in the current and one in the previous period, a person with two submissions.
   - Lifecycle: soft deleted, soft deleted and restored.
   - Personal data: sentinel names, emails and form answers for the leak test.
   - Workspace states: stage field missing; positions and source fields missing; form objects missing or half built; a second workspace whose data must never leak into the first.
   Some cases, such as field-missing states, need a small separate setup rather than more people. That is fine.
2. seed-data.mjs: the people, timeline rows and submissions as readable tables, with every row tagged with the use case IDs it serves. Dates are relative to a fixed "now" so results repeat.
3. expected.mjs: the expected results, calculated from the seed in plain JavaScript, independently of the product's SQL, following the definitions in contract section 6: total contacts, active, stage totals, stuck, inactive, each funnel row (entered, eligible, reachedNext, exited, timedOut, inWindow, rates), overall conversion, median days, category rows, distinct totals, people in several. Do not read the product's SQL when writing it: two independent calculations must agree. Where a small set allows it, prefer writing a few key expected values by hand as a cross-check.
4. load.mjs: loads the seed into a dedicated local database, analytics_seed, on the local Docker Postgres (localhost:5432, postgres, password postgres), dropped and recreated each load. Also a --crm mode for the later full local run, which loads into the local CRM database "default" in the demo workspace named Apple, after the fields exist. It requires an explicit --i-am-local flag and refuses anything that is not local. Write that mode, but do not run it now.
5. seeded-metrics test, run with node like the rest of the suite: loads the seed, runs the REAL analytics code (sync, daily, metrics) with fakes for dependency injection, compares every number with expected.mjs, and reports each difference with both values. Say whether you think a difference is a product bug, a bug in expected.mjs, or a contract ambiguity, and leave the decision to the evaluator. A coverage check FAILS if any use case in use-cases.json has no seed row or no assertion. If a service file is not finished, report SKIPPED with the reason.
6. README.md: short, with the exact commands.

When ${SUITE}/run-tests.mjs exists, make a small edit: a seed layer running the seeded-metrics test, also included in the integration layer and in "all", so the agents running the suite pick it up. If it does not exist yet, provide seed/run.mjs that works alone and writes ${RESULTS}/latest-seed.json, then check again at the end of your work and make the edit if it has appeared.

Docker's Postgres is up. Keep memory use low.

Your final text must be at most 150 words: number of people and use cases, results now, and what is still skipped.`, { label: 'seed-data-small', phase: 'Seed data', model: 'opus', effort: 'max' })
return { result }