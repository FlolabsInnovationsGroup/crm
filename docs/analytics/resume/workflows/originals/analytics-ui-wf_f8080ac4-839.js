export const meta = {
  name: 'analytics-ui',
  description: 'Build the CRM Analytics page: shell, filters and Overview, then Funnel, Categories, Trends and Reports, then design review and fixes',
  whenToUse: 'UI phase of the CRM Analytics build',
  phases: [
    { title: 'Foundation', detail: 'types, data hooks, shared components, page, filters and Overview', model: 'opus' },
    { title: 'Build', detail: 'Funnel and Categories, Trends and Reports', model: 'opus' },
    { title: 'Review and fix', detail: 'design and correctness review, then fixes', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const FRONT = `${WT}/packages/twenty-front`
const MOD = `${FRONT}/src/modules/crm-analytics`

const DESIGN_REFS = `Design guidance to read before writing UI:
- C:/Users/Ahsan/.claude/skills/ui-craft/references/dashboard.md and recipe-dashboard.md
- C:/Users/Ahsan/AppData/Local/Temp/claude/bundled-skills/2.1.317/58ec5b334c5fb322db83fb637e65e455/dataviz/references/marks-and-anatomy.md and anti-patterns.md
- C:/Users/Ahsan/.claude/skills/apple-design-dickwu/references/hig/charts.md
The page must look like it belongs in this CRM, not like a generated template: one clear focal point, dense and calm, one accent color used sparingly, sentence case, right-aligned tabular numbers in tables, hairline borders, no card grid of equal tiles, no pies, no 3D, no rainbow, no dual axes, no entrance animation. The stage ledger is the signature element: make it excellent.
Closest existing screens to match in look and structure: ${FRONT}/src/modules/form-builder/components/FormBuilderResponsesTab.tsx and ${FRONT}/src/modules/team-inbox/components/TeamInboxContent.tsx. Do not copy line 161 of the first one (missing core client).`

const COMMON = `You are building part of the CRM Analytics page inside FloLabs CRM, a fork of Twenty. This is the company's live CRM, and the user cares a lot about a good UI and good visual graphs.

Working copy: ${WT} (branch analytics_tool). Use absolute paths, and cd there in Bash. Never touch D:/Coding/Flolabs/crm/packages, which is a different checkout.

Read first, in full: ${WORK}/contract.md (the build contract, the single source of truth; sections 2, 7 and 8 are yours), then ${WORK}/brief.md. Background: ${WORK}/research/frontend.md and ${WORK}/research/presentation.md. Near the end of your work, re-read the end of contract.md for a "Verifier notes" section or other changes.

${DESIGN_REFS}

Rules:
- Create only the files you own, listed below. Never edit an existing CRM file. A later integration workflow adds the route and the sidebar item.
- Do not run git add, commit, stash or checkout. Do not run yarn install, nx, tsgo, lint, lingui, docker or any build. The only command you may run is a single test at a time: cd ${WT} && npx jest <file> --config=packages/twenty-front/jest.config.mjs. Run your tests once your files are written. If jest cannot resolve twenty-shared or twenty-ui because those packages are not built yet, say so in your report rather than working around it.
- Before using an existing component, open its file and confirm its import path and props. If the contract is wrong about the code, follow the code, keep the intent, and report the deviation.
- Conventions: Linaria with names starting Styled, CSS properties sorted alphabetically, themeCssVariables from twenty-ui/theme only and no hard-coded colors, one const per constants file, kebab-case module folders with files only in leaf folders, no ../ imports, inline type imports, <Name>Props, named exports, no any, no abbreviations, functional components, prefer event handlers over useEffect. Icons from twenty-ui/icon. Every user-facing string through Lingui (t or useLingui), and do not run lingui extract or compile. Plain words, standard punctuation, no em dashes, no emojis in any string.
- Always call the backend through useQuery from @apollo/client/react with client: useApolloCoreClient(). Never import from ~/generated/graphql for these queries. Enums from ~/generated-metadata/graphql only where the contract says so.
- Never render 0% for something unknown. AnalyticsRateCell is the only way a rate is displayed.
- Keyboard: real buttons and tables, visible focus, aria-hidden on decorative bars with the number as text beside them.
- Build what the contract says, nothing more.

Your final text must be at most 200 words: files written, tests run with pass or fail, deviations from the contract, and anything not verified.`

phase('Foundation')
const foundation = await agent(`${COMMON}

YOUR JOB: the UI foundation and the Overview tab. Two more agents start as soon as you finish and will read your code, so keep shared component props clear and stable.

Files you own (contract sections 2 and 8):
- ${FRONT}/src/pages/analytics/AnalyticsPage.tsx
- ${MOD}/constants/: CrmAnalyticsPath.ts, CrmAnalyticsTabListInstanceId.ts, CrmAnalyticsDefaultFilter.ts, CrmAnalyticsChartInstanceId.ts
- ${MOD}/graphql/: all seven query files
- ${MOD}/hooks/: useCrmAnalyticsMeta.ts, useCrmAnalyticsQuery.ts
- ${MOD}/types/AnalyticsApi.ts: section 7 block byte for byte, no imports. The backend workflow writes the same block and a spec compares them
- ${MOD}/utils/: all seven utils in section 2
- ${MOD}/components/: NavigationDrawerAnalyticsItem, AnalyticsSyncLine, AnalyticsContent, AnalyticsStatePanel, AnalyticsFilterBar, AnalyticsSection, AnalyticsTable, AnalyticsBarCell, AnalyticsRateCell, AnalyticsSkeleton, AnalyticsOverviewTab, AnalyticsFiguresRow, AnalyticsStageTotalsTable, AnalyticsStuckTable
AnalyticsContent imports AnalyticsFunnelTab, AnalyticsCategoriesTab, AnalyticsTrendsTab and AnalyticsReportsTab from the same components folder. The next agents create those, so do not write stubs for them.

Tests you own, from section 9: formatAnalyticsRate, the four buildXTakeaway tests, buildTrendChartSeries, isCrmAnalyticsForbiddenError, AnalyticsRateCell, AnalyticsFilterBar, AnalyticsStuckTable, AnalyticsContent, NavigationDrawerAnalyticsItem. AnalyticsContent.test.tsx cannot run until the other tabs exist, so write it and leave running it to the reviewer.
Handle every state in the section 8 states table.`, { label: 'ui-foundation', phase: 'Foundation', model: 'opus', effort: 'xhigh' })
log('UI foundation done: ' + (foundation ? 'ok' : 'FAILED'))

phase('Build')
const [funnelCategories, trendsReports] = await parallel([
  () => agent(`${COMMON}

YOUR JOB: the Funnel and Categories tabs. Shared components and types already exist under ${MOD}/, so read them and use them.

Files you own, under ${MOD}/components/:
- AnalyticsFunnelTab.tsx and AnalyticsStageLedger.tsx: the signature element. One real table, stages as rows, columns as in section 8. The "to next" rate sits on the hairline between this row and the next. Exactly one row carries the accent with the neutral label "Lowest step", and no alarm color. Include the overall line and the note giving cohort size, excluded unmapped and the re-applicant rule, plus the launch state when cohortSize is 0.
- AnalyticsCategoriesTab.tsx and AnalyticsCategoryTable.tsx: switch between Track and program and Source using SegmentedControl, sticky first column, people bar, tracks expand to programs with a real button and aria-expanded, one column per stepStageKeys, horizontal scroll inside the table box, and the note that rows do not add up.
Test you own: AnalyticsStageLedger.test.tsx from section 9. Add one for the category table only if it protects real behaviour.`, { label: 'ui-funnel-categories', phase: 'Build', model: 'opus', effort: 'max' }),

  () => agent(`${COMMON}

YOUR JOB: the Trends and Reports tabs. Shared components and types already exist under ${MOD}/, so read them and use them.

Files you own, under ${MOD}/components/:
- AnalyticsTrendsTab.tsx: metric and stage selects, the chart, the tables
- AnalyticsTrendChart.tsx: the only file in the module importing from page-layout/widgets/graph. It provides the three contexts as packages/twenty-front/src/modules/page-layout/widgets/graph/__tests__/GraphWidgetTestWrapper.tsx does. Previous period in gray first, then the current one. Null values leave a gap and never drop to 0.
- AnalyticsTrendTable.tsx, AnalyticsCohortTable.tsx, AnalyticsMovementTable.tsx: plain tables directly under the chart with no toggle. The cohort table has numbers with n, no shading, and not-mature cells use AnalyticsRateCell's muted form.
- AnalyticsReportsTab.tsx and AnalyticsReportView.tsx: list by period type, newest first. The viewer shows generated time, tracking caveat, comparisons table with significant rows marked, then reuses the ledger, category, movement and cohort tables. Another agent is writing AnalyticsStageLedger and AnalyticsCategoryTable now in the same folder; import them by the names and props in the contract, and if their props differ when you finish, adapt your usage.
Also handle unavailableReason by showing the plain reason in place of the chart. Add a test for the trend chart wrapper only if it can run without canvas issues.`, { label: 'ui-trends-reports', phase: 'Build', model: 'opus', effort: 'max' }),
])
log('UI build done: funnel ' + (funnelCategories ? 'ok' : 'FAILED') + ', trends ' + (trendsReports ? 'ok' : 'FAILED'))

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
    testsRun: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['defects', 'testsRun', 'summary'],
}

const reviewPrompt = (round) => `You are an independent senior design engineer reviewing the CRM Analytics page, review round ${round}. You did not write this code. Assume there are mistakes and find them.

Working copy: ${WT} (branch analytics_tool). Code under review: ${MOD}/ and ${FRONT}/src/pages/analytics/. Read ${WORK}/contract.md (sections 2, 7, 8, 9) and ${WORK}/brief.md first, then ${WORK}/research/presentation.md.
${DESIGN_REFS}
Do not edit any file. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint or docker. You may run tests one at a time: cd ${WT} && npx jest <file> --config=packages/twenty-front/jest.config.mjs. Run every test in the module. If jest cannot resolve twenty-shared or twenty-ui because they are not built, record that and read the code instead; it is not a defect in this code.

Check:
1. Every view, state and rule in contract section 8. Is anything missing or different? Does every field used exist in the types? Does it call the right query with the core client?
2. Honest numbers: is 0% ever shown for something unknown? Do filters, notes, units and date basis read correctly? Do takeaways use only qualifying rows?
3. Design quality: visual hierarchy with one clear focal point, alignment, spacing rhythm from the theme, numbers right-aligned and tabular, ledger quality, dark mode via tokens, long labels and many columns not breaking the layout, narrow widths. Would a designer retouch this? Does it look like the CRM?
4. Accessibility: keyboard for every action, focus visibility, table semantics, aria use, color never the only signal, and a table form for chart data.
5. Conventions that lint will enforce: no hard-coded colors, sorted CSS, Styled prefix, Lingui on all user-facing text, one const per constants file, leaf folders, no ../ imports, no em dashes in strings.
6. Over-engineering or scope beyond the contract. Any import that reaches into chart internals outside AnalyticsTrendChart.
Report real defects only, with file and line evidence and a concrete fix. An empty list is fine if it is right.`

const fixPrompt = (defects) => `You are fixing review findings on the CRM Analytics page. Live CRM, and the user cares about a good UI.
Working copy: ${WT} (branch analytics_tool). Only edit files under ${MOD}/ and ${FRONT}/src/pages/analytics/. Do not edit existing CRM files. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint, lingui or docker. Read ${WORK}/contract.md for intent. You may run tests one at a time: cd ${WT} && npx jest <file> --config=packages/twenty-front/jest.config.mjs.
Confirm each finding in the code first, since a reviewer can be wrong. Fix the real ones and re-run the affected tests. For any finding you reject, say why.
Findings:
${JSON.stringify(defects, null, 1)}
Your final text must be at most 150 words: what you fixed, what you rejected and why, and test results.`

const reviews = []
const fixes = []
for (let round = 1; round <= 3; round++) {
  const review = await agent(reviewPrompt(round), { label: `ui-review-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max', schema: REVIEW })
  reviews.push(review)
  const serious = review ? review.defects.filter((defect) => defect.severity !== 'minor') : []
  log(`UI review ${round}: ${review ? review.defects.length : 'no'} findings, ${serious.length} serious`)
  if (!review || serious.length === 0 || round === 3) {
    break
  }
  fixes.push(await agent(fixPrompt(serious), { label: `ui-fix-${round}`, phase: 'Review and fix', model: 'opus', effort: 'xhigh' }))
}

return { foundation, funnelCategories, trendsReports, reviews, fixes }