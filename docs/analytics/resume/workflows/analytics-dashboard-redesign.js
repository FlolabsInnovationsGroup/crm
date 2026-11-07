export const meta = {
  name: 'analytics-dashboard-redesign',
  description: 'Rebuild the CRM Analytics page as a graph-first dashboard, add demo data, review the changed code once, then fix',
  whenToUse: 'The redesign the user asked for after seeing the first version',
  phases: [
    { title: 'Foundation', detail: 'series query, demo data, chart kit and page shell', model: 'opus' },
    { title: 'Pages', detail: 'Overview and Funnel, Tracks and Trends, filters and Reports', model: 'opus' },
    { title: 'Review', detail: 'one independent review of the changed code', model: 'opus' },
    { title: 'Fix', detail: 'one fix pass on real findings', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const FRONT_MODULE = `${WT}/packages/twenty-front/src/modules/crm-analytics`
const CHARTS = `${FRONT_MODULE}/charts`
const SERVER_MODULE = `${WT}/packages/twenty-server/src/modules/analytics`
const DEMO = `${WT}/packages/twenty-utils/flolabs/analytics-tests/demo`
const DATAVIZ = 'C:/Users/Ahsan/AppData/Local/Temp/claude/bundled-skills/2.1.317/a67a8087992ce5308233718bb6e25574/dataviz'

const COMMON = `You are working on the CRM Analytics tool inside FloLabs CRM, a fork of Twenty. This is the company's live CRM. The user saw the first version and asked for a graph-first dashboard that is very easy to read and navigate, and they will present it to the team.

Working copy: ${WT} (branch analytics_tool). Use absolute paths, and cd there in Bash. Never touch D:/Coding/Flolabs/crm/packages, a different checkout.

Read first, in full: ${WT}/docs/analytics/dashboard-redesign.md (THE DESIGN, follow it exactly; it overrides older chart rules). Then contract sections as needed in ${WORK}/contract.md, including its last sections "Decisions from testing" and "Dashboard redesign". Metric definitions there still hold.

Rules:
- Never edit an existing CRM file. All edits stay inside the folders named in your job.
- Do not run git add, commit, stash, checkout, merge or push, nor yarn install, nx, tsgo, lint, lingui, docker or any build. You may run one test at a time: cd ${WT} && npx jest <file> --config=packages/<twenty-front or twenty-server>/jest.config.mjs. Keep memory use low.
- CLAUDE.md conventions apply: types not interfaces, no any, named exports, functional components, no abbreviations, use existing helpers such as isDefined, short comments only for a non-obvious why.
- Front conventions: Linaria with names starting Styled, CSS properties sorted, themeCssVariables from twenty-ui/theme only with no hard-coded colors, one const per constants file, files only in leaf folders, no ../ imports, inline type imports, <Name>Props, icons from twenty-ui/icon, every user-facing string through Lingui (t or useLingui) without running lingui extract or compile, plain words, no em dashes or emojis in any string.
- No new npm packages. Available: d3-shape, @nivo/line, @nivo/pie, and the CRM's graph widgets.
- Never render 0% for something unknown. Build what the design says, nothing more.

Your final text must be at most 150 words: what you built, tests run with results, deviations from the design, and anything not verified.`

phase('Foundation')
const [serverWork, demoData, chartKit] = await parallel([
  () => agent(`${COMMON}

YOUR JOB: the server additions in the design's "Server additions" section. Edit only under ${SERVER_MODULE}/, plus the front copy of the types at ${FRONT_MODULE}/types/AnalyticsApi.ts and the section 7 type block in both ${WORK}/contract.md and ${WT}/docs/analytics/contract.md. You own both type files: add exactly the types in the design and keep them byte-identical.
Add getCrmAnalyticsSeries with its input DTO and resolver method, the same guards as the other queries. Reuse the existing series code in crm-analytics-metrics.service.ts. Do not compute cohorts or movement for it. Raise the page read wait to about 10 seconds and keep 2 running at once. Boot safety matters most: a bad provider or a duplicate GraphQL type stops the whole CRM, so be exact and check how the existing input DTO is declared. Add specs for the request cap, grouping and read-only behaviour, and run every spec you affect one at a time. Also confirm stage limits reach the page through meta; if the stage definition type lacks the limit in days, add it the same way.`, { label: 'redesign-server', phase: 'Foundation', model: 'opus', effort: 'high' }),

  () => agent(`${COMMON}

YOUR JOB: the demo data in the design's "Demo data" section. You own only ${DEMO}/. Do not change packages/twenty-utils/flolabs/analytics-tests/seed/ or any product code. Read seed/load.mjs and seed/seed-data.mjs first and reuse their approach and helpers, including the CRM-readiness checks and the local-only guard from analytics-tests/lib/local-only.cjs. Read how the real snapshot writes rows in ${SERVER_MODULE}/services/crm-analytics-snapshot.service.ts so the backfill matches it exactly, and the positions, tracks and stages in ${SERVER_MODULE}/constants/crm-analytics-config.constant.ts.

Write:
1. generate.mjs: a deterministic generator with one size constant, default 150 applications. Realistic invented first and last names, example.com emails, positions from the real config across all 5 tracks, sources LINKEDIN, WEBSITE, REFERRAL, UNIVERSITY, INSTAGRAM, JOB_BOARD. Simulate each person's path through the real stages with durations and probabilities that differ by track and source, stopping at now. Include exits, stalled and stuck people, a few CONTACTED_REMINDER values, 8 imported people created before tracking start who never moved, and 2 people on an unmapped stage. Every person gets one Internship Application submission on the day they enter, and a few get a second. Add a few submissions from another form that must not count. Make recent weeks busier so last week shows about 10 to 15 new applications.
2. load.mjs, run as: node load.mjs --i-am-local [--stage people|snapshots]. "people" removes earlier demo and seed rows by id pattern, writes people, timeline rows and submissions into the Apple workspace of the local database "default", soft deletes every other person, and sets the tracking start key. Use the exact shape the CRM writes. "snapshots" backfills analytics.daily_snapshot for every local day from tracking start to yesterday, and needs the analytics schema that the first sync creates. Refuse any non-local database, as seed/load.mjs does.
3. fields.mjs: prints the option values people need, in a form ${WORK}/e2e/local-run/setup-seed-objects.mjs can use, and update that script so it uses the demo's values in addition to the seed's. An existing field keeps its options, so it must add missing options through the metadata API rather than skip.
4. README.md: exact commands, short.
Docker's Postgres is up, and the CRM server is stopped. Test the generator alone with a small node script: counts per stage, track and week look right and the seed is repeatable. Do not run the load, because the main session runs it after the build.`, { label: 'redesign-demo-data', phase: 'Foundation', model: 'opus', effort: 'high' }),

  () => agent(`${COMMON}

YOUR JOB: the chart kit that every tab will use, and the page shell. Three more agents start as soon as you finish and will read your code, so keep props clear and stable.

Read first: ${DATAVIZ}/SKILL.md, ${DATAVIZ}/references/choosing-a-form.md, marks-and-anatomy.md, color-formula.md, interaction.md, anti-patterns.md and palette.md, plus C:/Users/Ahsan/.claude/skills/ui-craft/references/dashboard.md if it exists. Choose a categorical order, one sequential hue and a neutral from the CRM's theme tokens, look up their real values in light and dark in packages/twenty-ui, and run: node ${DATAVIZ}/scripts/validate_palette.js "<hex,hex,...>" --mode dark and again with --mode light. Fix anything that fails. Say what you chose.

Files you own, all in the new leaf folder ${CHARTS}/ (plain DOM or SVG with Linaria unless noted):
- AnalyticsChartCard: title as a plain question, optional info icon with a tooltip for the note, optional right-side control, loading, empty and error states with a retry, a "Show numbers" toggle closed by default that reveals its children.
- AnalyticsAnswerCards: up to three cards with label, big value, one line of detail.
- AnalyticsChartTooltip: one shared tooltip used by every chart, following the mouse and clamped to the card.
- AnalyticsHorizontalBarChart: ranked or ordered bars, single or stacked segments, optional 100% mode, optional tick per row, lighter style for small samples, optional divider group, optional onRowClick. Long labels must not break the layout.
- AnalyticsColumnChart: vertical columns, single or stacked, with one highlighted column.
- AnalyticsFunnelChart: the classic centered funnel with connectors in the design.
- AnalyticsDivergingBarChart: per row, entered to the right and left to the left of a center line.
- AnalyticsHeatmap: rows by columns in one hue, a value in each cell, dash for unknown, a lighter pattern with "so far" for in-progress cells, a sticky first column and horizontal scroll when wide.
- AnalyticsScatterChart: x and y with labeled points, median lines and click, one hue.
- AnalyticsDonutChart: built with d3-shape arcs, up to 4 slices, total in the center, direct labels.
- AnalyticsLineChart: one or many series, optional gray previous series, crosshair tooltip, null leaves a gap and never drops to 0, optional area for one series, a compact size for small multiples and a direct label on the last point when there are up to 4 series. Plain SVG is preferred so all charts look alike; only if that is not practical, wrap ${FRONT_MODULE}/components/AnalyticsTrendChart.tsx.
- AnalyticsSparkline: tiny line for stat tiles, null leaves a gap.
Every chart: no entrance animation, aria-label with a one-line summary, correct in light and dark, resizes with its container, handles empty data without crashing, and takes plain data props with no GraphQL inside.

Also own these in ${FRONT_MODULE}/: hooks/useCrmAnalyticsSeries.ts (calls getCrmAnalyticsSeries through useCrmAnalyticsQuery with the core client, plus its query file under graphql/; the type file is being updated now by another agent with exactly the types in the design); AnalyticsContent.tsx changes so tabs are Overview, Funnel, Tracks & sources, Trends, Reports, with a single onFilterChange passed to every tab for click-to-filter, the filter row stays at the top, and the two-column grid container is a shared component the tabs use. Leave the tab bodies working so the page still compiles. The next agents replace them.

Write a small test only where it protects real behaviour: null gaps in the line chart, unknown cells in the heatmap, no crash on empty data. Run them.`, { label: 'redesign-chart-kit', phase: 'Foundation', model: 'opus', effort: 'xhigh' }),
])
log(`Foundation: server ${serverWork ? 'ok' : 'FAILED'}, demo ${demoData ? 'ok' : 'FAILED'}, chart kit ${chartKit ? 'ok' : 'FAILED'}`)

phase('Pages')
const PAGE_RULES = `The chart kit is in ${CHARTS}/ and the shared hook is hooks/useCrmAnalyticsSeries.ts: read them and use them, and do not build your own charts. Keep payload fields honest: read contract section 6 before naming what a number means. Move the existing table of each view behind "Show numbers" rather than deleting it. AnalyticsRateCell remains the way a rate shows in tables. Only edit the tab files in your job, plus small new utils for your tab under ${FRONT_MODULE}/utils/. Keep or update existing tests for what you change, and remove tests only for what no longer exists. Run the tests you affect one at a time.`

const [overviewFunnel, tracksTrends, navigationReports] = await parallel([
  () => agent(`${COMMON}

YOUR JOB: the Overview and Funnel tabs, exactly as the design's tables say. ${PAGE_RULES}
Files: components/AnalyticsOverviewTab.tsx, AnalyticsFiguresRow.tsx, AnalyticsFunnelTab.tsx and any new small components they need under ${FRONT_MODULE}/components/. Key figures get sparklines from the series bundle. Answer cards name real stages and numbers. The stage ledger table moves behind "Show numbers" on Funnel. Overview still discloses people on an unmapped stage in plain words.`, { label: 'redesign-overview-funnel', phase: 'Pages', model: 'opus', effort: 'high' }),

  () => agent(`${COMMON}

YOUR JOB: the Tracks & sources and Trends tabs, exactly as the design's tables say. ${PAGE_RULES}
Files: components/AnalyticsCategoriesTab.tsx, AnalyticsTrendsTab.tsx and any new small components they need under ${FRONT_MODULE}/components/. On Trends, request the series in as few bundles as possible: the six small charts in one, by-track lines in one, stages in one, so the page does not send a request per chart. Clicking a track, program or source calls onFilterChange. The period selector lives on the Trends tab. Where a metric cannot be drawn, show the plain reason in the card.`, { label: 'redesign-tracks-trends', phase: 'Pages', model: 'opus', effort: 'high' }),

  () => agent(`${COMMON}

YOUR JOB: filters, navigation words and the Reports tab, as the design says. ${PAGE_RULES}
Files: components/AnalyticsFilterBar.tsx, a new removable chips component, AnalyticsSyncLine.tsx, AnalyticsReportsTab.tsx, AnalyticsReportView.tsx and constants under ${FRONT_MODULE}/constants/ if needed. Filters stay in one row with date, track, program and source; Status shows only on Overview and Tracks & sources; chips show active filters with "Clear all". The frozen report view reuses the kit's charts from its stored payload, keeps the provisional marker and the local error boundary, and still shows the comparison table. Replace jargon with the design's plain words across shared text you own, and in utils/ takeaways if they are still used. Another agent owns the other tabs, so do not edit them.`, { label: 'redesign-navigation-reports', phase: 'Pages', model: 'opus', effort: 'high' }),
])
log(`Pages: overview ${overviewFunnel ? 'ok' : 'FAILED'}, tracks ${tracksTrends ? 'ok' : 'FAILED'}, navigation ${navigationReports ? 'ok' : 'FAILED'}`)

phase('Review')
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
    summary: { type: 'string' },
  },
  required: ['defects', 'summary'],
}
const reviewCommon = `You are an independent senior reviewer. You did not write this code, so assume there are mistakes. It is the CRM Analytics tool in FloLabs CRM, a fork of Twenty. Working copy: ${WT} (branch analytics_tool). Read ${WT}/docs/analytics/dashboard-redesign.md and the last sections of ${WORK}/contract.md. Review only what changed: run git status --short and git diff HEAD, and read the new untracked files. Do not edit anything. Do not run git add, commit, stash, checkout, merge or push, nor yarn install, nx, tsgo, lint or docker. Tests may run one at a time. Report real defects with file and line evidence and a concrete fix. No style preferences. An empty list is fine if it is right. Keep it to about 15 minutes. summary is at most 80 words.`
const [serverReview, pageReview] = await parallel([
  () => agent(`${reviewCommon}

Your part: the server changes under packages/twenty-server/src/modules/analytics/ and the demo data under packages/twenty-utils/flolabs/analytics-tests/demo/. Could anything stop the CRM booting, such as a bad provider, a duplicate GraphQL type or a wrong import? Is the new query guarded, read-only and bounded? Could the demo loader ever touch a non-local database, or real data? Is the snapshot backfill the same shape the real snapshot writes?`, { label: 'review-server-data', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW }),
  () => agent(`${reviewCommon}

Your part: the page under packages/twenty-front/src/modules/crm-analytics/ and packages/twenty-front/src/pages/analytics/. Check against the design: is every chart there, on the right tab, and the right form? Does each number mean what its title and tooltip say, against contract section 6? Is 0% ever shown for something unknown? Do lines ever drop to 0 on null? Do charts crash or mislead on empty, small or unknown data? Does click-to-filter work end to end? Would it compile: props, imports, the fields read against the types? Is it easy to read: plain words, no jargon left? Conventions lint would enforce: hard-coded colors, sorted CSS, Styled prefix, Lingui on visible strings, one const per constants file, leaf folders, no ../ imports.`, { label: 'review-page', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW }),
])
const findings = [...(serverReview?.defects ?? []), ...(pageReview?.defects ?? [])]
log(`Review: ${findings.length} findings, ${findings.filter((defect) => defect.severity !== 'minor').length} serious`)

phase('Fix')
const fixes = findings.length === 0 ? null : await agent(`${COMMON}

YOUR JOB: one fix pass on these review findings. Only edit files under ${FRONT_MODULE}/, ${WT}/packages/twenty-front/src/pages/analytics/, ${SERVER_MODULE}/ and ${DEMO}/, and both API type files together if types must change. Confirm each finding in the code first, since a reviewer can be wrong. Fix the real ones, and say why you reject any others. Re-run the tests you affect one at a time.
Findings:
${JSON.stringify(findings, null, 1)}`, { label: 'fix-review', phase: 'Fix', model: 'opus', effort: 'high' })

return { serverWork, demoData, chartKit, overviewFunnel, tracksTrends, navigationReports, serverReview, pageReview, fixes }
