# CRM Analytics tool: shared brief for every agent

## Where you work
- Branch `analytics_tool`. Working copy (WT): `D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool`
- Read code ONLY from WT. Edit code ONLY inside WT. Always use absolute paths. In Bash, `cd` to WT first.
- `D:/Coding/Flolabs/crm/packages` is a DIFFERENT checkout (`automations_branch`, not clean). Never read facts from it. Never edit it.
- Reports and scratch files go in WORK: `D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work`
- WT is based on `origin/main` (commit 30f3e351) plus one commit adding `docs/analytics/CRM-Analytics-Architecture.pdf`.
- WT has no `node_modules` yet. Do not run `yarn install` unless a task explicitly tells you to.

## Machine limits (important)
Windows 11, 15 GB RAM, D: about 15 GB free, C: about 12 GB free. Do not run heavy commands (installs, builds, nx, jest, tsgo, docker) unless your task says so, and never several at once. Keep command output small.

## What this is
FloLabs CRM is FloLabs Innovations Group's fork of Twenty v2.48.1, used to recruit interns (replaced HubSpot). See `FLOLABS.md` in WT. About 42,975 people, 42,371 Applications (imported from HubSpot), 1 workspace in production, a few team members. It runs on one Hetzner CPX32 server (4 vCPU, 8 GB RAM) with Docker Compose: server, worker, Postgres 16, Redis, Caddy.

The team wants the "CRM Intelligence & Analytics System": see the requirements document at `WORK/spec.txt`, which includes the user's own highlights and notes. Read it in full. Its section 12 says "separate read-only application"; the user has since OVERRULED that (next section).

## Decisions the user has made (do not reopen)
1. **No new server, no separate app.** The tool is part of the existing CRM. A facade MODULE and service files are added to the existing backend (`twenty-server`). The UI is a new page in the existing front end (`twenty-front`), with routes from page to backend. Same server, same database ("shared storage").
2. **Do not touch existing CRM logic, and do not break anything.** New code goes in new files. Edits to existing CRM files must be the smallest possible, and each one needs one agent to write it and a different agent to review it.
3. **Build what is intended. Do not over-engineer.** Make the tool the team actually needs. The user asked for this to be critically evaluated.
4. **A good UI and good visual graphs matter.** The page must look like it belongs in the CRM.
5. Do not fix or "improve" anything that was not asked for, including bugs you notice. Report them instead.
6. Work happens on `analytics_tool`. Nothing merges to `main` or deploys until the user reviews it.

## Proposed design so far (the team has a 3-page PDF of this; it may be challenged)
- `packages/twenty-server/src/modules/analytics/`: facade (read-only methods, the only code that touches CRM data), sync/reconcile/snapshot jobs in the worker, metrics SQL, report jobs, an API for the page.
- `packages/twenty-front/src/modules/analytics/`: page, charts, filters.
- Stage changes are read from the CRM's timeline by a job every minute. We do not hook the code that saves records.
- A separate `analytics` Postgres schema in the same database holds only IDs and categories: stage transitions (forever), current state (rebuildable), mapping, daily snapshots, frozen report results, sync log. Estimated about 150 MB in year one.
- Raw values are stored as they are; a small mapping table is joined at query time, so definitions can change without rewriting history. This answers the user's "why normalize?" note. The user's other note worried about duplicate storage, so copy as little as possible.
- Heavy work runs in the worker. The page reads pre-calculated numbers. Query time limits and an off switch protect the CRM.
- Expected edits to existing files: `modules.module.ts`, `cron-register-all.command.ts`, `AppPath.ts`, `createWorkspaceRouteObjects.tsx`, `MainNavigationDrawerScrollableItems.tsx`.

## Open decisions with current defaults (user reviewed these and said to start)
| # | Decision | Default |
|---|---|---|
| 4 | Source of stage changes | Read the timeline on a schedule; small listener only as a fallback |
| 5 | Where tables live and how they are created | Separate `analytics` schema. How to create it safely without touching the CRM's migrations is UNRESOLVED |
| 6 | Funnel counts people or applications | People for the funnel, applications for volume |
| 7 | Mapping of stages and positions | Recruiting decides later. Start from the 5 tracks in the forms |
| 8 | History before the HubSpot move | Start from go-live and label it clearly |
| 9 | How the page calls the backend | UNRESOLVED: compare options and what each touches |
| 10 | Who sees analytics | Selected roles, with the least new permission machinery |
| 11 | Screens and charts | Reuse CRM components; funnel chart is new |
| 12 | Success stage, timezone, windows, thresholds | Recruiting decides; store UTC; the rest are settings |
| 13 | Reports | Fixed internal list; delivery undecided (n8n was suggested) |
| 14 | Retention | Stage history forever, as in the table above |

## Facts already checked in the code (verify again if you rely on them)
- `twenty-server/src/modules/timeline/services/timeline-activity.service.ts`: on updates, rows keep only `properties.diff` with `before`/`after` for audit-logged fields. `modules/timeline/utils/exclude-non-audit-logged-fields-from-events.util.ts` removes non-audit-logged fields. `field-metadata.entity.ts` has `isAuditLogged`; custom fields default from `isAuditLoggableFieldType(type)`. NOT yet tested on real data.
- `twenty-server/src/modules/timeline/repositories/timeline-activity.repository.ts`: updates by the same workspace member on the same record and type within 10 minutes (`tenMinutesAgo`) are MERGED into one row in place (`objectRecordDiffMerge`: first `before`, last `after`). So A to B to C can appear as A to C.
- Webhooks are unsuitable and no longer needed: failures are not retried, excess over 60 a minute is dropped, and there is no previous value.
- Server vs worker: same image. `src/queue-worker/queue-worker.ts` runs jobs. Crons register through `src/database/commands/cron-register-all.command.ts` at container start (`twenty-docker/twenty/entrypoint.sh`). 26 queues in `engine/core-modules/message-queue/message-queue.constants.ts`.
- Data: metadata and users in the `core` schema; records in `workspace_<base36>` (`engine/workspace-datasource/utils/get-workspace-schema-name.util.ts`); custom object tables get a `_` prefix (`engine/utils/compute-table-name.util.ts`).
- `twenty-orm` is custom SQL over `pg`; TypeORM is only for `core`. `WorkspaceOrmManager` plus `buildSystemAuthContext` is how fork code reads records (`modules/public-form/services/public-form.service.ts`). The system context BYPASSES permission checks.
- Fork-level examples to copy: `modules/public-form` (controller, stats resolver, services), `modules/notifications-seen` (`@CoreResolver`), `twenty-front/src/modules/team-inbox`, `twenty-front/src/modules/notifications`.
- Front: default Apollo client points at `/metadata`; core fields need the core client (`useApolloCoreClient`, or the `client` option). Three FloLabs call sites appear to omit it (a suspected bug: `useNotificationsSeenState.ts`, `FormBuilderResponsesTab.tsx:161`, `FormBuilderActionsEditor.tsx:63`). Do NOT copy that mistake and do NOT fix it.
- Charts live in `twenty-front/src/modules/page-layout/widgets/graph/`: bar is custom canvas (`graph-widget-bar-chart/components/BarChart.tsx` takes plain data props but uses component state), line and pie use `@nivo/line` and `@nivo/pie`, plus aggregate. Legend and tooltip components exist. There is no funnel, heatmap or range chart. `GRAPH_MAXIMUM_NUMBER_OF_GROUP_COLORS` is 5.
- REST has `GET /rest/<object>/groupBy`. REST limit is 100 requests a minute and 200 records a page; irrelevant if we stay in-process.
- Production data facts, from `FLOLABS.md` and form files only (we have NO production access yet):
  - `Stage` is a Person field with 25 options, e.g. `INTERESTED`. The list is not in the repo. Email template names hint at stages ("Contacted", "BEFORE MEETING", "ATTENDED + MASTERCLASSES") but that is not confirmed.
  - `positionsAppliedFor` is a multi-select on Person with 39 values (`twenty-utils/flolabs/forms/internship-application.json`).
  - `applicantSource` on Person: 21 options per FLOLABS.md, 18 in the form.
  - Applications is a custom object from HubSpot. Its name and fields are not in the repo.
  - Five tracks appear only as a question in two DRAFT forms (`skills-experience.json`, `general-questions.json`), mapped to no person field: Artificial Intelligence & Software Engineering; Robotics & Intelligent Systems; Business Management, Growth & Entrepreneurship; Design & Technical Communication; Emerging Sciences & Technology. Programs are spelled inconsistently across sources (`SPORT_SCIENCE_INTERN`, "Sport Science", "Sports Science").
- Enterprise-licensed code must not be enabled or relied on: row-level permissions, record sharing, SSO, event logs, usage limits, validation rules.

## Chart suggestions so far (a starting point to critique, not decided)
| What we show | Suggested chart |
|---|---|
| Main numbers | One large main number plus 2 to 4 smaller ones with small trend lines |
| Conversion funnel | Horizontal bars in stage order, % between each pair, biggest drop highlighted. Not a funnel shape |
| Stage totals (25) | Horizontal bars in funnel order, reminder stages tucked under their main stage |
| Tracks (5) | Sorted horizontal bars, plus one small funnel per track on the same scale |
| Programs (39) | Table with small bars in cells, opened from its track |
| Trends | Line for current period, previous period as a gray line behind it |
| Stage mix over time | Stacked areas grouped into 5 or 6 main stages |
| Conversion by application month | Grid: months as rows, stages as columns, shades of one color; too-recent cells marked, never 0% |
| Time in stage | Median marker with typical range per stage, plus a stuck threshold line |
| Stuck applicants | Table sorted by days stuck; each row opens the person |
| Sources | Sorted bars for volume, conversion in a separate column |

Layout idea: title and "Last synced"; one filter row (date range, track, program, source, period); tabs Overview, Categories, Funnel, Trends. Rules: one filter row only, a takeaway sentence on each chart, every chart has a table view, keyboard access, dark mode, no pies, no 3D, no rainbow, no dual axes, no entrance animations, reduced motion respected.

## Conventions
`CLAUDE.md` in WT applies: types over interfaces, no `any`, named exports, no abbreviations, Lingui for user-facing strings, Linaria for front styling, icons from `twenty-ui/icon`, existing helpers such as `isDefined`, comment only non-obvious WHY. User-facing text: plain language, standard punctuation, no em dashes, no emojis. Commit messages must carry no AI attribution.

## Nx on this machine
`yarn` is not on the PATH, so Nx targets that call it fail with a clean exit code. Before any `npx nx` command run: `export PATH="/d/Coding/Flolabs/crm/.claude/worktrees/analytics-work/bin:$PATH" NX_DAEMON=false NX_TUI=false`.
