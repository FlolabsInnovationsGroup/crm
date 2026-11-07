export const meta = {
  name: 'analytics-ui-continue',
  description: 'Continue the CRM Analytics page: design review and fix rounds 2 and 3, then a pass over the minor findings',
  whenToUse: 'Resume point for the UI workflow. Foundation, build, review 1 and fix 1 are already done',
  phases: [
    { title: 'Review and fix', detail: 'design and correctness review, then fixes', model: 'opus' },
    { title: 'Minor findings', detail: 'fix the minor findings kept from the reviews', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const FRONT = `${WT}/packages/twenty-front`
const MOD = `${FRONT}/src/modules/crm-analytics`

const DESIGN_REFS = `Design guidance to read before writing UI. If a path below no longer exists, skip it, since the temp folder can change between sessions:
- C:/Users/Ahsan/.claude/skills/ui-craft/references/dashboard.md and recipe-dashboard.md
- C:/Users/Ahsan/AppData/Local/Temp/claude/bundled-skills/2.1.317/58ec5b334c5fb322db83fb637e65e455/dataviz/references/marks-and-anatomy.md and anti-patterns.md
- C:/Users/Ahsan/.claude/skills/apple-design-dickwu/references/hig/charts.md
The page must look like it belongs in this CRM, not like a generated template: one clear focal point, dense and calm, one accent color used sparingly, sentence case, right-aligned tabular numbers in tables, hairline borders, no card grid of equal tiles, no pies, no 3D, no rainbow, no dual axes, no entrance animation. The stage ledger is the signature element: make it excellent.
Closest existing screens to match in look and structure: ${FRONT}/src/modules/form-builder/components/FormBuilderResponsesTab.tsx and ${FRONT}/src/modules/team-inbox/components/TeamInboxContent.tsx. Do not copy line 161 of the first one (missing core client).`

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
Report real defects only, with file and line evidence and a concrete fix. An empty list is fine if it is right.
Already settled, do not report again: the zeros before tracking start are being fixed in readTrendValues on the server; the minor findings of review 1 in ${WORK}/test-results/ui-review-1.md get their own fix pass after these rounds.`

const fixPrompt = (defects) => `You are fixing review findings on the CRM Analytics page. Live CRM, and the user cares about a good UI.
Working copy: ${WT} (branch analytics_tool). Only edit files under ${MOD}/ and ${FRONT}/src/pages/analytics/. Do not edit existing CRM files. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint, lingui or docker. Read ${WORK}/contract.md for intent. You may run tests one at a time: cd ${WT} && npx jest <file> --config=packages/twenty-front/jest.config.mjs.
Confirm each finding in the code first, since a reviewer can be wrong. Fix the real ones and re-run the affected tests. For any finding you reject, say why.
Findings:
${JSON.stringify(defects, null, 1)}
Your final text must be at most 150 words: what you fixed, what you rejected and why, and test results.`

phase('Review and fix')
const reviews = []
const fixes = []
for (let round = 2; round <= 3; round++) {
  const review = await agent(reviewPrompt(round), { label: `ui-review-${round}`, phase: 'Review and fix', model: 'opus', effort: 'max', schema: REVIEW })
  reviews.push(review)
  const serious = review ? review.defects.filter((defect) => defect.severity !== 'minor') : []
  log(`UI review ${round}: ${review ? review.defects.length : 'no'} findings, ${serious.length} serious`)
  if (!review || serious.length === 0 || round === 3) {
    break
  }
  fixes.push(await agent(fixPrompt(serious), { label: `ui-fix-${round}`, phase: 'Review and fix', model: 'opus', effort: 'xhigh' }))
}

phase('Minor findings')
const latestMinors = reviews.filter(Boolean).flatMap((review) => review.defects.filter((defect) => defect.severity === 'minor'))
const minors = await agent(fixPrompt([
  {
    file: 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work/test-results/ui-review-1.md',
    severity: 'minor',
    problem: 'Every [minor] item listed in this file. Skip any that a later fix already resolved.',
    evidence: 'Read the file.',
    fix: 'As each item says.',
  },
  {
    file: 'packages/twenty-front/src/modules/crm-analytics/components/AnalyticsTrendTable.tsx',
    severity: 'minor',
    problem: 'The trend table can print -0 points.',
    evidence: 'Noticed in the first review pass.',
    fix: 'Show a zero change without a sign.',
  },
  {
    file: 'packages/twenty-front/src/modules/crm-analytics/',
    severity: 'minor',
    problem: 'Server-built English strings reach the screen without Lingui. Found by backend review 1.',
    evidence: 'Row labels with rowKind NO_STAGE, key NONE by groupBy, key UNMAPPED, and metricKey NEW_APPLICATIONS or ENTERED_<stageKey> come from the server as text.',
    fix: 'Keep the section 7 types and leave the server strings as stored fallbacks, since frozen reports cannot be re-translated. On the front, map these rows to t strings by stable key. Do not run lingui extract or compile.',
  },
  ...latestMinors,
]), { label: 'ui-fix-minors', phase: 'Minor findings', model: 'opus', effort: 'xhigh' })

return { reviews, fixes, minors }
