export const meta = {
  name: 'analytics-deep-review',
  description: 'Deep bug hunt over the changed code with many Opus agents at high effort: a planner assigns each one module with exact lines, reviewers follow callers and share notes, specialists hunt bug classes across modules, others try to disprove each finding',
  whenToUse: 'The user asked for a longer review to find bugs the quick pass skipped',
  phases: [
    { title: 'Plan', detail: 'map the changed code into modules with exact lines and callers', model: 'opus' },
    { title: 'Review', detail: 'one agent per module, plus specialists on each bug class', model: 'opus' },
    { title: 'Verify', detail: 'other agents try to disprove each finding', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const NOTES = `${WORK}/review-notes.md`
const KNOWN = `${WORK}/test-results/large-review-findings.md`
const SIDE = args?.side ?? 'server'

const SCOPES = {
  server: `Server side, all under ${WT}/:
- packages/twenty-server/src/modules/analytics/ (every file except specs and __tests__)
- the three edited CRM files, seen with git diff origin/main -- <file>: packages/twenty-server/src/modules/modules.module.ts, packages/twenty-server/src/database/commands/database-command.module.ts, packages/twenty-server/src/database/commands/cron-register-all.command.ts`,
  page: `Page side, all under ${WT}/:
- packages/twenty-front/src/modules/crm-analytics/ (every file except tests and __tests__), including charts/, components/, hooks/, utils/, graphql/, constants/, report-pdf/
- packages/twenty-front/src/pages/analytics/
- the two edited CRM files, seen with git diff origin/main -- <file>: packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx, packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`,
}

const SPECIALISTS = {
  server: [
    { id: 'path-crm-to-metric', title: 'A stage change, end to end', focus: 'Person stage changes in the CRM, then the timelineActivity row and its merge behaviour (read the real code in packages/twenty-server/src/modules/timeline/), the sync SQL, analytics.stage_transition, reconcile, the base CTEs, and finally funnel and category numbers. Does each hop keep the right person, stage, time and count? Replays, merged rows, A to B to A, skipped stages, backward moves, soft delete and restore, imported people.' },
    { id: 'path-jobs-and-failure', title: 'Start-up, jobs and failure', focus: 'Module wiring at server, worker and command start; cron registration; enqueue; the worker job; ensureStorage; each daily step with its try/catch; the sync log; connection cleanup; the off switch. What happens when a step throws, a job overlaps itself, the worker restarts mid-job, or the database is slow? Could anything stop the CRM starting, hold shared connections, or block the shared queue?' },
    { id: 'path-report-build', title: 'Building a frozen report', focus: 'Daily job, buildMissingReports, period computation, each compute call, trendSeries, the payload, the provisional rebuild, the read API. Is every number limited to the report\'s own period? Do comparisons use the right previous period? Can a rerun duplicate, lose or wrongly rewrite a report? Does the cap of 8 starve newer periods forever?' },
    { id: 'path-dates-and-zones', title: 'Dates and time zones', focus: 'Reporting time zone, local date SQL, day, week and month buckets, tracking start, the filter date range, windows and cutoffs, inclusive and exclusive ends, DST changes, week start, partial buckets, month lengths, year boundaries, the getCrmAnalyticsSeries windows, snapshots against buckets. Find any off-by-one or mixed UTC and local comparison.' },
    { id: 'path-counting', title: 'Double counting and wrong totals', focus: 'People with several positions, positions across tracks, joins that fan out rows, DISTINCT used or missing, COUNT over NULL, GROUP BY on the wrong key, unmapped and no-stage rows, reminder raw values under a parent, totals that must equal their parts, rates whose numerator and denominator come from different cohorts, snapshot dimensions against live counts. Trace real rows through the CTEs by hand.' },
    { id: 'path-concurrency-limits', title: 'Concurrency, timeouts and shared resources', focus: 'The page read limiter: can a slot leak, can waiters hang, what if the transaction throws or the client goes away? The 15 second budget and 8 second statement timeout. SET LOCAL against SET, session settings reaching the CRM\'s shared pool, read-only enforcement, the dedicated job data source and its cleanup, two jobs at once, a page read during a daily job, memory use on large workspaces, unbounded result sets.' },
    { id: 'path-security', title: 'Security and workspace isolation', focus: 'Every query\'s guards. Every analytics read and write filtered by workspace id: could one workspace see another\'s rows? SQL built with identifiers or values from config, stage options, or user input: anything not parameterized or escaped? API key access. Input validation for every argument of every query including getCrmAnalyticsSeries. Personal data reaching analytics tables or logs. Errors that leak internals.' },
  ],
  page: [
    { id: 'path-filter-to-chart', title: 'A filter, end to end', focus: 'Filter bar and chips state, click-to-filter from every chart, query variables, parse filter on the server, what comes back, chart props, tooltips, answer cards. Does every filter really narrow what each chart says? Do programs stay valid when the track changes? Stale results while refetching? Does a chart show numbers from a different filter than its title claims?' },
    { id: 'path-unknown-values', title: 'Unknown, null and small values', focus: 'Follow null, undefined, zero-denominator, under-minimum and still-in-progress values through utils, rate formatting, every chart in charts/, the heatmaps, sparklines, answer cards, and the PDF. Is 0% ever shown for something unknown? Does any line drop to 0 on null? Any NaN, Infinity, division by zero, or negative width? Do max-based scales break when all values are 0 or null, or with one row?' },
    { id: 'path-report-to-pdf', title: 'From a stored report to the screen and the PDF', focus: 'Stored payload type, AnalyticsReportView, the Download PDF button with its dynamic import, downloadAnalyticsReportPdf, every PDF section. Do screen and PDF agree on each number and label? What happens with an old payload missing fields? Are errors visible? Can the PDF library load with the normal page? Can a person name reach the PDF? Will react-pdf actually accept every prop used, such as Svg text and styles?' },
    { id: 'path-states-and-failure', title: 'Page states and failures', focus: 'Meta load, page state, permission refusal, off switch, never synced, stale, the busy error from the limiter, one failing chart request, retries, empty results, request count per tab, unmount during a request. Does one failure take down the tab or the page? Is any error swallowed so a chart shows nothing and looks fine?' },
    { id: 'path-chart-truth', title: 'Do the marks show the right numbers?', focus: 'For every chart: are scales, ticks, axis labels and bar lengths correct against the values? Does each tooltip show the number of the mark under the mouse? Do stacked segments sum to the total, do 100% bars sum to 100, is the funnel ordered, does the diverging chart use one shared scale on both sides? Sorting and ties. Colors assigned to the right series after filtering. Legend order against draw order. Long labels and many rows.' },
    { id: 'path-react-lifecycle', title: 'React behaviour', focus: 'Hooks order, effects and their dependencies, stale closures, memoized values with missing inputs, keys on lists, state not reset when filter, period or report changes, refetch races where an older response overwrites a newer one, resize observers cleaned up, event listeners removed, render loops, expensive work on every render, anything that would throw during render on real data.' },
    { id: 'path-words-against-numbers', title: 'Does every title and note tell the truth?', focus: 'For each chart, card, answer, note and tooltip: read the words, then trace the number back to contract section 6 and the server SQL. Does "people" really count people? Is the date basis stated right? Do answer cards pick the right stage? "Biggest drop", "best converting" and "slowest": do they ignore small samples? Would a recruiter draw a wrong conclusion anywhere?' },
  ],
}

const PLAN = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          functions: { type: 'array', items: { type: 'string' } },
          callers: { type: 'array', items: { type: 'string' } },
          callees: { type: 'array', items: { type: 'string' } },
          focus: { type: 'string' },
        },
        required: ['id', 'title', 'files', 'functions', 'callers', 'callees', 'focus'],
      },
    },
    uncovered: { type: 'array', items: { type: 'string' } },
  },
  required: ['units', 'uncovered'],
}

const DEFECT = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    line: { type: 'number' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    problem: { type: 'string' },
    scenario: { type: 'string' },
    evidence: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['file', 'line', 'severity', 'problem', 'scenario', 'evidence', 'fix'],
}
const FINDINGS = {
  type: 'object',
  properties: { defects: { type: 'array', items: DEFECT }, summary: { type: 'string' } },
  required: ['defects', 'summary'],
}
const VERDICTS = {
  type: 'object',
  properties: {
    confirmed: { type: 'array', items: DEFECT },
    plausible: { type: 'array', items: DEFECT },
    refuted: { type: 'array', items: { type: 'object', properties: { problem: { type: 'string' }, why: { type: 'string' } }, required: ['problem', 'why'] } },
  },
  required: ['confirmed', 'plausible', 'refuted'],
}

const READ_ONLY = `This is a read-only review. Do not edit any product file. Do not run git add, commit, stash, checkout, merge or push; git diff, git log and git grep are fine. Do not run tests, yarn, nx, tsgo, lint, docker or builds: the laptop is short of memory. Another agent is fixing the known findings right now, so code may shift slightly under you; check the current file before reporting.`

const CONTEXT = `The code is the CRM Analytics tool inside FloLabs CRM, a fork of Twenty, the company's live CRM. It is read-only toward CRM records. Working copy: ${WT} (branch analytics_tool). Definitions of right: ${WT}/docs/analytics/dashboard-redesign.md, and ${WORK}/contract.md sections 3 to 7 with its last sections "Decisions from testing" and "Dashboard redesign". Read the parts you need.
A quick review already ran and found the bugs listed in ${KNOWN}: those are being fixed now, so do not report them again. Skim that file first. Your job is the bugs it missed: the user expects careful, unhurried work here.`

phase('Plan')
const plan = await agent(`You are the planner of a large code review. ${CONTEXT}
${READ_ONLY}

Scope:
${SCOPES[SIDE]}

Split this code into 16 to 20 review units, so one reviewer can check each unit deeply in about 15 minutes, without reading anything else first. Use wc -l and grep to see sizes and exports. Every function in scope belongs to exactly one unit, and no unit is above about 1,000 lines, so split large files by function group; give the riskiest code, such as metric SQL and sync, its own small units. For each unit give: a short id; a title; files as absolute paths with exact line ranges (path:start-end); the function names; callers, as file:line for where each main function is used; callees, as file:line for what it calls; and focus, what could go wrong here in one or two sentences. List in uncovered anything in scope you left out.`, { label: `deep-planner-${SIDE}`, phase: 'Plan', model: 'opus', effort: 'high', schema: PLAN })

const items = [
  ...plan.units.map((unit) => ({ ...unit, kind: 'module' })),
  ...SPECIALISTS[SIDE].map((specialist) => ({ ...specialist, kind: 'path' })),
]
log(`${SIDE}: ${plan.units.length} modules and ${SPECIALISTS[SIDE].length} specialists; left out: ${plan.uncovered.length ? plan.uncovered.join(', ') : 'nothing'}`)

const SHARED = `Shared notes: ${NOTES} is read by every reviewer, so it is how you talk to the others. Read it when you start and again before you finish. When you find something another piece of code should know, such as a value that can be null, a unit that changes, or a contract your code assumes, append one line with Bash: echo "[your id] file:line short note" >> "${NOTES}". If a note from another agent touches your code, check it and report the resulting bug if it is real.`

const REPORT = `Find real bugs. Check for: wrong numbers; a label that says something different from the value; off-by-one and inclusive against exclusive ends; mixed UTC and local dates; joins that fan out or double count; COUNT and aggregates over NULL; division by zero, NaN, negative sizes; empty arrays and single-row data; a null reaching code that assumes a value; missing await and unhandled rejections; resources not released on the error path; race conditions; stale state, wrong effect dependencies, wrong keys; injection and missing permission checks; a crash during render; imports or props that would fail to compile; anything that could stop the CRM starting or slow it.
Give a concrete scenario for each: these inputs, this wrong result, and how you traced it. Severity: blocker stops the CRM or the page; major gives a wrong number or a broken feature; minor is a real but small bug. Do not report style, naming, or missing tests. Do not report what the contract's "Decisions from testing" settles. An empty list is a fine answer if you looked hard and the code is right. Take the time you need, up to about 15 minutes. summary is at most 40 words.`

const reviewPrompt = (item) => item.kind === 'module'
  ? `You are one reviewer in a large code review, and you own one module. ${CONTEXT}
${READ_ONLY}

YOUR MODULE: ${item.id}: ${item.title}
Go directly to: ${item.files.join(', ')}
Functions: ${item.functions.join(', ')}
Called from: ${item.callers.join(', ') || 'see the code'}
Calls into: ${item.callees.join(', ') || 'see the code'}
What could go wrong: ${item.focus}

Read every line you own closely. Then follow the code: go to each caller to see what it passes and what it does with the result, and into each callee far enough to know what it really returns. Do not read unrelated files. For SQL, trace a small example by hand.
${SHARED}
${REPORT}`
  : `You are a specialist in a large code review. Module reviewers are each checking one piece; you hunt one class of bug across the pieces. ${CONTEXT}
${READ_ONLY}

YOUR SPECIALTY: ${item.id}: ${item.title}
${item.focus}

Follow it through the real code, using grep to find each next step. At each handoff, check that both sides agree on the shape, unit, meaning, nullability and date basis.
${SHARED}
${REPORT}`

const verifyPrompt = (item, defects) => `Other agents reported the bugs below in the CRM Analytics tool. Try to disprove each one by reading the real, current code. ${CONTEXT}
${READ_ONLY}

For each: go to the line, and check the scenario really happens given what callers pass and what the code does, and that the contract does not settle it and it is not already in ${KNOWN}. If it holds, put it in confirmed, correcting its severity, file, line or fix when needed. If it is wrong, already handled, or cannot actually happen, put it in refuted with one line saying why. If you cannot decide after checking, put it in plausible. Reported by ${item.id}:
${JSON.stringify(defects, null, 1)}`

const results = await pipeline(
  items,
  (item) => agent(reviewPrompt(item), { label: `deep:${item.id}`, phase: 'Review', model: 'opus', effort: 'high', schema: FINDINGS }),
  (review, item) => (review && review.defects.length > 0
    ? agent(verifyPrompt(item, review.defects), { label: `verify:${item.id}`, phase: 'Verify', model: 'opus', effort: 'max', schema: VERDICTS })
    : { confirmed: [], plausible: [], refuted: [] }),
)

const finished = results.filter(Boolean)
const confirmed = finished.flatMap((result) => result.confirmed)
const plausible = finished.flatMap((result) => result.plausible)
const refuted = finished.flatMap((result) => result.refuted)
log(`${SIDE}: ${confirmed.length} confirmed, ${plausible.length} plausible, ${refuted.length} refuted, ${items.length - finished.length} agents did not finish`)
return { side: SIDE, modules: plan.units.map((unit) => unit.id), uncovered: plan.uncovered, notFinished: items.length - finished.length, confirmed, plausible, refuted }
