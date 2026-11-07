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

This section lets a new chat or a compacted session continue without losing context. Read it before doing anything on the analytics tool. **Keep it current:** update it after every 2 or 3 decisions and at the end of every phase. To update: edit `.claude/worktrees/analytics-work/state_block.md` (absolute path `D:\Coding\Flolabs\crm\.claude\worktrees\analytics-work\state_block.md`), run `python -X utf8` on `sync_claude_md.py` in that folder, then commit `CLAUDE.md` on the `analytics_tool` branch.

Last updated: 2026-11-07 18:15, backend, UI, integration and SQL proof workflows running.

### Status
| Phase | State (2026-11-07, 18:15) |
|---|---|
| Setup | Done. Worktree, dependencies, `twenty-shared` built. `twenty-ui` build and Docker Desktop (with db and redis containers) started by the main session |
| Research, critique, contract | Done. Contract corrected by the verifier: 13 defects fixed |
| Backend `analytics-backend` (`wf_3a38ec46-0e1`) | Foundation done, all 8 specs pass. Pipeline and metrics agents running, then up to 3 review and fix rounds |
| UI `analytics-ui` (`wf_f8080ac4-839`) | Foundation done, 30 tests pass; component tests need `twenty-ui` built. Funnel and Categories, Trends and Reports agents running, then up to 3 review and fix rounds |
| Integration `analytics-integration` (`wf_1c810e29-9f0`) | Running: writer agent, then a different reviewer agent, on the five existing files. Commit each file separately once approved |
| SQL proof `analytics-sql-proof` (`wf_182ab2dc-c6d`) | Running: real Postgres harness in `analytics-work/e2e/sql-proof/`, results in `analytics-work/e2e/RESULTS.md`. **Rerun it once the backend services exist**, and feed failures to a backend fix agent |
| Automated tests `analytics-tests` | Running continuously: Opus writes permanent test files in `packages/twenty-utils/flolabs/analytics-tests/`, Haiku runs them when code changes, Sonnet evaluates. Run any layer with `node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <unit-server, unit-front, integration, blackbox, ui, all>`. Results and bugs are in `analytics-work/test-results/` (`latest-<layer>.json`, `history.jsonl`, `bugs.md`). A data flow graph layer (`analytics-tests/dataflow/`, workflow `analytics-dataflow-tests`, requested by the user) maps every path from CRM tables to the screen, tests each definition-use edge, and proves no personal data reaches the analytics tables. Seed data (`analytics-tests/seed/`, workflow `analytics-seed-data`, requested by the user): deterministic fake recruiting data at small and production scale (about 43,000 people), independently calculated expected results, a scale test against the 8 second page limit, and a loader for the local CRM, local only. It never fixes product code: **read `bugs.md` between phases and send real bugs to a fix agent.** Local only, it refuses non-localhost targets |
| Typecheck, lint, boot test, full local end-to-end | Not started |

All new code is uncommitted in the worktree until each workflow finishes. Agents do not commit; the main session commits at phase ends. **Nothing is pushed: the user said to keep it local for now.**

**Time estimate given to the user on 2026-11-07 around 18:05:** 4 to 5 hours in total to working and tested locally, 3 at best.

**Next steps, do not stop to ask (the user said to keep developing):**
1. When backend and UI workflows finish, read results and commit each area on `analytics_tool`. Commit the five integration edits one per file.
2. Rerun the SQL proof with all services, fix real failures with a separate fix agent.
3. Typecheck and lint, server then front, never together: `npx tsgo -p tsconfig.json --noEmit` in the package directly, `npx nx lint:diff-with-main <pkg>`. Then boot-test server and worker.
4. Run the full local end-to-end plan in contract section 9, with screenshots of all tabs and states, light and dark.
5. Report to the user. Merging and deploying only after they review.
- **The user has no production or server access** and must not be asked to run anything there. `docs/analytics/production-audit.sql` is for whoever has access, later. The user has a normal CRM login and will send screenshots of Settings, Data model, People, Stage and of a person's Timeline when they can; do not wait for them. **Stop rule:** if the audit eventually shows no stage rows on the timeline, or `isAuditLogged` false for `stage`, stop work on metrics and ask the user.

**Docker Desktop:** started by the main session for the local Postgres and Redis (containers `twenty-dev-db-1`, `twenty-dev-redis-1`). The user wants to close it because of its memory use and asked to be told when: tell them as soon as the SQL proof, integration tests and full end-to-end run no longer need it.

**Agent limit note:** on 2026-11-07 the user said a usage window resets in about 30 minutes with tokens to spare, so extra agents are fine until about 40 minutes after 18:10, then back to the normal limit of 6, or 7 if really needed.

If a workflow cannot be resumed in a new chat, check `git status` in the worktree to see what was written, compare with `docs/analytics/contract.md` section 2, and continue from there.

### Where everything is
- **Code goes in the worktree only:** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool`, branch `analytics_tool`, based on `origin/main` at `30f3e351`. Use absolute paths. Dependencies are installed there. Corepack is broken on this machine, so `yarn` is not on the PATH and Nx targets that call it fail silently with a clean exit. Before any `npx nx` command run `export PATH="/d/Coding/Flolabs/crm/.claude/worktrees/analytics-work/bin:$PATH" NX_DAEMON=false NX_TUI=false`, which adds a local yarn shim. Check that the output folder really appeared.
- **Never work in `D:\Coding\Flolabs\crm` itself.** It is `automations_branch`, which is not clean, and its git index is empty (about 38,500 staged deletions, every file shows as untracked). Do not switch its branch, commit there, or run `git reset` without asking. The user has been told about the index. A snapshot of its real changes is in `analytics-work/baseline.status`: only `CLAUDE.md`, two PDFs and `brag-output/`. Check it was not touched by building a temporary index with `GIT_INDEX_FILE`.
- **Work folder (not in git):** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics-work`: `brief.md` (given to every agent), `spec.txt`, `research/`, `contract.md` (live copy), `state_block.md`, `sync_claude_md.py`.
- **Requirements document:** `C:\Users\Ahsan\Downloads\Documents\Data Flow and Technical requirements - CRM Analytics Tool.pdf`. Text copy with the user's notes: `docs/analytics/requirements.txt`.
- **Committed on the branch:** `docs/analytics/contract.md` (**the build contract, the single source of truth, read it before changing anything**), `docs/analytics/research/` (needs, presentation, backend, frontend, critique: full reports with file and line references), `docs/analytics/CRM-Analytics-Architecture.pdf` (3-page overview for the team, slightly older than the contract).

### Rules from the user (do not reopen)
1. **The tool is part of the CRM.** A facade MODULE and service files are added to the existing `twenty-server`. The UI is a new page in the existing `twenty-front`, one of the CRM's pages, with routes from page to backend. Same server, shared storage. No separate server, container or web app, now or as an intended design.
2. **Do not touch existing CRM logic and do not break anything.** New code goes in new files. Every edit to an existing CRM file: smallest possible, one agent writes it, a different agent reviews it.
3. **Build what is intended, do not over-engineer, make the tool the team needs.** Critically evaluate scope.
4. **A good UI and good visual graphs matter.** Use the UI, Apple and dataviz skills for UI work.
5. **The user makes the decisions.** Give suggestions and ask before decisions, changes and anything irreversible. On 2026-11-07 the user said to start, and later to stop spending time on research and build now, with the suggested defaults as the starting point. Report at the end of each phase. Do not fix or "improve" things that were not asked for, including bugs you notice: report them.
6. **Agents:** at most 6 at the same time, counting all workflows and subagents; 7 only if really needed; ask the user before going above that. Agents doing complex work can be Opus 5.5 at max effort (`model: 'opus', effort: 'max'`). Be especially careful with development, because this is the live CRM. Never use `isolation: 'worktree'` for agents, since that branches from the wrong commit.
7. **All work on `analytics_tool`.** Nothing merges to `main` or deploys until the user reviews it. Do not push until the user says so.
8. **Keep this section updated with all details.**

### Machine limits
Windows 11, 15 GB RAM. Free space on 2026-11-07: about 12 GB on C:, 8 GB on D:. The Windows page file grows on C: when memory fills. Agent logs are written to C: (about 1 to 2 MB per agent). Run heavy commands (nx, tsgo, builds) one at a time and check free space between phases. `yarn start` and `setup-dev-env.sh` are likely to fail on Windows: use the commands in contract section 9.

### What we are building
From the requirements: track contact and application counts by pipeline, track, program and stage; record stage history; calculate stage and overall conversion, drop-off and time in stage; show it on a dashboard with filters and a last-sync line; produce weekly and monthly reports; keep history for trends. It never sends applicant emails, changes CRM records or controls workflows.

**Architecture, settled by the critic and contract:**
- **Server:** `packages/twenty-server/src/modules/analytics/`, with all Nest and GraphQL names prefixed `CrmAnalytics`, because GraphQL types `Analytics` and `UsageAnalytics` already exist. Facade service (read methods only, the only file naming CRM tables, a spec enforces this); database, settings, sync, snapshot, metrics, report and meta services; one resolver.
- **UI:** `packages/twenty-front/src/modules/crm-analytics/` (not `analytics`, which already exists there) plus `src/pages/analytics/AnalyticsPage.tsx`. Path `/analytics` is a local constant, so `AppPath.ts` is not edited.
- **Four tables in an `analytics` Postgres schema, same database:** `stage_transition` (generated `id`, `source_id` as the timeline row ID, person, from, to, happened at, source updated at, origin; unique on workspace, source ID and source updated at; stored rows never change), `daily_snapshot` (long format), `report` (frozen JSON), `sync_log`. Only IDs, stage, position and source values, and counts. Created with idempotent `CREATE ... IF NOT EXISTS` at the start of each job through a dedicated one-connection data source. Raw SQL, because a TypeORM entity under `src/modules` is not loaded. Evolve by appending `ALTER ... IF NOT EXISTS`.
- **No copied current-state table.** Current counts read `person` live, which answers the user's duplicate-storage note. **No mapping tables:** one constant file `constants/crm-analytics-config.constant.ts` holds stages, tracks, windows, limits and zone; raw values stay stored, so remapping rewrites nothing, which answers "why normalize". While `isProvisional` is true the page shows a banner.
- **Two scheduled jobs on `workspaceQueue` (cron only enqueues on `cronQueue`, which has concurrency 1):** sync every 15 minutes (`7,22,37,52 * * * *`) re-reads the timeline with a 30-minute overlap using one `INSERT ... SELECT ... ON CONFLICT DO NOTHING`, with no rows in Node. If the CRM later merges a new value into a row already read, one more transition is appended, so an observed move is never lost; daily (`30 2 * * *`) does a full re-read, reconcile (flagged rows, excluded from durations), snapshot and consistency check in one statement, trims the log at 90 days, and builds missing weekly and monthly reports.
- **Metrics computed per request** by one service used by page and reports, not pre-calculated, because free filters would need a cube. Page transactions are read-only with an 8 second statement timeout; jobs have 120 seconds.
- **API:** GraphQL `@CoreResolver` with seven queries returning one JSON payload DTO, so only two GraphQL types are added. Guards: `AuthPrincipalGuard` (user session only) and `SettingsPermissionGuard(PermissionFlagType.EXPORT_CSV)`. The types file is byte-identical on server and front, and a spec compares them.
- **Off switch:** key-value `CRM_ANALYTICS_DISABLED`, flipped by SQL. **Tracking start:** `CRM_ANALYTICS_TRACKING_START_AT`, default `2026-10-27T00:00:00.000Z`.
- **Five existing files to edit:** `packages/twenty-server/src/modules/modules.module.ts`, `packages/twenty-server/src/database/commands/database-command.module.ts`, `packages/twenty-server/src/database/commands/cron-register-all.command.ts`, `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx`, `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`. Exact lines are in contract section 2.
- **Trade-off the user knows about:** a tool change means a full CRM deploy (about 15 minutes of build, then a restart).
- **Later, not v1:** report delivery (email, n8n), mapping UI, HubSpot backfill, cohort shading, per-program funnels, range plots, limit ticks, hollow bar tracks, sparklines, stacked areas, URL-held and multi-select filters, CRM-list drill-downs, daily conversion, polling, listener fallback.

### Requirements (from `docs/analytics/research/needs.md`, corrected by the critic)
**Must:** current counts by pipeline, track, program, stage; record stage changes and keep corrections; stage and overall conversion on the same cohort; drop-off with an observation window (people inside the window are not dropped); stage duration plus a stuck and inactive list; updates when the CRM changes; daily reconciliation that logs what it restores; one metric source shared by page and reports; daily snapshots with no duplicates on rerun; applications dataset with unknowns marked; sync log and a stale warning; stable IDs with contacts and applications separate; UTC storage with a reporting timezone; reminders grouped under a primary stage so stage totals equal the people total; filters (date, track, program, source, status, period); daily, weekly and monthly trends with comparisons and application cohorts, where immature cohorts are marked and never 0%; four sections (Pipeline Overview, Category Performance, Conversion Funnel, Historical Performance); last successful sync on every screen; read-only; no names, emails or answers stored; idempotent replays; consistency checks; access control on page and API; weekly and monthly reports; written retention policy (contract section 3).
**Critic's definitions:** stuck = tracked and past its stage limit; inactive = imported and unmoved since tracking began. Phase 1 data audit has not happened: run the production queries in contract section 11 before trusting funnel numbers.

### Facts about the data
- **Pipeline, from `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts:9`:** New, reminders, Contacted, Before Meeting, Saturday meeting, Attended, Second Meeting, Agreement sent, Signed Paid or Signed Non paid, with No answer, Not Interested and Rejected by us as exits. `FLOLABS.md` says 25 options; the exact list is only in production, so raw values in the config constant are guesses except `INTERESTED`, and anything else shows as Unmapped.
- `Stage` is on **Person**, not on Applications, so history is keyed by person. Applications count volume only.
- **Applications has probably stopped growing:** form code writes no Applications record. Volume means imported Applications before go-live (total only, "dates unknown") and `formSubmission` rows for the `Internship Application` form after. Never use the import's `createdAt` as an application date.
- **Three follow-up forms set `Stage = INTERESTED`** (`websites-presentations.json:943`, `meeting-recordings.json:384`, `general-masterclass.json:555` under `packages/twenty-utils/flolabs/forms/`), which can move someone backwards. The funnel uses the furthest stage ever reached, `INTERESTED` has kind `OTHER` with no funnel step, and the stage clock restarts. Recruiting must say whether this reset is intended.
- **No track or program field.** `positionsAppliedFor` is a multi-select on Person with 39 values; contract section 1 has a default assignment to the 5 tracks for recruiting to check. Tracks: Artificial Intelligence & Software Engineering; Robotics & Intelligent Systems; Business Management, Growth & Entrepreneurship; Design & Technical Communication; Emerging Sciences & Technology. Programs are spelled inconsistently across forms (`SPORT_SCIENCE_INTERN`, "Sport Science", "Sports Science"), so use only `positionsAppliedFor`.
- **Several positions:** count a person once in each, never sum rows, return distinct totals and "n in several". Resubmitting a form overwrites positions (`public-form.service.ts:94-97`), so only current positions are reported.
- `applicantSource`: 21 options per `FLOLABS.md`, 18 in the form. Read live options; unknown values show as Unmapped.
- **Timeline:** table `timelineActivity`, no `name` column; rows have `targetPersonId`, `linkedRecordId`, `properties`, `happensAt`, `updatedAt`. Update rows keep `properties.diff.stage.before/after` for audit-logged fields. Only foreign-key indexes exist on the table. Same member, same record, same type within 10 minutes merges in place (`timeline-activity.repository.ts:357`), so rows change: append a transition when `to_stage` changed since the last read, ignore rows where before equals after, count skipped stages as reached. Creation stores `{}`, so the first stage comes from the person row. Deleted people are destroyed after 14 days by default, cascading to their rows, which is why transitions are copied. Timeline jobs have `retryLimit: 1`, so rows can be lost, which is why reconcile exists. Not yet tested on real data, including whether form-driven updates reach the timeline: contract section 9 checks T1 to T11 settle this locally.
- **Imports:** imported people count in current totals only, never in funnel cohorts. Durations for them read "at least N days" and are excluded from medians. History before the HubSpot move is not in the timeline, and spec section 10 forbids manufacturing past conversion from current counts, so launch shows current-state views and the rest fills in.
- Enterprise-licensed code must not be used: row-level permissions, record sharing, SSO, event logs, usage limits, validation rules.
- The system auth context skips permission checks, which is why the resolver guard and the read-only facade matter.
- **Boot risk:** `ModulesModule` loads in server, worker and GraphQL schema, so a bad provider stops the CRM. Boot-test before deploy; `deploy.sh` rollback is the backstop.

### UI (contract section 8 is the full version; research in `docs/analytics/research/presentation.md`)
- **Layout:** `PageCardHeader` with Analytics and "Last successful sync 12 minutes ago"; banners (stale, provisional); `TabList` with **Overview, Funnel, Categories, Trends, Reports**; one filter row (dates, track, program narrowed by track, source, status, period; period only on Trends; hidden on Reports); one takeaway sentence per tab; views each with a unit and date-basis note. No polling; filter state is `useState`.
- **Eight views:** figures (large active people; new applications with change; total contacts; stuck with inactive under it); stage totals table with nested reminders; stuck table sorted by days over limit, opening the person in the side panel; **stage ledger**; category table (tracks expand to programs, or sources); trend line (metric selector, previous period in gray, table beneath); cohort table (numbers with n, no shading); movement table.
- **Stage ledger, the signature element:** one real table, stages as rows; columns Stage, Reached (solid bar plus number), To next (rate on the hairline between rows), Timed out, Exited, Too recent, Median days. Exactly one row carries the accent, labeled neutrally "Lowest step". `AnalyticsRateCell` is the only way a rate displays: never 0% for unknown; muted "12% so far"; muted with n under the minimum sample (30); "Not enough data".
- **Only `AnalyticsTrendChart.tsx` imports chart internals** (`GraphWidgetLineChart`, with the three contexts as in `graph/__tests__/GraphWidgetTestWrapper.tsx`). All other visuals are plain DOM with Linaria; canvas bars are not used because they cannot take focus or align with columns.
- **States:** loading, permission, error, off, no stage field, never synced, stale, not recording, empty, imported excluded by date, unmapped, field missing, too recent, launch, trend unavailable.
- **Frontend rules:** always `client: useApolloCoreClient()`; hand-written `gql`; never `~/generated/graphql` for these queries; `themeCssVariables` only; Linaria names start `Styled`; CSS sorted; one const per constants file; Lingui on all strings; do not run `lingui extract` or `compile`, do not commit catalogs. Test with `npx jest <file> --config=packages/twenty-front/jest.config.mjs`.

### Open decisions and defaults in use (contract section 1 has all 17)
| Decision | Default | Who confirms |
|---|---|---|
| Stage values, order, kinds, entry and success | From the pipeline above; entry `NEW`, success `SIGNED` | Recruiting |
| Positions to tracks | Table in contract section 1 | Recruiting |
| Time zone, windows, limits | UTC, 14 days per step, 90 overall, 14 stuck, minimum sample 30 | Recruiting |
| Funnel unit, one pipeline | People, one pipeline | Team |
| Who may view | Roles with `EXPORT_CSV`, whose label is overloaded | User |
| Reports | Frozen on a Reports tab, no delivery in v1 | User |
| Retention | Paragraph in contract section 3 | User |
| Tracking start | 2026-10-27, the day after the import | User, after audit |

### Waiting on the user or recruiting (contract section 11 has exact wording)
1. Someone with production access (not the user) runs the read-only `docs/analytics/production-audit.sql` and sends the result: stage counts and options, sample timeline rows, timeline size, people by day, field audit flags, positions, sources, Applications fields, form submissions. The stage list can also come from the CRM's Settings, Data model, People, Stage, for anyone with an admin login.
2. For the `Stage` options that script returns: mark each main, reminder or exit, plus entry and success stages.
3. Should follow-up forms move someone back to `INTERESTED`?
4. Check the 39-position, 5-track table.
5. Time zone, windows, stuck days, minimum sample.
6. Confirm funnel counts people, one pipeline only.
7. Applications object: name, fields, link to Person, application date.
8. When the last HubSpot import finished, and whether HubSpot stage history is still readable, which could give a real funnel at launch.
9. Who may view, whether `EXPORT_CSV` is acceptable as the gate, whether a report page is enough for v1.
10. One hand-counted sample period.
11. Approve the retention paragraph.
12. Start Docker Desktop and close other apps when end-to-end testing begins.

### Reported to the user, left alone
- Possible bug: `useNotificationsSeenState.ts`, `FormBuilderResponsesTab.tsx:161` and `FormBuilderActionsEditor.tsx:63` appear to omit the core Apollo client, so those queries may fail. Unconfirmed. New code must not copy it.
- GitHub reported 402 dependency vulnerabilities on `main`, 5 critical. Not investigated.

### Decision log
- 2026-11-05: External web app rejected. The tool is one of the CRM's pages, on the same server, with shared storage.
- 2026-11-06: Facade is a module, the tool has no server of its own. Core CRM edits need a writer agent and a reviewer agent. Service files are TypeScript because the repo is. The user agreed to the read-only facade, worker-run heavy work and a separate `analytics` schema.
- 2026-11-06: Branch `analytics_tool` created from `origin/main` with the 3-page PDF, and pushed.
- 2026-11-07: Chart mockup declined for now. The user gave the go to implement with multi-agent workflows, including a research agent that critically evaluates scope.
- 2026-11-07: All project details to be kept in `CLAUDE.md` and updated regularly. Saved state stays local, not pushed.
- 2026-11-07: Agent limit settled at 6 at a time, 7 if really needed, ask before more. Complex work can use Opus 5.5 at max effort. Develop with extra care because it is the CRM.
- 2026-11-07: Verifier fixes adopted: merged timeline rows append instead of overwrite (requirement R2), snapshot and consistency check run in one statement, reports' comparisons use counts only, `countPrevious` removed, phase gates added (code on defaults, sign-off in order).
- 2026-11-07: The user has no production access. Production data is not a build blocker: the page shows real stage values as Unmapped rows once deployed, and timeline behaviour is proven locally.
- 2026-11-07: The user asked for a workflow that keeps testing, with test files that can be rerun: Opus writes, Haiku or Sonnet run and evaluate.
- 2026-11-07: The user said to stop waiting on research and build now. Critic's simplifications adopted: no current-state table, mapping in a constant, 15-minute sync, metrics per request, eight views instead of 13, reports on a page, no polling. Build started before the contract verifier finished.
<!-- analytics-state:end -->
