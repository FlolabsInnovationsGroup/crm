# CLAUDE.md

Twenty is an open-source CRM — an Nx / Yarn 4 monorepo. Main packages: `twenty-front` (React 18, Jotai, Linaria, Vite), `twenty-server` (NestJS, TypeORM, PostgreSQL, Redis, GraphQL), `twenty-shared` (isomorphic types/utils), `twenty-ui`, `twenty-sdk` (application SDK + CLI), `twenty-e2e-testing` (Playwright).

Match the surrounding code — the adjacent files in the directory you are editing beat any written rule, including for file naming, which varies by area.

## Rule #1: do not touch existing CRM logic

The analytics tool is added to the existing CRM as new modules in the existing server and front end, with no separate server. Do not change existing CRM logic or break anything. New code goes in new files. Every change to core CRM code needs one agent to write it and a second agent to review it. Do not fix, refactor or "improve" anything the user did not ask for. Full project state: see **CRM Analytics tool: project state** at the end of this file.

## House rules

Where this repo differs from your defaults:

- Short-form `//` comments, never JSDoc blocks; comment only WHY (a constraint the code cannot express, still true for a reader who never saw your change), never WHAT.
- Types over interfaces (except when extending third-party interfaces); string literals over enums (except GraphQL enums); no `any`; descriptive generics (`TData`, not `T`).
- Named exports only. Functional components only.
- Prefer event handlers over `useEffect` for state updates.
- No abbreviations in names (`fieldMetadata`, not `fm`); constants in SCREAMING_SNAKE_CASE; component props types suffixed `Props`.
- Use existing guards and helpers before writing your own: `isDefined`, `isNonEmptyArray`, `isPlainObject`, … from `twenty-shared/utils`; `isNonEmptyString`, `isString`, `isNull`, `isObject`, … from `@sniptt/guards`. Reimplementing an existing util is the most common AI-authored defect here.
- Lingui for user-facing strings; Linaria (zero-runtime, styled-components pattern) for twenty-front styling.
- For Twenty product concepts, consult `packages/twenty-ui/src/icon/icon-dictionary.md` and use the canonical icon.
- Import icons from `twenty-ui/icon`, never directly from `@tabler/icons-react`; action and status concepts should use their action or status icons.
- Test behavior, not implementation: query by user-visible text/roles, `@testing-library/user-event` for interactions.

## Comment sparingly

Most code is self-explanatory and a comment on it is just noise — cognitive overhead to read and maintenance debt to keep accurate. Only comment code that is genuinely unintuitive or complex: a non-obvious why , a workaround, a subtle invariant, a deliberate deviation from the obvious approach. Do not narrate what the code does — the code already says that. When a comment truly earns its place, keep it as terse as possible. This overrides matching the surrounding file's comment density. Write lean even in a verbose file.

Two or three lines, and a hard ceiling of five. "Terse" is not relative: much of this repo predates the rule and carries paragraph-length comments, so a file you are editing is not evidence of the standard — it is usually the thing the rule exists to stop spreading. If the why will not fit in five lines, the explanation belongs in a module docstring, a README or an ADR, and the comment is one line pointing there.

The same ceiling applies to a comment's neighbours: do not restate one fact in the Dockerfile, the manifest and the code that reads it. Put it once, where a reader hits it first, and let the others be silent.

Docstrings carry the what and the design; they are not exempt from terseness, but they are the right home for anything a comment is too small to hold.

## Commands

```bash
bash packages/twenty-utils/setup-dev-env.sh   # Postgres/Redis + DB init; only for tasks needing a running app
yarn start                                    # front + server + worker

npx jest path/to/file.spec.ts --config=packages/<pkg>/jest.config.mjs   # single test file (preferred)
npx vitest run --root packages/twenty-ui --project unit <file>          # twenty-ui runs on vitest, not jest
npx nx test twenty-server                     # package unit tests (same for twenty-front, ...)
npx nx run twenty-server:test:integration:with-db-reset
npx nx storybook:build twenty-front && npx nx storybook:test twenty-front

npx nx lint:diff-with-main twenty-server      # diff-based lint (fast; add --configuration=fix); run with typecheck after changes
npx nx fmt <pkg>                              # format
npx nx build twenty-shared                    # required before building/testing packages that depend on it
npx nx database:reset twenty-server
npx nx run twenty-front:graphql:generate      # after GraphQL schema changes (--configuration=metadata for metadata schema)
```

## Gotchas

- **`twenty-shared/dist` is per-branch state nothing tracks.** After switching branches or editing `twenty-shared`, run `npx nx build twenty-shared --skip-nx-cache` before trusting any typecheck or test failure in a dependent package.
- **Nx caching can serve a stale pass.** To verify a fix, run `npx tsgo -p tsconfig.json --noEmit` in the package directly rather than `nx typecheck`.
- **Do not commit translation catalogs unless translations are the task.** `lingui extract`/`compile` regenerate `packages/twenty-server/src/engine/core-modules/i18n/locales/*.po` and `locales/generated/*` with thousands of lines of churn as a side effect of touching any `msg` string. The i18n pipeline maintains them; leave them out of your commit.
- **Commit messages must not carry AI attribution.** CI rejects commits containing `@anthropic.com` co-author trailers or "Generated with Claude Code" lines.
- **Upgrade commands** (`packages/twenty-server/src/database/commands/upgrade-version-command/`): add or edit files only under the current `TWENTY_CURRENT_VERSION` directory, with a real epoch-ms timestamp strictly greater than every existing one in that directory — CI enforces both, and the upgrade cursor silently skips a command that sorts before an already-applied one. Include `up` and `down`; never rewrite committed command logic. Keep command-only helpers and constants in the version folder, never in runtime modules, and never make runtime code branch on migration state. See `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- **Entity file changes need a generated instance command**: `npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>` (slow = adds a data-backfill step).
- A read-only Postgres MCP server is configured in `.mcp.json` for inspecting workspace data, metadata, and migration results. Writes go through the CLI commands above.
- E2E login: click "Continue with Email" and use the prefilled credentials.

<!-- analytics-state:start -->
## CRM Analytics tool: project state

This section lets a new chat or a compacted session continue without losing context. Read it before doing anything on the analytics tool. **Keep it current:** update it after every 2 or 3 decisions and at the end of every phase. To update: edit `.claude/worktrees/analytics-work/state_block.md`, run `python -X utf8 .claude/worktrees/analytics-work/sync_claude_md.py`, then commit `CLAUDE.md` on the `analytics_tool` branch.

Last updated: 2026-11-07, while the research workflow was running.

### Status
| Phase | State |
|---|---|
| Setup | Done. Worktree created, dependencies installed. Not yet: `twenty-shared` build, `.env` files, local database. Docker Desktop is not running |
| Research and critical evaluation | Running (workflow run `wf_1185f5ea-65a`). Done: needs, presentation, frontend reports. Pending: backend report, critic, build contract, contract verifier |
| Backend, UI, integration workflows | Not started. No CRM code written or changed yet |
| Review and end-to-end tests | Not started |

**Next steps:** when the workflow ends, read `research/critique.md` and `contract.md` in the work folder, tell the user what changed from the plan, copy them to `docs/analytics/`, update this section, then start the build workflows.
If a new chat cannot resume the workflow, rerun only the missing reports: the agents' prompts are in the script at `C:\Users\Ahsan\.claude\projects\D--Coding-Flolabs-crm\80ecf43a-baa7-43f2-95f1-efcb443943ff\workflows\scripts\analytics-research-and-contract-wf_1185f5ea-65a.js`.

### Where everything is
- **Code goes in the worktree only:** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool`, branch `analytics_tool`, based on `origin/main` at `30f3e351`. Use absolute paths. Dependencies are installed there (run yarn as `node .yarn/releases/yarn-4.13.0.cjs`, because corepack is broken on this machine).
- **Never work in `D:\Coding\Flolabs\crm` itself.** It is `automations_branch`, which is not clean, and its git index is empty (about 38,500 staged deletions, every file shows as untracked). Do not switch its branch, commit there, or run `git reset` without asking. The user has been told about the index. A snapshot of its real changes is in `analytics-work/baseline.status`: only `CLAUDE.md`, two PDFs and `brag-output/`.
- **Work folder (not in git):** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics-work`: `brief.md` (the brief given to every agent), `spec.txt` (requirements as text, with the user's notes), `research/`, `contract.md`, `state_block.md`, `sync_claude_md.py`.
- **Requirements document:** `C:\Users\Ahsan\Downloads\Documents\Data Flow and Technical requirements - CRM Analytics Tool.pdf`. Text copy: `docs/analytics/requirements.txt`.
- **Committed on the branch:** `docs/analytics/CRM-Analytics-Architecture.pdf` (3-page overview for the team) and `docs/analytics/research/` (full reports with file and line references). Read those for detail beyond this summary.

### Rules from the user (do not reopen)
1. **The tool is part of the CRM.** A facade MODULE and service files are added to the existing `twenty-server`. The UI is a new page in the existing `twenty-front`, one of the CRM's pages, with routes from page to backend. Same server, shared storage. No separate server, container or web app, now or as an intended design.
2. **Do not touch existing CRM logic and do not break anything.** New code goes in new files. Every edit to an existing CRM file: smallest possible, one agent writes it, a different agent reviews it.
3. **Build what is intended, do not over-engineer, make the tool the team needs.** Critically evaluate scope.
4. **A good UI and good visual graphs matter.** Use the UI, Apple and dataviz skills for UI work.
5. **The user makes the decisions.** Give suggestions and ask before decisions, changes and anything irreversible. On 2026-11-07 the user said to start, using the suggested defaults listed below as the starting point. Report at the end of each phase. Do not fix or "improve" things that were not asked for, including bugs you notice: report them.
6. **Agents:** at most 6 at the same time, counting all workflows and subagents; 7 only if really needed; ask the user before going above that. Agents doing complex work can be Opus 5.5 at max effort (`model: 'opus', effort: 'max'`). Be especially careful with development, because this is the live CRM. Never use `isolation: 'worktree'` for agents, since that branches from the wrong commit.
7. **All work on `analytics_tool`.** Nothing merges to `main` or deploys until the user reviews it. Do not push without asking.
8. **Keep this section updated with all details.**

### Machine limits
Windows 11, 15 GB RAM. Free space was about 12 GB on C: and 9.5 GB on D: on 2026-11-07. The Windows page file grows on C: when memory fills. Agent logs are written to C: (about 1 to 2 MB per agent). Run heavy commands (nx, tsgo, jest, builds) one at a time and check free space between phases. Do not start Docker or the local CRM until needed; ask the user to close other apps first.

### What we are building
From the requirements: track contact and application counts by pipeline, track, program and stage; record stage history; calculate stage and overall conversion, drop-off and time in stage; show it on a dashboard with filters and a last-sync line; produce weekly and monthly reports; keep history for trends. It never sends applicant emails, changes CRM records or controls workflows.

**Design so far (the critic may change it, the contract is final once written):**
- `packages/twenty-server/src/modules/analytics/`: facade (read-only, the only code that touches CRM tables), jobs in the worker, metrics SQL, reports, API for the page.
- `packages/twenty-front/src/modules/analytics/` plus `packages/twenty-front/src/pages/analytics/AnalyticsPage.tsx`.
- A separate `analytics` Postgres schema in the same database, holding only IDs and categories: stage transitions (forever), mapping, daily snapshots, frozen report results, sync log. About 150 MB in year one (estimate). How to create these tables without touching the CRM's migrations is unresolved.
- Stage changes come from reading the CRM's timeline on a schedule, not from hooking the save path. Webhooks were rejected: failures are not retried, excess over 60 a minute is dropped, and they carry no previous value.
- Existing files to edit, one or two lines each: `modules.module.ts`, `cron-register-all.command.ts`, `twenty-shared/src/types/AppPath.ts`, `createWorkspaceRouteObjects.tsx`, `MainNavigationDrawerScrollableItems.tsx`. Page to backend is probably GraphQL with `@CoreResolver` and the core Apollo client.
- Trade-off the user knows about: a tool change means a full CRM deploy (about 15 minutes of build, then a restart).

### Requirements (from `research/needs.md`)
**Must:** current counts by pipeline, track, program, stage; record stage changes and keep corrections; stage and overall conversion on the same cohort; drop-off with an observation window (people inside the window are not dropped); stage duration plus a stuck and inactive list; updates when the CRM changes; daily reconciliation that logs what it restores; one metric source shared by page and reports; daily snapshots with no duplicates on rerun; applications dataset with unknowns marked; sync log and a stale warning; stable IDs with contacts and applications separate; UTC storage with a reporting timezone; reminders grouped under a primary stage so stage totals equal the people total; filters (date, track, program, source, status, period); daily, weekly and monthly trends with comparisons and application cohorts, where immature cohorts are marked and never 0%; four sections (Pipeline Overview, Category Performance, Conversion Funnel, Historical Performance); last successful sync on every screen; read-only; no names, emails or answers stored; idempotent replays; consistency checks; access control on page and API.
**Should:** weekly report, monthly report, report scheduler with failure detection and rerun, written retention, deletion and backup policy.
**Later:** current-state table and metric-summary table (both can be recomputed, which answers the user's duplicate-storage note), report delivery, separate monthly layout, daily conversion, per-program funnels, average duration (median is enough), one-minute sync (recruiting acts daily, 15 minutes may be enough).
**Superseded by the user's decisions:** separate application, FastAPI, Next.js, analytics database, webhooks as the source, API credential.
**Lead-number question is open:** the needs analyst suggests people signed this period; the presentation researcher suggests active people and how many are past their stage limit. The critic should settle it.

### Facts about the data
- **Pipeline, from `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts:9`:** New, reminders, Contacted, Before Meeting, Saturday meeting, Attended, Second Meeting, Agreement sent, Signed Paid or Signed Non paid, with No answer, Not Interested and Rejected by us as exits. `FLOLABS.md` says 25 options; the exact list is only in production.
- `Stage` is on **Person**, not on Applications, so history is keyed by person. Applications count volume only.
- **Applications has probably stopped growing:** form code writes no Applications record. Volume means imported Applications before go-live and Internship Application submissions after. Its fields and application date are unknown. Never use the import's `createdAt` as an application date.
- **Three follow-up forms set `Stage = INTERESTED`** (`websites-presentations.json:943`, `meeting-recordings.json:384`, `general-masterclass.json:555` under `packages/twenty-utils/flolabs/forms/`), which can move someone backwards, and `INTERESTED` is not in the pipeline above. So the funnel uses the furthest stage ever reached, not the current stage. Recruiting must say whether this reset is intended.
- **No track or program field.** `positionsAppliedFor` is a multi-select on Person with 39 values. Tracks appear only in two draft forms: Artificial Intelligence & Software Engineering; Robotics & Intelligent Systems; Business Management, Growth & Entrepreneurship; Design & Technical Communication; Emerging Sciences & Technology. Programs are spelled inconsistently (`SPORT_SCIENCE_INTERN`, "Sport Science", "Sports Science"). Use only `positionsAppliedFor` and map position to program and track.
- **Several positions:** count a person once in each position, never sum rows, and show distinct totals. Resubmitting a form overwrites positions (`public-form.service.ts:94-97`), so report current positions only.
- `applicantSource`: 21 options per `FLOLABS.md`, 18 in the form. Read live options; show unknown values as Unmapped.
- People includes non-applicants, so pipeline entry must be defined. Imported people have unknown stage entry dates: show "at least N days since go-live" and exclude them from medians. Exits (No answer, Not Interested, Rejected) are separate from timed-out drop-offs.
- **Timeline:** update rows keep `properties.diff` with `before` and `after` for audit-logged fields (`modules/timeline/services/timeline-activity.service.ts`). Same member, same record, same type within 10 minutes is merged in place (`modules/timeline/repositories/timeline-activity.repository.ts`), so A to B to C can appear as A to C: re-read recent rows, and count skipped stages as reached. Not yet tested on real data, including whether form-driven updates reach the timeline.
- History before the HubSpot move is not in the timeline. Spec section 10 forbids manufacturing past conversion from current counts, so launch state shows current-state views only and the rest fills in over time.
- Enterprise-licensed code must not be used: row-level permissions, record sharing, SSO, event logs, usage limits, validation rules.
- The system auth context skips permission checks, so read-only must be enforced by the facade offering read methods only.

### UI direction (from `research/presentation.md`, the critic may change it; field lists are in that file)
- Four tabs synced to the URL: **Overview, Funnel, Categories, Trends.** One filter row: date range, track, program (narrowed by track), source, period (Trends only). A last-sync line on every screen; if never synced, numbers are hidden; if stale, a warning with numbers kept.
- **Signature element, the stage ledger:** one real table with stages as rows and aligned columns: name, reached bar with a hollow track showing the previous stage's width, % to next on the line between rows, median and range on a shared days axis with a per-stage limit tick, and a past-limit count linking to people. Exactly one row carries the accent. "Not yet known" looks the same everywhere: no fill, muted "so far" text. It replaces three charts, gives keyboard access and a table view for free, and works in reports.
- **Views:** Stats (hero plus 3 figures, sparkline on new applications only); Stage totals (ledger, reminders nested); Stuck table sorted by days over the stage's own limit, opening the person, dormant counted separately; Funnel ledger; Cohort grid (months by steps, one hue, fixed window per stage, too-recent cells have no fill and show muted "12% so far"); Categories table (tracks expand to programs, people bars, step rates, overlap note); Sources table; Volume line with the previous period in gray; Rates line, stopping at the last mature bucket; Movement table.
- **Changed from the first chart ideas:** stacked stage areas cut; small funnels per track cut; do not highlight the "biggest drop" (the first step usually loses most, so highlight the lowest step rate with enough people, in neutral wording); stuck is not sorted by raw days; print n and mute rates under a minimum sample (30 as a placeholder); each view prints its date basis and unit; takeaways are server-filled templates, not AI text.
- **Reports:** frozen results from the same metric code, rendered as a page from the same components. Email, if any, carries counts per stage rather than names.

### Frontend wiring (from `research/frontend.md`)
- **Route:** add `Analytics = '/analytics'` to `packages/twenty-shared/src/types/AppPath.ts` (then `npx nx build twenty-shared --skip-nx-cache`); lazy import and route object in `createWorkspaceRouteObjects.tsx`, copying Team inbox (lines 42-46, 141-148), no `handle`. **Nav:** one import and one JSX line in `MainNavigationDrawerScrollableItems.tsx` (lines 2-3, 37-39), plus a new item component copying `team-inbox/components/NavigationDrawerTeamInboxItem.tsx`. Icon: `IconLayoutDashboard` from `twenty-ui/icon`.
- **Shell:** copy `pages/team-inbox/TeamInboxPage.tsx`: `PageTitle`, `PageCardLayout`, `PageCardHeader`. The body owns its scroll. Tabs: `TabList` from `@/ui/layout/tab-list/components/TabList`, whose `behaveAsLinks` keeps the tab in the URL hash. Filters: a small hook over `useSearchParams`, keeping `search` and `hash`.
- **Data:** hand-written `gql` with `useQuery` from `@apollo/client/react` and `client: useApolloCoreClient()`, always. Never import new types from `~/generated/graphql`. Errors: `ToastOnQueryErrorEffect`. Polling: `pollInterval` with `skipPollAttempt: () => document.hidden`.
- **Charts:** `GraphWidgetBarChart` and `GraphWidgetLineChart` take plain data but need `PageLayoutEditModeProviderContext`, `PageLayoutComponentInstanceContext` and `WidgetComponentInstanceContext` (see `graph/__tests__/GraphWidgetTestWrapper.tsx`). Wrap them in one file in `modules/analytics/components`, the only place importing from `page-layout/widgets/graph`, to contain upgrade risk. Bars draw on canvas, so no keyboard focus or per-row color. Line x-axis is categorical. Pie needs metadata, so skip it. `GraphWidgetAggregateChart` works anywhere. Custom rows, like `FormBuilderResponsesTab.tsx:57-82`: plain DOM plus Linaria.
- **Tokens:** `themeCssVariables` from `twenty-ui/theme` adapts to dark mode with no code, including `color.blue2` to `color.blue9` for the cohort grid. Canvas and nivo need `useTheme()`.
- **Kit:** `Select` at `@/ui/input/components/Select`; `SegmentedControl`, `Tag`, `Section`, `Skeleton`, `Tooltip` in `twenty-ui`; no date-range picker exists, so use presets plus native date inputs; tables at `@/ui/layout/table/components`; `EmptyState`, `ErrorState`; `useNumberFormat`, `useDateTimeFormat`, `beautifyPastDateRelativeToNow`; `useOpenRecordInSidePanel` opens a person.
- **Lint:** no hard-coded colors, CSS properties alphabetical, styled names start with `Styled`, `<Name>Props`, kebab-case module folders with files only in leaf folders, one const per file in `constants/`, no `../` imports, inline `type` imports, Lingui for all user-facing strings. Do not run `lingui extract` or `compile`, and do not commit catalogs.
- **Tests:** `npx jest <file> --config=packages/twenty-front/jest.config.mjs`. Put metric math in `utils/` and test it like `modules/notifications/utils/__tests__/buildNotificationItems.test.ts`.

### Open decisions and the defaults in use
| Decision | Default | Who |
|---|---|---|
| Funnel counts people or applications | People for the funnel, applications for volume | Team |
| Stage and position mapping | Start from the pipeline and 5 tracks above | Recruiting |
| Pre-HubSpot history | Start from go-live and label it. Backfill from HubSpot only if available | User |
| Page to backend | GraphQL `@CoreResolver` likely, to be settled by the contract | Contract |
| Table creation | Separate schema, method unresolved | Contract |
| Who can see analytics | Selected roles with the least new permission machinery | User |
| Success stage, timezone, drop-off window, stuck limits | Probably Signed Paid and Signed Non paid; store UTC; the rest are settings | Recruiting |
| Reports | Fixed internal list, delivery undecided (n8n suggested); frozen on the page first | User |
| Merge and deploy | Only after the user reviews everything | User |

### Waiting on the user or recruiting (send when the contract is ready)
1. Export of Person `Stage` options: value, label, order, and whether each is a main stage, a reminder (of which stage), or an exit.
2. The Applications object's field list, whether it links to Person, and whether it holds an application date.
3. Read-only production queries for sample timeline rows and stage counts, with no personal data. Exact wording comes in the contract.
4. Each of the 39 positions assigned to one of the 5 tracks.
5. Should follow-up forms move someone back to `INTERESTED`, and where does it sit in the order?
6. Success stage, entry stage, reporting timezone, drop-off window, stuck days per stage.
7. Who may view analytics, who receives reports and how.
8. One hand-counted sample period to check results against.
9. Docker Desktop started, and other apps closed, before end-to-end testing.

### Reported to the user, left alone
- Possible bug: `useNotificationsSeenState.ts`, `FormBuilderResponsesTab.tsx:161` and `FormBuilderActionsEditor.tsx:63` appear to omit the core Apollo client, so those queries may fail. Unconfirmed. New code must not copy it.
- GitHub reported 402 dependency vulnerabilities on `main`, 5 critical. Not investigated.

### Decision log
- 2026-11-05: External web app rejected. The tool is one of the CRM's pages, on the same server, with shared storage.
- 2026-11-06: Facade is a module, the tool has no server of its own. Core CRM edits need a writer agent and a reviewer agent. Service files are TypeScript because the repo is. The user agreed to the read-only facade, worker-run heavy work and a separate `analytics` schema.
- 2026-11-06: Branch `analytics_tool` created from `origin/main` with the 3-page PDF, and pushed.
- 2026-11-07: Chart mockup declined for now. The user gave the go to implement with multi-agent workflows, including a research agent that critically evaluates scope.
- 2026-11-07: All project details to be kept in `CLAUDE.md` and updated regularly.
- 2026-11-07: Agent limit settled at 6 at a time, 7 if really needed, ask before more. (It moved through 5, 6 and 4 first.) Complex work can use Opus 5.5 at max effort. Develop with extra care because it is the CRM.
<!-- analytics-state:end -->
