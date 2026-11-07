export const meta = {
  name: 'analytics-tests',
  description: 'Keep running: Opus writes permanent unit, integration and black-box test files; Haiku runs them when code changes; Sonnet evaluates results and test quality',
  whenToUse: 'Continuous testing during the CRM Analytics build',
  phases: [
    { title: 'Write tests', detail: 'Opus writes and extends the permanent test suite', model: 'opus' },
    { title: 'Run tests', detail: 'Haiku runs the suite and reports exact results', model: 'haiku' },
    { title: 'Evaluate', detail: 'Sonnet separates real bugs from bad tests and checks coverage', model: 'sonnet' },
    { title: 'Wait for changes', detail: 'Haiku waits until the code changes', model: 'haiku' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SUITE = `${WT}/packages/twenty-utils/flolabs/analytics-tests`
const RESULTS = `${WORK}/test-results`
const MAX_ROUNDS = 40
const MAX_IDLE_WAITS = 8

const authorPrompt = (extra) => `You write the permanent automated test suite for the CRM Analytics tool inside FloLabs CRM, a fork of Twenty. The user wants real test FILES that anyone can run over and over, covering unit, integration and black-box testing. Other agents will run your tests and judge them.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages, a different checkout. Read ${WORK}/contract.md first, especially sections 5, 6, 7, 8 and 9, then ${WORK}/brief.md.

PRODUCT CODE IS OFF LIMITS. Other agents are writing it right now under packages/twenty-server/src/modules/analytics/ and packages/twenty-front/src/modules/crm-analytics/. Never edit product code or existing CRM files. If you find a bug, your test should expose it.
Do not run git add, commit, stash or checkout, nor yarn install or heavy builds. Write black-box tests from the CONTRACT, not from reading the implementation, so they catch implementation mistakes.

SAFETY, a hard rule: this suite must only ever talk to a local machine. Black-box and UI tests must read the target URL, refuse to run unless the host is localhost or 127.0.0.1, and integration tests must refuse any database host other than localhost. It must be impossible to point this at production by accident. Test login is the local seed user tim@apple.dev with the same password.

SUITE LAYOUT, everything new, under ${SUITE}/:
- README.md: what each layer covers, exact commands, what each needs running. Short.
- run-tests.mjs: one entry point, run from ${WT}: node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <name>. Layers:
  - unit-server: all specs under packages/twenty-server/src/modules/analytics/, one jest process with --runInBand and --config=packages/twenty-server/jest.config.mjs.
  - unit-front: all tests under packages/twenty-front/src/modules/crm-analytics/, one jest process with --runInBand and --config=packages/twenty-front/jest.config.mjs.
  - integration: real Postgres, see below.
  - blackbox: GraphQL API against a running local CRM.
  - ui: Playwright browser tests against a running local CRM.
  - all: every layer in that order.
  A layer whose prerequisite is missing (Docker database down, local CRM not answering on http://localhost:3000, a product file not written yet) must report SKIPPED with the exact reason, never fail and never hang. Each layer must finish within 9 minutes. Every run writes ${RESULTS}/latest-<layer>.json with passed, failed, skipped, each failure's test name and message, and duration, and appends one line to ${RESULTS}/history.jsonl with a timestamp. Exit code 0 only if nothing failed.
  On Windows, Nx needs the shim described in ${WORK}/brief.md, but prefer calling jest and playwright directly through node_modules, so the runner works without Nx.
- integration/: the real-Postgres layer. A separate agent is building a harness at ${WORK}/e2e/sql-proof/ with results in ${WORK}/e2e/RESULTS.md. If it exists, reuse and adapt it into this folder rather than starting over; otherwise build the same thing. Use database analytics_proof on the local Docker container (postgres, password postgres, port 5432), drop and recreate it each run. Create realistic CRM tables, and run the REAL analytics code with fakes for dependency injection, never copied SQL. Cover contract section 9: the hand-calculated sample table exactly, including NEW median 5; sync replay adds nothing; merged rows append; A to B to A; cursor ignores reconcile rows; reconcile rows flagged and not repeated; snapshot and consistency check, including a person created between runs; stage totals sum to total contacts; several positions; too recent never 0%; soft delete; imported people outside cohorts; reports frozen on rerun; missing stage field reported rather than thrown; off switch.
- blackbox/: tests through the real GraphQL API only, as a user would call it, each query in section 7 with no knowledge of internals. Valid login; response shapes match the section 7 types; bad filter values rejected; a request with no token refused; a role without EXPORT_CSV gets FORBIDDEN; identities such as entered = eligible + inWindow and eligible = reachedNext + timedOut + exited hold in real responses; rates are null rather than 0 when unknown.
- ui/: Playwright tests with their own config in this folder, using the Playwright already in the repo. Log in, open /analytics from the sidebar, every tab renders, filters narrow the numbers, stuck row opens the person, permission and empty states, keyboard use of tabs and tables, no 0% for unknown values, no console errors, screenshots saved to ${RESULTS}/screenshots/ in light and dark. Query by visible text and role.
- Add unit specs for gaps only under the suite folder, not beside product code. Do not duplicate specs that already exist.
Tests must assert behaviour and real numbers. No empty assertions, no tests that pass whatever the code does. Keep it as small as this coverage allows: this is a test suite, not a framework.

${extra}

Your final text must be at most 150 words: files written or changed, and what each layer needs to run.`

const RUN = {
  type: 'object',
  properties: {
    ran: { type: 'array', items: { type: 'object', properties: {
      layer: { type: 'string' }, status: { type: 'string', enum: ['passed', 'failed', 'skipped', 'error'] },
      passed: { type: 'number' }, failed: { type: 'number' }, skipped: { type: 'number' }, reason: { type: 'string' },
      failures: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, message: { type: 'string' } }, required: ['test', 'message'] } },
    }, required: ['layer', 'status', 'passed', 'failed', 'skipped', 'reason', 'failures'] } },
  },
  required: ['ran'],
}

const runPrompt = `You run the CRM Analytics automated tests and report exactly what happened. Do not fix or edit anything. Do not run git add, commit or checkout.
Working copy: ${WT}. In Bash, first run: cd ${WT} && bash ${RESULTS}/wait-for-change.sh --mark
Then run these one at a time, never together, each with the Bash tool's timeout set to 590000 ms:
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer unit-server
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer unit-front
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer integration
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer blackbox
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer ui
After each, read ${RESULTS}/latest-<layer>.json. If a run file does not exist yet or a command crashes, report status error with the exact message. Report each layer's counts and each failure's test name and message, verbatim and trimmed to 400 characters. Do not guess at causes.`

const EVAL = {
  type: 'object',
  properties: {
    realBugs: { type: 'array', items: { type: 'object', properties: {
      test: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, problem: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
    }, required: ['test', 'file', 'severity', 'problem', 'evidence', 'fix'] } },
    badTests: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, problem: { type: 'string' } }, required: ['test', 'problem'] } },
    notReadyYet: { type: 'array', items: { type: 'string' } },
    missingCoverage: { type: 'array', items: { type: 'string' } },
    weakTests: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['realBugs', 'badTests', 'notReadyYet', 'missingCoverage', 'weakTests', 'summary'],
}

const evalPrompt = (run) => `You evaluate the CRM Analytics test results and the tests themselves. Be skeptical in both directions. Do not edit anything. Do not run git add, commit or checkout.
Working copy: ${WT}. Suite: ${SUITE}/. Contract: ${WORK}/contract.md. Other agents may still be writing product code, so check whether a failing file is simply unfinished.

Results of this run:
${JSON.stringify(run, null, 1)}

For each failure, read the test and the product code, and decide: a real product bug (realBugs, with file, line evidence and a concrete fix), a wrong test (badTests), or code not written yet (notReadyYet).
Then judge the suite itself against contract sections 5, 6, 7, 8 and 9: list requirements with no test (missingCoverage), and tests that would pass even if the code were wrong (weakTests). Only list what matters, for example a metric definition with no test, not style.
Append the real bugs, if any, to ${RESULTS}/bugs.md under a heading with the current time, skipping bugs already listed there. Create the file if needed. summary is at most 60 words.`

const waitPrompt = `Run exactly this one command with the Bash tool, with its timeout set to 590000 ms, and return only its last line of output, which is CHANGED or NO_CHANGE:
bash ${RESULTS}/wait-for-change.sh
Do nothing else.`

phase('Write tests')
await agent(authorPrompt('This is the first round: build the suite.'), { label: 'test-author', phase: 'Write tests', model: 'opus', effort: 'max' })

const rounds = []
let idle = 0
for (let round = 1; round <= MAX_ROUNDS && idle < MAX_IDLE_WAITS; round++) {
  phase('Run tests')
  const run = await agent(runPrompt, { label: `test-run-${round}`, phase: 'Run tests', model: 'haiku', effort: 'low', schema: RUN })
  phase('Evaluate')
  const evaluation = run ? await agent(evalPrompt(run), { label: `test-evaluate-${round}`, phase: 'Evaluate', model: 'sonnet', effort: 'high', schema: EVAL }) : null
  const counts = run ? run.ran.map((layer) => `${layer.layer}: ${layer.status} ${layer.passed}/${layer.passed + layer.failed}`).join(', ') : 'run failed'
  log(`Round ${round}: ${counts}. ${evaluation ? evaluation.realBugs.length + ' real bugs, ' + evaluation.badTests.length + ' bad tests' : ''}`)
  rounds.push({ round, counts, evaluation: evaluation ? { realBugs: evaluation.realBugs, summary: evaluation.summary } : null })

  const needsAuthor = evaluation && (evaluation.badTests.length > 0 || evaluation.missingCoverage.length > 0 || evaluation.weakTests.length > 0)
  if (needsAuthor) {
    phase('Write tests')
    await agent(authorPrompt('This is a later round. The suite exists: extend and correct it, do not rewrite it. An evaluator reported:\n' + JSON.stringify({ badTests: evaluation.badTests, missingCoverage: evaluation.missingCoverage, weakTests: evaluation.weakTests }, null, 1) + '\nConfirm each point before acting. Do not change a test just to make it pass if the product is what is wrong.'), { label: `test-author-${round}`, phase: 'Write tests', model: 'opus', effort: 'xhigh' })
  }

  phase('Wait for changes')
  let changed = false
  while (!changed && idle < MAX_IDLE_WAITS) {
    const waited = await agent(waitPrompt, { label: 'test-wait', phase: 'Wait for changes', model: 'haiku', effort: 'low' })
    changed = typeof waited === 'string' && waited.includes('CHANGED') && !waited.includes('NO_CHANGE')
    idle = changed ? 0 : idle + 1
    if (!changed) {
      log(`No code changes yet, idle wait ${idle} of ${MAX_IDLE_WAITS}`)
    }
  }
}
log('Test workflow ending after ' + rounds.length + ' rounds')
return { rounds }