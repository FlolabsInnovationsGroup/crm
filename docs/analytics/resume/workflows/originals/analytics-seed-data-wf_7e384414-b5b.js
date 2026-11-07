export const meta = {
  name: 'analytics-seed-data',
  description: 'Write repeatable seed data for testing: realistic recruiting data at small and production scale, with independently calculated expected results',
  whenToUse: 'Test data for the CRM Analytics build',
  phases: [
    { title: 'Seed data', detail: 'generator, loaders, expected results and scale test', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SUITE = `${WT}/packages/twenty-utils/flolabs/analytics-tests`
const RESULTS = `${WORK}/test-results`

phase('Seed data')
const result = await agent(`You write the seed data for testing the CRM Analytics tool in FloLabs CRM, a fork of Twenty. The user asked for seeded data to be used for testing. It lets us test with realistic data, at real scale, and see real numbers on the page. No production data is available or allowed.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages. Read ${WORK}/contract.md (sections 1, 3 to 6, and 9) and ${WORK}/brief.md first.
Product code is off limits, other agents are writing it now. Never edit it. Do not run git add, commit, stash or checkout, nor yarn install or heavy builds. Other agents are writing ${SUITE}/ too (run-tests.mjs, integration/, dataflow/), and a harness may exist at ${WORK}/e2e/sql-proof/. You own only ${SUITE}/seed/. Reuse their table setup if it exists, so the column shapes match; confirm shapes against the code the contract cites.

HARD SAFETY RULE: every loader must refuse any database host other than localhost or 127.0.0.1, and any target that is not a local database. All data is fake: invented names and example.com or example.org emails only. It must be impossible to run this against production by accident.

WRITE, under ${SUITE}/seed/:
1. generate.mjs: a deterministic generator (a fixed seed in, identical data out, no database needed), with sizes small (about 300 people) and large (about 43,000 people, matching production; about 42,000 applications-like submissions are fine). It produces people, stage history as timeline rows, and form submissions, realistic for this recruiting pipeline:
   - Pipeline from the contract's stage table, with people dropping off at each stage in believable proportions, most stopping early, few reaching Signed.
   - Reminder and unmapped raw stage values, exits (No answer, Not Interested, Rejected by us), INTERESTED resets from follow-up forms, people who skip stages, backward moves, merged timeline rows, people with no stage.
   - All 39 positions and the 5 tracks, unevenly, with a share of people holding several positions; all sources including unknown values.
   - Imported people with createdAt before tracking start and no history; people created after it across about 5 months, so cohorts, trends, weeks and months have data, with recent people still inside their windows.
   - Some soft-deleted people, and stuck people well past their limit.
   - Fake names, emails and answers, so the leak test has something to look for.
2. expected.mjs: calculates the expected results from the generated data in plain JavaScript, independently of the product's SQL, following the definitions in contract section 6: total contacts, active people, stage totals, stuck and inactive counts, each funnel row (entered, eligible, reachedNext, exited, timedOut, inWindow, rates), overall conversion, median days, category rows, distinct totals, people in several. Do not read the product's SQL when writing it: the point is that two independent calculations must agree. Use a fixed "now" so results are repeatable; if the product code cannot accept a fixed now, generate dates relative to the run's now and calculate from that.
3. load-proof.mjs: loads a size into a dedicated local database, analytics_seed, on the local Docker Postgres (localhost:5432, postgres, password postgres), dropped and recreated each load, in fast batches. Separate from analytics_proof, which other tests use.
4. seeded-metrics test, run with node like the rest of the suite: loads small, runs the REAL analytics code (sync, daily, metrics) with fakes for dependency injection, and compares every number with expected.mjs. It reports each difference with both values. A difference may be a product bug, a bug in expected.mjs, or an ambiguity in the contract: say which you think, with reasoning, and leave the decision to the evaluator. If a service file is not written yet, report SKIPPED with the reason.
5. scale test: loads large, runs a real sync and daily, and times each page query (Overview, Funnel, Categories, Trends) with and without filters against the contract's 8 second page limit and 120 second job limit. Report timings to ${RESULTS}/scale-latest.md with row counts and the slowest queries. Report anything slow with its plan from EXPLAIN. If a service is not written yet, SKIPPED.
6. load-crm.mjs: for the later full local run. Loads a size into the local CRM database "default" in the seed workspace named Apple, after the fields exist. It only ever touches local data, and it must refuse to run unless the database is local, the workspace is the local demo one, and an explicit --i-am-local flag is passed. Write it, but do not run it now: the local CRM database is not set up yet.
7. README.md: what each size contains and the exact commands. Short.

When ${SUITE}/run-tests.mjs exists, add a small edit: a seed layer running the seeded-metrics test on small, included in the integration layer and in "all" so the agents running the suite pick it up, and a separate scale layer that only runs when asked for. If it does not exist yet, provide seed/run.mjs that works alone and writes ${RESULTS}/latest-seed.json, then check again at the end of your work and make the edit if it has appeared.

Docker's Postgres is up. Check disk first: D: has only about 6 GB free, so drop analytics_seed when you finish with the large size, and do not run the large load more than needed. Keep memory use low: the machine has 15 GB and many agents are running. Generate the large set in streaming batches rather than holding it all in memory.

Your final text must be at most 150 words: what exists, results now, scale timings if any, and what is still skipped.`, { label: 'seed-data', phase: 'Seed data', model: 'opus', effort: 'max' })
return { result }