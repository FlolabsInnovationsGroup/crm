# Critique of the analytics plan

**Verdict.** The direction is right, the foundation is unverified, and the design is too heavy in three places: pre-calculated numbers, mapping tables, and the page. Run the spec's data audit before writing funnel code. Claims were checked in code unless marked. No production data was seen.

## A. Are we building what was intended?

**Missed or wrong**
1. Phase 1 data audit (spec 11) has not happened. Stage values, timeline rows for `Stage` and Applications fields are unseen. One query could invalidate the funnel.
2. `needs.md` marks reports (R11 to R13) and retention (R32) as Should. Spec sections 1 and 9 require them.
3. The status filter (spec 5A) is missing from the proposed filter rows. Spec 1 says "pipeline"; nobody has asked if there are several.
4. "Inactive contacts" (spec 1) is undefined. Define once: stuck = tracked and past its stage limit; inactive = imported and unmoved since tracking began.
5. Spec 6 names the Overview figures. `needs.md` leads with people signed; `presentation.md` with past-limit people, which needs limits nobody has set. Build the spec's figures; add signed once confirmed.
6. Spec formulas count applications; `Stage` is on Person. That needs team sign-off.

**Corrections**
- `packages/twenty-front/src/modules/analytics/` already exists (imported at `packages/twenty-front/src/modules/app/components/RootAppProviders.tsx:4`). The brief and `frontend.md` collide. Use `modules/crm-analytics/`. Server `modules/analytics` is free.
- Six existing files change, not five: the brief omits `packages/twenty-server/src/database/commands/database-command.module.ts`.
- `needs.md` question 3 filters on `name`, a column that does not exist (`packages/twenty-server/src/modules/timeline/standard-objects/timeline-activity.workspace-entity.ts:19-53`). Corrected in F.
- "The page reads pre-calculated numbers" cannot serve four free filters without a cube. Compute per request.

**Nobody asked for:** hollow-track bars, range plots, limit ticks, scale toggle, a takeaway on every chart, chart/table toggles, sparklines, listener fallback, `schema_version`, and CRM-list drill-downs (a furthest-stage count cannot be a CRM filter, so the list would contradict the number).

## B. Over-engineering audit

| Component | Verdict | Evidence and simpler alternative |
|---|---|---|
| Current-state table | CUT | Spec 4 calls these "logical datasets". Read `person` directly: live, no drift, about 43,000 rows (speed not measured). Same for Applications. This answers the duplicate-storage note. |
| Timeline read directly, no copy | Rejected | Only foreign-key indexes (`packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/index/compute-timeline-activity-standard-flat-index-metadata.util.ts:19-155`), so every funnel view scans an unknown-size table. Deleted people are destroyed after 14 days by default (`packages/twenty-server/src/engine/core-modules/workspace/workspace.entity.ts:156-157`), cascading to their rows. An upstream shape change would alter all history. |
| Stage transitions | KEEP, thin | Six columns: timeline row ID (primary key), person, from, to, happened at, source updated at. One `INSERT ... SELECT ... ON CONFLICT`. No paging, no rows in Node, no cursor store. Spec's validation, deduplication and retry layers disappear. A few MB a year (estimate). |
| One-minute sync | SIMPLIFY | 15 minutes. Rows stay mutable for 10 minutes anyway (`packages/twenty-server/src/modules/timeline/repositories/timeline-activity.repository.ts:357`), current counts are live, recruiters act daily. 96 scans a day, not 1,440. |
| Daily snapshots | KEEP, narrow | Totals could be rebuilt from transitions, but not if timeline jobs were lost (`retryLimit: 1`, `packages/twenty-server/src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts:138`), nor by position, since positions are overwritten (`packages/twenty-server/src/modules/public-form/services/public-form.service.ts:94-97`). The day-one baseline is irreplaceable and costs one query. Long format: date, dimension, key, stage, count. No cross product. |
| Mapping tables | CUT | One constant file: stage order and kind, position to track, aliases, limits, timezone. Changes a few times a year; deploy is 15 minutes plus approval (`FLOLABS.md:301-308`). Raw values stay stored, so remapping rewrites nothing. That answers "why normalize". Mapping UI: LATER. |
| Reports | SIMPLIFY | The daily job builds any missing finished week or month through the metrics service and stores JSON in one table. The page renders them with the same components. Catch-up gives recovery. This is the user's own "store results" suggestion. |
| n8n delivery | LATER | Spec 8 lists n8n only as a scheduling option. It needs another server, an endpoint and a credential. |
| Tabs, views | KEEP four tabs (spec 6); SIMPLIFY views, 13 to 8 | Overview: figures, stage totals, stuck list. Funnel: ledger with bars, % to next, lost, in window, median days. Categories: track and program table with a source switch. Trends: one line chart with metric selector and gray previous period, cohort table, movement table. Still a strong visual page (decision 4). Cut stacked areas, small multiples, the shaded grid. |
| 60-second polling | CUT | It reruns `person` scans for nothing. |
| Off switch | SIMPLIFY | One `UserVarsService` key, checked at job and resolver start. Flip by SQL. |
| Query time limits | KEEP | Five lines (`packages/twenty-server/src/engine/core-modules/search/services/search.service.ts:407-410`). |
| Role guard | KEEP, one line | `SettingsPermissionGuard` with an existing flag (`packages/twenty-server/src/engine/core-modules/record-export/record-export.resolver.ts:33`). Needed because the system context bypasses permissions. |
| Sync log | KEEP | Spec 4. One table, trimmed at 90 days by the daily job. |
| Retention jobs | CUT | One written paragraph meets spec 9. |
| Monitoring component | CUT | Stale banner plus `@SentryCronMonitor` (`packages/twenty-server/src/engine/trash-cleanup/crons/trash-cleanup.cron.job.ts:35`). Sentry in production not verified. |
| Schema versioning, advisory lock | CUT | `CREATE TABLE IF NOT EXISTS` at job start. One worker, concurrency 1. |

Result: four tables, two jobs (sync; daily reconcile, snapshot, trim, reports). Polling beats a listener because it also captures history already in the timeline since go-live.

## C. Risks to the CRM

**Real**
- **Boot failure.** `ModulesModule` loads in server, worker and GraphQL schema. A bad provider or duplicate GraphQL type stops the CRM. Prefix types `Analytics`, boot-test before deploy; `deploy.sh` rollback is the backstop.
- **Queue blocking.** `cronQueue` runs concurrency 1 (`packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts:67-75`) with at least five messaging crons. Cron only enqueues; work runs on `workspaceQueue`, as trash cleanup does (`packages/twenty-server/src/engine/trash-cleanup/jobs/trash-cleanup.job.ts:14`).
- **Timeline scan.** Measure table size first. Filter on `updatedAt` before JSON. If slow, go hourly.
- **Upgrade conflicts.** Six edited files, cherry-pick flow (`FLOLABS.md:338-342`), chart internals, timeline JSON shape. Use one chart wrapper, one facade, a fixture test on diff shape, one commit per edit.

**Minor:** page queries on 8 GB. Few users, time limits, no polling. Production Postgres tuning not verified.

**Theoretical:** disk use; a leftover cron in Redis (ticks are ignored); `database:reset` dropping the schema (dev only); accidental CRM writes (facade is SELECT only).

## D. Trust in the numbers

| Case | The tool must |
|---|---|
| Merged rows | Upsert by row ID, because rows change in place. Ignore rows where before equals after. A to B to C reads A to C; accept it, this is likely a correction. |
| HubSpot imports | Set a tracking start after the last import write and ignore earlier rows, or the import may read as a false spike (how it wrote is not verified). Imported people count in current totals only, never in funnel cohorts. Never use imported `createdAt`. Durations read "at least N days", excluded from medians. Print the start date on history views. |
| Skipped stages | Count earlier main stages as reached only when an observed post-start move shows a later stage (spec 10). No duration for skipped stages. |
| Forms resetting stage | Three published forms set `INTERESTED` unconditionally (`packages/twenty-utils/flolabs/forms/general-masterclass.json:555`, `meeting-recordings.json:384`, `websites-presentations.json:943`). Funnel uses furthest stage. Stage totals and the stuck clock still reset; recruiting must answer. |
| Several positions | Count once per position, distinct totals, never sum, show "n in several". Label that progress credits all current positions. |
| Deleted, restored | Counts and funnel filter `deletedAt IS NULL`, matching CRM lists. Transitions stay, so restore needs no fake move. Record merges not verified. |
| Stage values change | Store raw text, aliases in the constant, unknown values in a visible "Unmapped" row. Reconcile must compare after aliasing, or a rename creates thousands of false transitions. Old-value handling on rename not verified. |
| Lost timeline rows | Daily reconcile compares `person.stage` with the last transition, inserts a flagged row, excludes it from durations, logs the count. |
| Re-applicants | One run per person in v1. Furthest stage carries over; say so. |
| Timezones | Store UTC. One constant zone and one SQL helper for all bucketing. Snapshots and report periods use local dates. |

## E. Smallest version meeting the Musts

**v1**
1. Data audit and mapping constant.
2. Server `modules/analytics`: facade; four tables; two jobs; one metrics service, computed per request, shared by page and reports; one resolver per tab; guard, time limits, off switch.
3. Front `modules/crm-analytics`: four tabs, eight views, six single-select filters, sync line with stale warning, reports list and viewer; empty, unmapped and too-recent states.
4. Proof: hand-calculated sample matches (spec 11), replay adds no rows, stored totals match CRM, retention paragraph.

**Later:** report delivery, mapping UI, HubSpot backfill, cohort heatmap, per-program funnels, range plots, URL-held and multi-select filters, CRM-list drill-downs, daily conversion, repeat application runs.

## F. Questions

**Before funnel code (user, read-only on production):**
```sql
SELECT stage, count(*) FROM workspace_<id>.person GROUP BY 1;
SELECT "happensAt", "updatedAt", properties->'diff'->'stage' FROM workspace_<id>."timelineActivity"
WHERE "targetPersonId" IS NOT NULL AND properties->'diff' ? 'stage' ORDER BY "createdAt" DESC LIMIT 20;
SELECT count(*) FROM workspace_<id>."timelineActivity";
```
Also the Applications field list: does it link to Person, and hold a stage or dates?

**During build (constants default until answered):**
1. Stage list: order; main, reminder or exit; entry and success stages.
2. Should follow-up forms move people back to `INTERESTED`?
3. Assign 39 positions to 5 tracks.
4. Timezone, drop-off window, stuck days per stage.
5. Sign-off: funnel counts people. One pipeline only?
6. One hand-counted sample period.
7. Who may view? Is a report page enough for v1?
8. Is HubSpot stage history still readable (not verified)? It could give a real funnel at launch.
