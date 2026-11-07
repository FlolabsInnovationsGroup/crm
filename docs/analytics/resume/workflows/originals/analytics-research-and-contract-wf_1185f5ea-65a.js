export const meta = {
  name: 'analytics-research-and-contract',
  description: 'Research team needs and data presentation, map CRM integration points, critically evaluate scope, and write the build contract',
  whenToUse: 'First phase of the CRM Analytics build',
  phases: [
    { title: 'Research', detail: 'team needs, data presentation, backend and frontend integration points' },
    { title: 'Critical evaluation', detail: 'challenge the scope against what the team needs', model: 'opus' },
    { title: 'Contract', detail: 'write the build contract every later workflow follows', model: 'opus' },
    { title: 'Verify contract', detail: 'check the contract against the real code and the spec' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'

const COMMON = `First read ${WORK}/brief.md in full and ${WORK}/spec.txt in full (the requirements document, including the user's own notes).
This phase is READ-ONLY on code: do not edit anything in ${WT}. Do not run installs, builds, nx, jest, tsgo or docker. Use Grep, Glob and Read with absolute paths inside ${WT}, and keep command output small (the machine has limited memory).
Cite real paths as packages/... with line numbers. If you could not verify something, say "not verified" rather than guessing.
Write plainly: standard punctuation, no em dashes, no marketing language.
Save your report to the file named below using the Write tool. If writing fails, return the whole report as your final text instead. Otherwise your final text must be a summary of at most 100 words.`

const SKILL_REFS = `Design references on this machine, read what is useful:
- C:/Users/Ahsan/AppData/Local/Temp/claude/bundled-skills/2.1.317/58ec5b334c5fb322db83fb637e65e455/dataviz/references/ (choosing-a-form.md, marks-and-anatomy.md, interaction.md, color-formula.md, anti-patterns.md, components.md)
- C:/Users/Ahsan/.claude/skills/ui-craft/references/ (dashboard.md, dataviz.md, recipe-dashboard.md, state-design.md, craft-intent.md)
- C:/Users/Ahsan/.claude/skills/ui-craft-dense-dashboard/SKILL.md
- C:/Users/Ahsan/.claude/skills/apple-design-dickwu/references/hig/ (charts.md, charting-data.md, color.md, layout.md, accessibility.md, design-principles.md)`

phase('Research')
log('Four research agents running in parallel')

const [needs, presentation, backend, frontend] = await parallel([
  () => agent(`You are the requirements analyst for an internal analytics tool. Your job is to pin down what the recruiting team actually needs, so the build stays on target.
${COMMON}
Also read ${WT}/FLOLABS.md.

Write ${WORK}/research/needs.md containing:
1. Who uses this and which decisions they make with it. Be concrete, and label anything that is an assumption.
2. A requirement table covering EVERY requirement in the spec (sections 1, 3, 4, 5, 6, 7, 9, 11): ID, requirement, spec section, Must / Should / Later, a testable acceptance check, data it needs, where it appears. Mark anything the user overruled (separate application, Next.js, webhooks as the source) as superseded and name the replacement.
3. The 5 questions the page must answer in the first 60 seconds, and which one number should lead the page, with your reasoning.
4. Every mismatch between the spec and how the CRM stores data (for example stage on Person versus application ID, no track or program field, one person with several positions, unknown application date) with the best resolution for each.
5. Exactly what cannot be built or verified without something from the user or the recruiting team. Word each as a precise request (for example the exact export or query needed), so it can be sent as is.
6. Anything in the spec that is over-scoped for a small internal team and can wait, with reasons.
Maximum 1200 words.`, { label: 'needs-analyst', phase: 'Research', model: 'opus', effort: 'high' }),

  () => agent(`You are the data-presentation researcher. Work out the best way to present this recruiting pipeline data so the team can act on it, and evaluate the chart suggestions in the brief critically. Do not assume they are right.
${COMMON}
${SKILL_REFS}

Web research: load WebSearch with ToolSearch ("select:WebSearch") and look at how mature recruiting analytics tools present this kind of data (for example Ashby, Greenhouse, Lever, Gem, Workable), plus credible guidance on funnels, cohort views and time-in-stage or aging views. Prefer primary product docs and data-visualization authorities over vendor listicles. If you cannot open full pages, work from the search summaries and say so. List the sources you used as links at the end.

Write ${WORK}/research/presentation.md containing:
1. What the research shows, in short, including where it contradicts the brief's suggestions.
2. Page structure: is a set of tabs the right shape? What leads the page? What is cut because it does not change a decision?
3. A view table, one row per view: question it answers, chart form, exact fields needed from the API (name, type, unit), default filters, the takeaway sentence pattern, drill-down, table view, and how it behaves when data is empty, too recent, or unmapped.
   It must cover the four required sections in spec section 6 and the required controls, and the "last successful synchronization" line.
4. For each view, whether an existing CRM chart component is likely to fit (see the graph folder named in the brief) or whether a simple custom component is better. A frontend scout is checking the details, so stay at the level of fit.
5. The one signature visual element that would make this feel designed rather than generated, appropriate to a dense internal tool inside the CRM.
6. What the weekly and monthly reports should look like, reusing the same views where possible.
Maximum 1500 words plus sources.`, { label: 'presentation-researcher', phase: 'Research', model: 'opus', effort: 'high' }),

  () => agent(`You are the backend scout. Map exactly how a new fork-level module plugs into twenty-server without changing existing logic. Quote the real signatures that a builder would need.
${COMMON}

Answer each of these with file paths, line numbers and short real excerpts. Write ${WORK}/research/backend.md.
1. RECURRING JOBS: the minimum set of files to add one recurring job in the worker. Show a small real example of a *.cron.command.ts and *.cron.job.ts, the module wiring, and exactly how cron-register-all.command.ts registers it. How do cron jobs iterate over workspaces? Is there any way to schedule a job from a new module without editing an existing file (for example registering on application bootstrap)? Is that acceptable in this codebase or does it break a rule? How does entrypoint.sh use registration, and what happens to a cron when its code is removed?
2. READING CRM DATA: how modules/public-form reads person records. Show the WorkspaceOrmManager and buildSystemAuthContext usage. Can a service run raw read-only SQL against a workspace schema, and what is the existing pattern (getWorkspaceSchemaName, data source service, repository.query or similar)? How would it page through 43,000 people efficiently? How do you check whether a custom field exists on Person in a given workspace (flat metadata maps via WorkspaceCacheService)? How do you list active workspaces?
3. TIMELINE ROWS: exact table and column names for timelineActivity in a workspace schema, including timelineActivityTypeId, timelineActivityTypeSnapshot, properties, happensAt, targetPersonId or recordId columns, createdAt, updatedAt. What exactly is stored for a person update on a custom SELECT field (show the shape of properties.diff), and how do you select only person self-updates? Does a merge in timeline-activity.repository.ts change updatedAt and happensAt? Does person creation store the initial value of a field? Are SELECT and MULTI_SELECT audit-loggable (read is-audit-loggable-field-type.util.ts)? Are API or import writes also written to the timeline? Is timeline writing conditional on anything? Is there any cleanup of timeline rows? Which indexes exist on the table?
4. OWN STORAGE: options to create and evolve a separate "analytics" Postgres schema without touching the CRM's migrations. Look at how the core data source is injected, how typeorm core migrations run, what entrypoint.sh and database:migrate do, what UPGRADE_COMMANDS.md allows, whether database:reset would drop a foreign schema, and how a version upgrade could be affected. Compare at least: idempotent DDL run by the module on first use; an upgrade command; custom objects created through metadata. Give the risks of each and your recommendation. Also: does anything scan all schemas and choke on an unknown one? How can a query set a statement_timeout safely with the pooled connection?
5. API FOR THE PAGE: compare a GraphQL @CoreResolver against a REST controller for a new module. Show the guards used by notifications-seen, by the public-form stats resolver and by a REST controller. What does each option require editing outside the new folder (ApiPath, generated types, schema generation, lint rules about guards)? How would you restrict access to selected roles with existing machinery and no new permission flag, and what exactly does SettingsPermissionGuard or CustomPermissionGuard require? Is there an oxlint or test rule that forces every resolver to declare a permission guard?
6. MODULE REGISTRATION: exactly how PublicFormModule and NotificationsSeenModule are registered, and whether a job processor in a new module is picked up by the worker through modules.module.ts with no other edit.
7. TESTS: the closest existing unit test pattern to copy for a service with a mocked ORM or data source, and how to run a single spec.
8. EXISTING HELP: anything already in the code that could reduce what we build (dashboard chart data services, group-by query runners, key-value store, usage of cache). Say plainly if none helps.
Maximum 1800 words. Excerpts should be short.`, { label: 'backend-scout', phase: 'Research', model: 'sonnet', effort: 'high' }),

  () => agent(`You are the frontend scout. Map exactly how a new page plugs into twenty-front without changing existing logic, and how far the existing chart components can be reused. Quote the real signatures that a builder would need.
${COMMON}

Answer each of these with file paths, line numbers and short real excerpts. Write ${WORK}/research/frontend.md.
1. ROUTE AND NAV: exactly how Team inbox and Notifications are wired: AppPath.ts, createWorkspaceRouteObjects.tsx (lazy import, handle.workspaceSurfaces), the page component, and the sidebar item in MainNavigationDrawerScrollableItems.tsx. Show the smallest edit for each. Where does a page file live?
2. PAGE SHELL: which components make a standard page (PageContainer, PageHeader, PageBody or current equivalents), as used by the Team inbox page. Tabs (TabList or current equivalent) and how tab state is held. Is there a pattern for URL-held filters?
3. CALLING THE BACKEND: the exact pattern for a core-client GraphQL query with hand-written gql (team-inbox hooks: useApolloCoreClient or the client option), error handling, and polling. If the backend were REST instead, how do other modules fetch with the user's token (getTokenPair or similar, REACT_APP_SERVER_BASE_URL)? Would either option need generated types or a codegen run?
4. CHART REUSE, the most important part. For each of GraphWidgetBarChart or BarChart, GraphWidgetLineChart, GraphWidgetPieChart and the aggregate chart: exact props; which contexts, instance providers, Jotai state and hooks it requires (does it need to be inside a widget, a page layout, or a router context?); whether it can be given plain data with no metadata or record queries; horizontal layout; stacked; custom colors; tooltip; legend; click handling; responsive sizing; dark mode. Give a minimal working usage example for each one that can be used outside a widget, and say plainly which cannot. Should the new page import these, or are simple custom components cleaner? Are importing them safe, given they may change on upstream upgrades?
5. BUILDING CUSTOM VIEWS: for horizontal funnel rows, a cohort grid, and a time-in-stage range view, what should they be built from? Show the theme tokens (themeCssVariables, color scales), Linaria usage, how dark mode is handled, and how an existing custom widget does it.
6. UI KIT INVENTORY: what exists in twenty-ui and twenty-front for: date-range picker, single and multi select dropdowns, filter chips, tables, skeleton loaders, empty states, tooltips, section titles, number and date formatting helpers, tags, buttons, info banners. Name the import paths.
7. PATTERNS: a closely related existing screen to borrow from (for example form-builder Responses tab with stats, or dashboards). What does it look like structurally?
8. RULES: lint rules that will bite (oxlint custom rules, lingui no-unlocalized-strings, no hard-coded colors, etc), how user-facing strings work with Lingui and what must NOT be committed, how to run a single front test, and the closest test or story to copy.
Maximum 1800 words. Excerpts should be short.`, { label: 'frontend-scout', phase: 'Research', model: 'sonnet', effort: 'high' }),
])
log('Research done: ' + [needs, presentation, backend, frontend].map(r => (r ? 'ok' : 'FAILED')).join(', '))

phase('Critical evaluation')
const critique = await agent(`You are the toughest reviewer on this project. The user explicitly asked for someone to critically evaluate whether we are doing what we need to do: build what is intended, do not over-engineer, make a tool the team needs.
${COMMON}

Read the four research reports in ${WORK}/research/ (needs.md, presentation.md, backend.md, frontend.md). Do not take them on trust: check the claims that matter directly in the code at ${WT}.
Do NOT reopen the user's decisions listed in the brief (no new server, inside the CRM, existing logic untouched, facade as a module). Everything else, including my proposed design and chart ideas, is open to challenge.

Write ${WORK}/research/critique.md answering:
A. Are we building what the spec and team intend? Name any requirement being missed and anything being built that nobody asked for.
B. Over-engineering audit. For EACH component give a verdict KEEP, CUT, SIMPLIFY or LATER, with the evidence and the concrete simpler alternative. Cover at least:
   - Now that the tool lives in the same database, do we need a copied current-state table, or a sync job at all? Could metrics read CRM tables and the timeline directly, and what would that cost (speed, CRM load, coupling, loss of history)? The user's note worried about duplicate storage.
   - Stage transitions table: copy or derive? Is a per-minute sync needed, or would less frequent do, given the spec says "update when data changes" and shows last sync time?
   - Daily snapshots: needed from day one, given what can or cannot be reconstructed from transitions?
   - Mapping: database tables, or a constant in code? Who edits it, and how often?
   - Reports: what is the smallest honest version? Is delivery through n8n needed for v1?
   - Tabs and number of charts. Which views earn their place?
   - Off switch, query time limits, role guard, sync log, retention jobs, monitoring.
C. Risks to the CRM itself: performance on the production server (4 vCPU, 8 GB), upgrade conflicts, anything that could break existing behaviour. Give the mitigation for each, and say which risks are real and which are theoretical.
D. Risks to the team's trust in the numbers: merged timeline rows, data imported from HubSpot with no history, skipped stages, people with several positions, deleted or restored people, stage values that change, timezones. For each, what must the tool do?
E. The smallest version that fully meets the Must requirements: a clear v1 scope list, and a later list.
F. What must be asked of the user or recruiting before or during the build. Keep it short and specific.
Be specific and direct. Prefer cutting to adding. Maximum 1500 words.`, { label: 'critic', phase: 'Critical evaluation', model: 'opus', effort: 'xhigh' })

phase('Contract')
const contract = await agent(`You are the architect. Write the build contract: the single source of truth that independent backend, UI and integration workflows will follow, so that their parts fit together on the first try.
${COMMON}

Read everything in ${WORK}/research/. Follow the critic's verdicts in critique.md unless you can justify otherwise in one line. Verify every code reference in ${WT} yourself. The contract must describe the simplest design that fully meets the Must requirements, respect the user's decisions in the brief, and be concrete enough to implement without further design work.

Write ${WORK}/contract.md with these sections:
1. Scope: v1 list, later list, and every open question with the default being used. Mark clearly which defaults need the user or recruiting to confirm later.
2. File ownership, three disjoint lists: BACKEND files (new, inside packages/twenty-server/src/modules/analytics/), UI files (new, inside packages/twenty-front/src/modules/analytics/ and the page file), INTEGRATION edits (each existing file to edit, with the exact lines to add and exactly where). Keep the integration list as short as possible.
3. Storage: exact DDL if the design has its own tables, how and when it is created, and how it evolves. Include what happens on a fresh database, on a repeated run, and on database:reset.
4. Facade: exact TypeScript types and method signatures. It offers read methods only, and it is the only code that touches CRM tables. Name the exact existing APIs it uses, with file references. It must handle a workspace where the expected Person fields do not exist (local demo data, for example) by reporting that state rather than throwing.
5. Jobs: name, schedule, queue, batch size, cursor handling, idempotency, failure behaviour, and the off switch.
6. Metrics: precise definitions for every metric in spec section 5 and everything shown in the views: denominator, numerator, cohort rule, how mapping applies, how skipped stages and merged timeline rows are treated, how people with several positions count, and when something is "too recent to call" rather than dropped. Give SQL where it removes ambiguity.
7. API: the exact endpoints or queries, arguments, and full TypeScript response types, with the auth guards. Types must be usable by both sides without touching existing shared packages if at all possible; say exactly how.
8. UI: page layout, component tree with file names, which existing CRM components are reused and how, which are custom, view-by-view data mapping to the API types, every state (loading, empty, error, unmapped, too recent, no stage field), filters, table views, takeaway sentences, dark mode, keyboard, the signature element. Follow presentation.md.
9. Test plan: the unit tests to write on each side, by name and purpose, using real patterns from the scouts' reports. Also a local end-to-end plan: how to run on this Windows machine with Docker, how to add stage, positionsAppliedFor and applicantSource fields plus sample data to the local demo workspace WITHOUT adding files to the repo, and what to check. This is how we verify on a real timeline that stage changes appear as expected, since we have no production access.
10. Order of work and what can run in parallel, given limited memory (15 GB). Say which commands are heavy.
11. A short list of exact requests for the user or recruiting.
Be as short as precision allows: aim for about 3000 words. Use tables and code blocks, not prose, where possible.`, { label: 'architect', phase: 'Contract', model: 'opus', effort: 'xhigh' })

phase('Verify contract')
const DEFECTS = {
  type: 'object',
  properties: {
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['section', 'severity', 'problem', 'evidence', 'fix'],
      },
    },
    uncoveredMustRequirements: { type: 'array', items: { type: 'string' } },
    overEngineered: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
  required: ['defects', 'uncoveredMustRequirements', 'overEngineered', 'verdict'],
}

const check = await agent(`You verify the build contract adversarially. Assume it contains mistakes, and find them before anyone builds on it.
First read ${WORK}/brief.md, ${WORK}/spec.txt, ${WORK}/research/needs.md, ${WORK}/research/critique.md and ${WORK}/contract.md.
This is READ-ONLY. Do not run installs, builds, nx, jest, tsgo or docker. Check against the real code at ${WT} using Grep, Glob and Read with absolute paths.

Check:
1. Every file path, class, decorator, guard, helper, type, column name and config the contract says exists. Open it and confirm the name and signature are right. Report anything wrong or invented.
2. The integration edits: would each one compile where it is placed? Is any edit larger than it needs to be? Is there anything missing, for example a module import, a provider, or a registration that the worker needs?
3. Internal consistency: do the API response types supply every field the UI section uses? Is the file ownership truly disjoint? Do the jobs write everything the metrics read?
4. Metric definitions: are they correct and unambiguous? Try a small worked example with skipped stages, a merged timeline row, a person with two positions, and a person who is too recent.
5. Must requirements in needs.md that the contract does not cover.
6. Anything the contract adds that no requirement asks for.
Report real defects only, with evidence. An empty list is fine if it is right.`, { label: 'contract-verifier', phase: 'Verify contract', model: 'sonnet', effort: 'high', schema: DEFECTS })

let fixes = null
const serious = check ? check.defects.filter(d => d.severity !== 'minor') : []
if (check && (serious.length > 0 || check.uncoveredMustRequirements.length > 0)) {
  log('Verifier found ' + serious.length + ' serious defects and ' + check.uncoveredMustRequirements.length + ' uncovered requirements. Fixing the contract.')
  fixes = await agent(`You are the architect. A verifier checked your build contract at ${WORK}/contract.md against the code. Fix the contract in place with the Edit tool. Confirm each defect in the code at ${WT} first (read-only), since the verifier can be wrong too. If a defect is not real, leave that part as it is and record why in a section at the end of the contract named "Verifier notes". Do not add scope beyond what the Must requirements need.

Defects and gaps:
${JSON.stringify({ defects: check.defects, uncovered: check.uncoveredMustRequirements, overEngineered: check.overEngineered }, null, 1)}

Your final text must be a summary of at most 120 words listing what changed.`, { label: 'architect-fixes', phase: 'Verify contract', model: 'opus', effort: 'high' })
} else {
  log('Verifier found no serious defects')
}

return {
  reports: `${WORK}/research/`,
  contract: `${WORK}/contract.md`,
  summaries: { needs, presentation, backend, frontend, critique, contract },
  verifier: check,
  fixes,
}