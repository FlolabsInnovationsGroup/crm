# CRM Analytics build contract

Single source of truth for the backend, UI and integration workflows. Paths start at the worktree root. Line numbers were read on commit `ef30813b`. No production data was seen. Nothing here was run, so every behaviour is "read in code, not tested" unless section 9 says how it gets tested.

Deviations from `research/critique.md`, each with its reason:
- UI module is `crm-analytics` (critic's own correction): `packages/twenty-front/src/modules/analytics/` already holds `TrackPageViewEffect` and `useEventTracker`.
- `stage_transition` has 8 columns, not 6: `workspace_id` because local data has several workspaces, `origin` because the critic's reconcile rule needs a flagged row.
- Jobs use their own one-connection data source: both pools have a 10 s client-side `query_timeout` (`packages/twenty-server/src/engine/twenty-orm/datasource/workspace-data-source.service.ts:151`, `packages/twenty-server/src/database/typeorm/core/core.datasource.ts:81`), and a full timeline scan may exceed it.
- `AppPath.ts` is not edited: a local path constant works (`WorkspaceRouteObject.path` is a plain string), which removes a `twenty-shared` edit and rebuild. Five existing files change, not six.
- Tracking start is a key-value setting with a constant default: production's date depends on the audit, and the local test needs an earlier one.
- Reports are a fifth tab rather than a route: no extra existing-file edit.

## 1. Scope

**v1**
1. Server module: facade, four tables, two scheduled jobs, one metrics service used by page and reports, one resolver, role guard, time limits, off switch.
2. Page at `/analytics`: tabs Overview, Funnel, Categories, Trends, Reports. Eight views: figures, stage totals, stuck list, stage ledger, category table, trend line, cohort table, movement table. Six single-select filters. Sync line with stale warning. Empty, unmapped, too-recent and no-field states.
3. Weekly and monthly frozen reports, shown on the page.
4. Proof: hand-calculated sample matches, replay adds no rows, stored totals match the CRM, written retention paragraph (section 3).

**Later:** report delivery (email, n8n), mapping UI, HubSpot backfill, cohort shading, per-program funnels, range plots, limit ticks, hollow bar tracks, scale toggle, sparklines, stacked areas, URL-held and multi-select filters, CRM-list drill-downs, daily conversion, repeat application runs, polling, listener fallback, schema versioning, current-state and metric-summary tables, separate monthly layout.

**Open questions and defaults.** "Confirm" means the user or recruiting must confirm later. All values live in `constants/crm-analytics-config.constant.ts` unless noted; while `isProvisional` is true the page shows one banner saying definitions are provisional.

| # | Question | Default used | Confirm |
|---|---|---|---|
| 1 | Stage values, order, kind | Table below, from `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const.ts:9`. Raw values are guesses except `INTERESTED`. Anything else shows as Unmapped | Recruiting |
| 2 | Entry stage | `NEW` (rank 0) | Recruiting |
| 3 | Success stage | `SIGNED` (raw `SIGNED_PAID`, `SIGNED_NON_PAID`). `showSignedFigure: false` | Recruiting |
| 4 | Follow-up forms set `INTERESTED` | Kind `OTHER`: no funnel step, furthest stage unaffected, counted active, stage clock resets | Recruiting |
| 5 | Position to track | Table below | Recruiting |
| 6 | Reporting time zone | `UTC` | Recruiting |
| 7 | Step window, overall window | 14 days per step, 90 days overall | Recruiting |
| 8 | Stuck limit per stage | 14 days for every active main stage | Recruiting |
| 9 | Minimum sample, significant change | 30 people; 20% change with both values at or above minimum | Recruiting |
| 10 | Tracking start | `2026-10-27T00:00:00.000Z`, the day after the import date (`FLOLABS.md:31, 33`). Key `CRM_ANALYTICS_TRACKING_START_AT` overrides it | User, after audit |
| 11 | Unit | People for funnel and categories, applications for volume. Spec formulas say applications; `Stage` is on Person | Team |
| 12 | One pipeline only | Yes | Team |
| 13 | Who may view | Roles with `EXPORT_CSV` (admin passes through `canAccessAllTools`, `packages/twenty-server/src/engine/metadata-modules/permissions/utils/has-role-wide-access-to-permission-flag.util.ts:14-17`). The flag's label is overloaded | User |
| 14 | Non-applicants | People with no stage are not in the pipeline. Stage default on new people not verified | Recruiting |
| 15 | Applications object | Singular name `application`, total count only because its date field is unknown | User |
| 16 | Application forms | Form named `Internship Application` | User |
| 17 | Retention | Section 3 paragraph | User |

Default stages (`rank` null means no funnel step):

| Raw value | stageKey | kind | rank |
|---|---|---|---|
| NEW | NEW | MAIN | 0 |
| CONTACTED | CONTACTED | MAIN | 1 |
| BEFORE_MEETING | BEFORE_MEETING | MAIN | 2 |
| SATURDAY_MEETING | SATURDAY_MEETING | MAIN | 3 |
| ATTENDED | ATTENDED | MAIN | 4 |
| SECOND_MEETING | SECOND_MEETING | MAIN | 5 |
| AGREEMENT_SENT | AGREEMENT_SENT | MAIN | 6 |
| SIGNED_PAID, SIGNED_NON_PAID | SIGNED | MAIN | 7 |
| NO_ANSWER, NOT_INTERESTED, REJECTED_BY_US | same as raw | EXIT | null |
| INTERESTED | INTERESTED | OTHER | null |

A reminder is one more raw value mapped to its parent's stageKey with `isReminder: true`. An alias (renamed value) is the same. Several raw values on one stageKey is how reminders, aliases and Signed Paid or Non paid all work.

Default tracks, using raw `positionsAppliedFor` values from `packages/twenty-utils/flolabs/forms/internship-application.json:155-312`, suffix `_INTERN` omitted here where present:
- `AI_SOFTWARE` Artificial Intelligence & Software Engineering: AI_AGI, COMPUTER_VISION_ENGINEERING, FRONT_END_DEVELOPER, MACHINE_LEARNING_ENGINEERING, PROMPT_ENGINEER, QUALITY_ASSURANCE, RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS, SOFTWARE_DEVELOPMENT.
- `ROBOTICS` Robotics & Intelligent Systems: CONTROL_SYSTEMS_ENGINEERING, EMBEDDED_SYSTEMS, HUMAN_ROBOT_INTERACTION, MECHATRONICS_ENGINEERING, PRODUCT_DEVELOPMENT_INTERN_AI_AND_ROBOTICS, ROBOTICS_ENGINEERING, SENSOR_INTEGRATION.
- `BUSINESS` Business Management, Growth & Entrepreneurship: BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS, DIGITAL_MARKETING, FINANCE, GTM_ENGINEER_GO_TO_MARKET_ENGINEER, GTM_INFLUENCER, HOSPITALITY_AND_TOURISM, MARKETING, OPERATIONS, PROJECT_MANAGEMENT, SEO_SPECIALIST, SOCIAL_MEDIA.
- `DESIGN_COMMUNICATION` Design & Technical Communication: CONTENT_MARKETING, JOURNALISM_AND_PR, PODCAST_PRODUCTION_INTERN_POSITION, TECHNICAL_WRITING, UI_UX_DESIGN.
- `EMERGING_SCIENCES` Emerging Sciences & Technology: ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH, BIOMEDICAL_ENGINEERING, EDTECH_AND_INNOVATION, ETHICAL_AND_LEGAL_RESEARCH, NEUROSCIENCE, QUANTUM_ENGINEER, SPACE_SCIENCE, SPORT_SCIENCE.

Unknown positions go to track key `UNMAPPED`, unknown sources to source key `UNMAPPED`.

## 2. File ownership

**BACKEND** (new, under `packages/twenty-server/src/modules/analytics/`; specs in `__tests__/` beside each)
```
crm-analytics.module.ts
constants/crm-analytics-config.constant.ts      stages, tracks, windows, limits, zone, form names, stale minutes
constants/crm-analytics-ddl.constant.ts         CRM_ANALYTICS_DDL_STATEMENTS
constants/crm-analytics-cron-patterns.constant.ts
types/analytics-api.type.ts                     section 7 verbatim
types/crm-analytics-crm-state.type.ts
dtos/crm-analytics-payload.dto.ts
dtos/crm-analytics-filter.input.ts
facade/crm-analytics-facade.service.ts          the only code touching CRM tables
services/crm-analytics-database.service.ts      page transaction, job connection, ensure storage
services/crm-analytics-settings.service.ts      off switch and tracking start
services/crm-analytics-sync.service.ts          timeline re-read, reconcile
services/crm-analytics-snapshot.service.ts
services/crm-analytics-metrics.service.ts       all metric SQL
services/crm-analytics-report.service.ts
services/crm-analytics-meta.service.ts
utils/build-crm-analytics-cte.util.ts
utils/build-crm-analytics-local-date-sql.util.ts
utils/parse-crm-analytics-filter.util.ts
utils/compute-crm-analytics-report-periods.util.ts
utils/compute-crm-analytics-significant-changes.util.ts
resolvers/crm-analytics.resolver.ts
crons/commands/crm-analytics.cron.command.ts    cron:crm-analytics, registers both crons
crons/commands/crm-analytics-run.command.ts     crm-analytics:run --workspace-id <id> --job sync|daily
crons/jobs/crm-analytics-sync.cron.job.ts
crons/jobs/crm-analytics-daily.cron.job.ts
jobs/crm-analytics-workspace-sync.job.ts
jobs/crm-analytics-workspace-daily.job.ts
```
Module: `imports: [PermissionsModule, UserVarsModule, WorkspaceManyOrAllFlatEntityMapsCacheModule, TypeOrmModule.forFeature([WorkspaceEntity])]`; all classes above in `providers`; `exports: [CrmAnalyticsCronCommand]`. All Nest and GraphQL names start `CrmAnalytics`, because GraphQL type `Analytics` and `UsageAnalytics` already exist (`packages/twenty-server/src/engine/core-modules/event-logs/emit/dtos/analytics.dto.ts:4`).

**UI** (new, under `packages/twenty-front/src/`; tests in `__tests__/` beside each)
```
pages/analytics/AnalyticsPage.tsx
modules/crm-analytics/constants/   CrmAnalyticsPath.ts  CrmAnalyticsTabListInstanceId.ts  CrmAnalyticsDefaultFilter.ts  CrmAnalyticsChartInstanceId.ts
modules/crm-analytics/graphql/     getCrmAnalyticsMeta.ts  getCrmAnalyticsOverview.ts  getCrmAnalyticsFunnel.ts  getCrmAnalyticsCategories.ts  getCrmAnalyticsTrends.ts  getCrmAnalyticsReports.ts  getCrmAnalyticsReport.ts
modules/crm-analytics/hooks/       useCrmAnalyticsMeta.ts  useCrmAnalyticsQuery.ts
modules/crm-analytics/types/       AnalyticsApi.ts (section 7 verbatim)
modules/crm-analytics/utils/       formatAnalyticsRate.ts  buildOverviewTakeaway.ts  buildFunnelTakeaway.ts  buildCategoriesTakeaway.ts  buildTrendsTakeaway.ts  buildTrendChartSeries.ts  isCrmAnalyticsForbiddenError.ts
modules/crm-analytics/components/  listed in section 8
```

**INTEGRATION** (five existing files, smallest edits; one agent writes, a different agent reviews; one commit per file)

| File | Add |
|---|---|
| `packages/twenty-server/src/modules/modules.module.ts` | after line 24: `import { CrmAnalyticsModule } from 'src/modules/analytics/crm-analytics.module';` after line 39: `CrmAnalyticsModule,` |
| `packages/twenty-server/src/database/commands/database-command.module.ts` | after line 60: the same import. After line 75: `CrmAnalyticsModule,` |
| `packages/twenty-server/src/database/commands/cron-register-all.command.ts` | after line 24: `import { CrmAnalyticsCronCommand } from 'src/modules/analytics/crons/commands/crm-analytics.cron.command';` after line 63: `private readonly crmAnalyticsCronCommand: CrmAnalyticsCronCommand,` after line 151: `{ name: 'CrmAnalytics', command: this.crmAnalyticsCronCommand },` in the file's multi-line form |
| `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx` | after line 9: `import { CRM_ANALYTICS_PATH } from '@/crm-analytics/constants/CrmAnalyticsPath';` after line 46: lazy `AnalyticsPage`, copying lines 42-46 with `~/pages/analytics/AnalyticsPage`. After line 148: route object copying lines 141-148 with `path: CRM_ANALYTICS_PATH`, no `handle` |
| `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx` | after line 3: `import { NavigationDrawerAnalyticsItem } from '@/crm-analytics/components/NavigationDrawerAnalyticsItem';` after line 39: `<NavigationDrawerAnalyticsItem />` |

`CRM_ANALYTICS_PATH = '/analytics'`; no existing `AppPath` uses it. No GraphQL codegen, no `twenty-shared` edit, no catalog commit, no upgrade command.

## 3. Storage

Schema `analytics` in the same database. Raw SQL with qualified names, because a TypeORM entity under `src/modules` is not loaded (`packages/twenty-server/src/database/typeorm/core/core.datasource.ts:45-54`).

```sql
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.stage_transition (
  id uuid PRIMARY KEY,               -- timelineActivity.id; gen_random_uuid() for reconcile rows
  workspace_id uuid NOT NULL,
  person_id uuid NOT NULL,
  from_stage text,                   -- raw value, never mapped
  to_stage text,
  happened_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  origin text NOT NULL CHECK (origin IN ('timeline', 'reconcile'))
);
CREATE INDEX IF NOT EXISTS stage_transition_person_idx
  ON analytics.stage_transition (workspace_id, person_id, happened_at);
CREATE INDEX IF NOT EXISTS stage_transition_updated_idx
  ON analytics.stage_transition (workspace_id, source_updated_at);

CREATE TABLE IF NOT EXISTS analytics.daily_snapshot (
  workspace_id uuid NOT NULL,
  snapshot_date date NOT NULL,       -- local date in the reporting zone
  dimension text NOT NULL CHECK (dimension IN ('all', 'position', 'track', 'source')),
  dimension_key text NOT NULL,       -- '' for all and for no source
  stage text NOT NULL,               -- raw value, '' for no stage
  person_count integer NOT NULL,
  PRIMARY KEY (workspace_id, snapshot_date, dimension, dimension_key, stage)
);

CREATE TABLE IF NOT EXISTS analytics.report (
  workspace_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('WEEK', 'MONTH')),
  period_start date NOT NULL,
  period_end date NOT NULL,          -- exclusive
  generated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,            -- AnalyticsReport, counts only, no names
  PRIMARY KEY (workspace_id, period_type, period_start)
);

CREATE TABLE IF NOT EXISTS analytics.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_name text NOT NULL CHECK (job_name IN ('sync', 'daily')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'ok', 'failed', 'skipped')),
  processed_count integer NOT NULL DEFAULT 0,
  restored_count integer NOT NULL DEFAULT 0,
  details jsonb,                     -- per-step outcome and consistency check result
  error_message text                 -- first 500 characters
);
CREATE INDEX IF NOT EXISTS sync_log_workspace_started_idx
  ON analytics.sync_log (workspace_id, started_at DESC);
```

| Situation | Behaviour |
|---|---|
| Created when | `ensureStorage()` runs the statements in order at the start of every worker job, on the job connection. Same role already creates workspace schemas. No advisory lock: one worker, concurrency 1 |
| Fresh database | First sync creates everything, reads timeline since tracking start, then enqueues the daily job if no `daily` log row exists, so the day-one baseline is taken at once |
| Before any job ran | Reads check `to_regclass('analytics.sync_log')`; page state is `NEVER_SYNCED`. Page transactions are read-only and never create |
| Repeated run | All statements are no-ops |
| `database:reset` | `packages/twenty-server/src/database/scripts/truncate-db.ts:9-33` drops `analytics` too. Next job recreates it. History is lost (dev only) |
| Evolving | Append `ALTER TABLE analytics.x ADD COLUMN IF NOT EXISTS ...` to the array. Never edit an old entry. Destructive changes need the user's approval |
| Removal | `DROP SCHEMA analytics CASCADE`. No CRM table is touched. A leftover scheduler in Redis ticks harmlessly (`packages/twenty-server/src/engine/core-modules/message-queue/message-queue.explorer.ts`, per `research/backend.md`, not re-read) until removed by hand |
| Backup | Included in `pg_dumpall` (`packages/twenty-utils/flolabs/deploy.sh:34`) |

**Retention paragraph (spec 9):** stage transitions, snapshots and reports are kept without limit and hold only UUIDs, stage, position and source values, and counts. No names, emails or form answers are stored. Sync logs are trimmed at 90 days by the daily job. When a person is destroyed in the CRM their transitions remain as a bare UUID; on request, `DELETE FROM analytics.stage_transition WHERE person_id = $1` removes them. Backups follow the CRM's own schedule.

## 4. Facade

`CrmAnalyticsFacadeService` has read methods only. No other analytics file may name a CRM table, call `getWorkspaceSchemaName` or read metadata; a spec enforces it.

```ts
export type CrmAnalyticsFieldStatus = 'OK' | 'MISSING' | 'WRONG_TYPE';
export type CrmAnalyticsFieldOption = { value: string; label: string };

export type CrmAnalyticsCrmState = {
  workspaceId: string;
  stage: { status: CrmAnalyticsFieldStatus; isAuditLogged: boolean; options: CrmAnalyticsFieldOption[] };
  positionsAppliedFor: { status: CrmAnalyticsFieldStatus; options: CrmAnalyticsFieldOption[] };
  applicantSource: { status: CrmAnalyticsFieldStatus; options: CrmAnalyticsFieldOption[] };
  hasFormSubmissionObject: boolean; // formSubmission and crmForm both exist
  hasApplicationObject: boolean;
};

export type CrmAnalyticsSqlRunner = (sql: string, parameters: unknown[]) => Promise<Record<string, unknown>[]>;

export class CrmAnalyticsFacadeService {
  listActiveWorkspaceIds(): Promise<string[]>;
  getCrmState(workspaceId: string): Promise<CrmAnalyticsCrmState>; // never throws for absent fields or objects
  buildPersonRelationSql(state: CrmAnalyticsCrmState): string;
  buildStageChangeRelationSql(args: { state: CrmAnalyticsCrmState; updatedSinceParameter: string; happenedSinceParameter: string }): string;
  buildApplicationSubmissionRelationSql(state: CrmAnalyticsCrmState): string | null;
  countImportedApplications(args: { state: CrmAnalyticsCrmState; run: CrmAnalyticsSqlRunner }): Promise<number | null>;
  getPersonDisplayNames(args: { state: CrmAnalyticsCrmState; personIds: string[]; run: CrmAnalyticsSqlRunner }): Promise<Map<string, string>>; // max 100, read live, never stored
}
```
The `build*` methods return read-only SELECT text embedded by the metrics and sync services. That keeps `INSERT ... SELECT` with no rows in Node, and keeps every CRM table name in this one file.

Relations returned:
```sql
-- buildPersonRelationSql. A missing or wrong-typed field becomes NULL::text or '{}'::text[]
SELECT p.id AS person_id, p."createdAt" AS created_at, p."updatedAt" AS updated_at,
       p.stage::text AS raw_stage, p."positionsAppliedFor"::text[] AS positions, p."applicantSource"::text AS source
FROM "workspace_x"."person" p WHERE p."deletedAt" IS NULL

-- buildStageChangeRelationSql. linkedRecordId IS NULL excludes linked rows such as an opportunity's own stage
SELECT t.id, t."targetPersonId" AS person_id,
       t.properties->'diff'->'stage'->>'before' AS from_stage,
       t.properties->'diff'->'stage'->>'after' AS to_stage,
       t."happensAt" AS happened_at, t."updatedAt" AS source_updated_at
FROM "workspace_x"."timelineActivity" t
WHERE t."updatedAt" >= $2 AND t."happensAt" >= $3
  AND t."targetPersonId" IS NOT NULL AND t."linkedRecordId" IS NULL
  AND t.properties->'diff' ? 'stage'

-- buildApplicationSubmissionRelationSql. null when the objects are absent
SELECT s.id, s."personId" AS person_id, s."submittedAt" AS submitted_at
FROM "workspace_x"."_formSubmission" s JOIN "workspace_x"."_crmForm" f ON f.id = s."formId"
WHERE s."deletedAt" IS NULL AND f.name IN ('Internship Application')
```

Existing APIs used:
| Need | API | Reference |
|---|---|---|
| Field and object lookup | `WorkspaceManyOrAllFlatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps({ workspaceId, flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'] })`, `getObjectMetadataIdByName`, `findFlatEntityByIdInFlatEntityMaps`, `buildFieldMapsFromFlatObjectMetadata(...).fieldIdByName` | `packages/twenty-server/src/modules/dashboard/chart-data/services/line-chart-data.service.ts:60-80`, `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util.ts:22` |
| Audit flag, options | `flatField.isAuditLogged`, `flatField.options` | `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type.ts:27` |
| Table and schema names | `computeObjectTargetTable`, `getWorkspaceSchemaName` | `packages/twenty-server/src/engine/utils/compute-object-target-table.util.ts:6`, `packages/twenty-server/src/engine/workspace-datasource/utils/get-workspace-schema-name.util.ts:3` |
| Quoting | `escapeIdentifier`, `escapeLiteral` | `packages/twenty-server/src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util.ts:11, 97` |
| Active workspaces | `workspaceRepository.find({ where: { activationStatus: WorkspaceActivationStatus.ACTIVE }, select: ['id'], order: { id: 'ASC' } })` | `packages/twenty-server/src/engine/trash-cleanup/crons/trash-cleanup.cron.job.ts:75-81` |
| Column shapes | SELECT is an enum, MULTI_SELECT an enum array; `nameFirstName`, `nameLastName` | `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/field-metadata-type-to-column-type.util.ts:32-34`, `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/generate-column-definitions.util.ts:172`, `packages/twenty-server/src/engine/workspace-manager/dev-seeder/data/constants/person-data-seeds.constant.ts:32` |

Accepted types: stage and source `SELECT` or `TEXT`; positions `MULTI_SELECT`. Otherwise `WRONG_TYPE`, treated as missing.

**Database service**
```ts
runPageTransaction<TResult>(workspaceId: string, work: (run: CrmAnalyticsSqlRunner) => Promise<TResult>): Promise<TResult>;
runJob<TResult>(work: (run: CrmAnalyticsSqlRunner) => Promise<TResult>): Promise<TResult>;
ensureStorage(run: CrmAnalyticsSqlRunner): Promise<void>;
```
- Page: `workspaceOrmManager.executeInWorkspaceContext(() => runInWorkspaceTransaction(...), buildSystemAuthContext(workspaceId))` (`packages/twenty-server/src/engine/twenty-orm/workspace-orm.manager.ts:115-134`, `packages/twenty-server/src/engine/twenty-orm/utils/build-system-auth-context.util.ts:7`). First `SET TRANSACTION READ ONLY`, then `SELECT set_config('statement_timeout', '8000', true)` (`packages/twenty-server/src/engine/core-modules/search/services/search.service.ts:405-410`). 8 s sits under the 10 s client limit. The system context bypasses permissions, which is why the resolver guard matters.
- Job: `new DataSource({ ...coreDataSource.options, entities: [], migrations: [], subscribers: [], poolSize: 1, extra: { ...extra, query_timeout: undefined, statement_timeout: 120000 } })`, destroyed in `finally`, copying `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/deferred-workspace-migration-action-runner.service.ts:341-366`. It isolates job load from the CRM pools.

**Settings service** over `UserVarsService` (workspace-level, `packages/twenty-server/src/engine/core-modules/user/user-vars/services/user-vars.service.ts:16-35`): `isDisabled(workspaceId)` reads `CRM_ANALYTICS_DISABLED`; `getTrackingStart(workspaceId)` reads `CRM_ANALYTICS_TRACKING_START_AT` or the constant.

## 5. Jobs

| | Sync | Daily |
|---|---|---|
| Cron job class, queue | `CrmAnalyticsSyncCronJob`, `cronQueue`; only enqueues | `CrmAnalyticsDailyCronJob`, `cronQueue`; only enqueues |
| Pattern | `7,22,37,52 * * * *` (every 15 minutes, off the hour marks) | `30 2 * * *`. `QueueCronJobOptions` has no time zone field; container zone assumed UTC, not verified |
| Work job, queue | `CrmAnalyticsWorkspaceSyncJob`, `workspaceQueue`, data `{ workspaceId }` | `CrmAnalyticsWorkspaceDailyJob`, same queue |
| Batch size | None: one statement, no rows in Node | Same per step; reports capped at 8 per run |
| Cursor | None stored. Lower bound is `max(source_updated_at) - 30 minutes`, or tracking start when empty | Lower bound is tracking start |
| Time limit | 120 s per statement | 120 s per statement |

Both use `@Processor`, `@Process(Class.name)`, `@SentryCronMonitor(name, pattern)` as `packages/twenty-server/src/engine/trash-cleanup/crons/trash-cleanup.cron.job.ts:21-36` and `packages/twenty-server/src/engine/trash-cleanup/jobs/trash-cleanup.job.ts:13-21`. `workspaceQueue` runs concurrency 1 (`packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts:148-156`), so a slow job delays that queue; if sync exceeds 30 s in production, change the pattern to hourly.

Sync steps: off switch, `ensureStorage`, `getCrmState`, stage status check, then:
```sql
INSERT INTO analytics.stage_transition (id, workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
SELECT c.id, $1::uuid, c.person_id, c.from_stage, c.to_stage, c.happened_at, c.source_updated_at, 'timeline'
FROM (<facade.buildStageChangeRelationSql>) c
ON CONFLICT (id) DO UPDATE SET
  from_stage = EXCLUDED.from_stage, to_stage = EXCLUDED.to_stage,
  happened_at = EXCLUDED.happened_at, source_updated_at = EXCLUDED.source_updated_at
WHERE analytics.stage_transition.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at;
```
Daily steps, each in its own try/catch recorded in `details`:
1. Full re-read: the statement above from tracking start.
2. Reconcile, skipping people updated in the last 30 minutes because their timeline job may still be pending. `stage_map` and `crm_person` are CTEs placed in front of the INSERT:
```sql
INSERT INTO analytics.stage_transition (id, workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
SELECT gen_random_uuid(), $1::uuid, p.person_id, l.to_stage, p.raw_stage, now(), now(), 'reconcile'
FROM crm_person p
JOIN LATERAL (SELECT t.to_stage FROM analytics.stage_transition t
  WHERE t.workspace_id = $1 AND t.person_id = p.person_id
  ORDER BY t.happened_at DESC, t.source_updated_at DESC LIMIT 1) l ON true
LEFT JOIN stage_map a ON a.raw_stage = l.to_stage
LEFT JOIN stage_map b ON b.raw_stage = p.raw_stage
WHERE p.updated_at < now() - interval '30 minutes'
  AND COALESCE(a.stage_key, l.to_stage) IS DISTINCT FROM COALESCE(b.stage_key, p.raw_stage);
```
Comparing after mapping means a renamed value with an alias creates no false moves. Limit: a person with no transition at all has nothing to compare, because the current-state table was cut. The count goes to `restored_count`.
3. Snapshot with `ON CONFLICT DO NOTHING`, so the first run of a local date stands and a rerun adds nothing. `track` rows use the mapping of that day; a later mapping change does not rewrite them.
4. Consistency check: live person total equals the sum of today's `all` rows; result in `details`, and a mismatch sets status `failed`.
5. Trim `sync_log` older than 90 days.
6. Build missing finished reports, oldest first, `ON CONFLICT DO NOTHING`.

| Topic | Rule |
|---|---|
| Idempotency | Row ID primary key, conditional upsert, snapshot and report keys. Reconcile finds no mismatch on rerun |
| Merged rows | Same row ID, later `updatedAt`, so it is upserted. A to B to A becomes `from_stage = to_stage`; kept, and all reads ignore it |
| Failure | Log row set `failed` with message; job rethrows. Attempts is 1 (`packages/twenty-server/src/engine/core-modules/message-queue/drivers/bullmq.driver.ts:446`); the next tick is the retry. Reports catch up. Stale banner shows after 60 minutes without success |
| Stage field missing | Log row `skipped`, details `NO_STAGE_FIELD`, no throw |
| Off switch | SQL below. Checked at job and resolver start. Job returns with no log row |
| Manual rerun | `yarn command:prod crm-analytics:run --workspace-id <id> --job daily` enqueues the work job |

```sql
INSERT INTO core."keyValuePair" ("key", "value", "workspaceId", "type")
VALUES ('CRM_ANALYTICS_DISABLED', 'true'::jsonb, '<workspaceId>', 'USER_VARIABLE');
-- on again
DELETE FROM core."keyValuePair" WHERE "key" = 'CRM_ANALYTICS_DISABLED' AND "workspaceId" = '<workspaceId>' AND "userId" IS NULL;
```

## 6. Metrics

Computed per request by `CrmAnalyticsMetricsService`; reports call the same methods. All counts cast `::int`. Rates are fractions 0 to 1. Dates bucket through one helper, `(column AT TIME ZONE $tz)`.

**Common rules**

| Case | Rule |
|---|---|
| Mapping | `stage_map` and `position_map` are `VALUES` CTEs built from the constant at query time. Raw values stay stored, so remapping rewrites nothing |
| No-op rows | Every read has `from_stage IS DISTINCT FROM to_stage` |
| Unmapped stage | Rank null, so never a funnel step. Shown in stage totals. People whose every stage is unmapped go in `cohortExcludedUnmapped` |
| Cohort | Created on or after tracking start, inside any date filter, with at least one mapped funnel rank. Application date is `person.createdAt`. Imported people count in current totals only |
| Reached | Furthest rank over the initial stage and all transitions. A person at rank r counts as reached at every rank up to r, so forms resetting to `INTERESTED` lower nothing and skipped stages count as reached. Allowed because a cohort person's whole history, including creation, is after tracking start |
| Merged rows | A to B to C reads A to C; B counts as skipped. `happensAt` is the first change in the chain, at most 10 minutes early (`packages/twenty-server/src/modules/timeline/repositories/timeline-activity.repository.ts:357-370`) |
| Several positions | Counted once in each position and once per distinct track. Rows never sum; `distinctPeople` and `peopleInSeveral` are returned. Credit goes to all current positions, and the page says so |
| Re-applicants | One run per person; furthest stage carries over; the page says so |
| Deleted | `deletedAt IS NULL` everywhere, as in CRM lists. Transitions stay, so a restore needs no fake move. Record merges not verified |
| Too recent | Inside the window: excluded from numerator and denominator, reported as `inWindow` and `soFarRate`. Never dropped, never 0% |
| Reconcile rows | Count for reached and movement, excluded from durations and stage clock certainty |
| Date filter | Current-state views: created on or after tracking start and in range, with `importedExcludedByDate` reported. Cohort views: application date. Volume: `submittedAt`. Movement: event date |

**Base CTEs** (`build-crm-analytics-cte.util.ts`; `$1` workspace, `$2` tracking start):
```sql
crm_person AS (<facade.buildPersonRelationSql>),
scope AS (SELECT p.*, m.stage_key AS current_key, m.rank AS current_rank, m.kind AS current_kind
  FROM crm_person p LEFT JOIN stage_map m ON m.raw_stage = p.raw_stage WHERE <filters>),
transition AS (SELECT t.person_id, t.happened_at, t.origin,
    f.stage_key AS from_key, f.rank AS from_rank, x.stage_key AS to_key, x.rank AS to_rank, x.kind AS to_kind
  FROM analytics.stage_transition t
  LEFT JOIN stage_map f ON f.raw_stage = t.from_stage
  LEFT JOIN stage_map x ON x.raw_stage = t.to_stage
  WHERE t.workspace_id = $1 AND t.happened_at >= $2 AND t.from_stage IS DISTINCT FROM t.to_stage),
first_move AS (SELECT DISTINCT ON (person_id) person_id, from_rank FROM transition ORDER BY person_id, happened_at),
cohort AS (SELECT s.person_id, s.created_at,
    CASE WHEN fm.person_id IS NULL THEN s.current_rank ELSE fm.from_rank END AS initial_rank
  FROM scope s LEFT JOIN first_move fm USING (person_id)
  WHERE s.created_at >= $2 AND <date filter on s.created_at>),
arrival AS (
  SELECT person_id, initial_rank AS rank, created_at AS arrived_at FROM cohort WHERE initial_rank IS NOT NULL
  UNION ALL
  SELECT t.person_id, t.to_rank, t.happened_at FROM transition t JOIN cohort c USING (person_id) WHERE t.to_rank IS NOT NULL),
person_step AS (SELECT a.person_id, f.stage_key, f.rank, f.window_days,
    min(a.arrived_at) AS entered_at,
    min(a.arrived_at) FILTER (WHERE a.rank > f.rank) AS next_at
  FROM arrival a JOIN funnel_stage f ON a.rank >= f.rank GROUP BY 1, 2, 3, 4)
```

**Definitions**

| Metric | Definition |
|---|---|
| Total contacts | People in `scope`, including non-applicants. Unit people |
| Active people | Current kind MAIN or OTHER, not success |
| New applications | Rows from the submission relation with `submittedAt` in the date filter, or the last 7 local days when none. Previous is the equal-length span before. Unit applications. Person filters join on `person_id`. Null with `hasFormSubmissionObject` false |
| Imported applications | Total only, labeled "dates unknown". Not in trends |
| Stage totals | Current stage. Reminders and raw siblings nest under their stageKey. Top rows are MAIN, EXIT, OTHER, one per unmapped raw value, and No stage, so they sum to total contacts |
| Stage entered at | Latest transition with `to_key = current_key` and `from_key` different. Else `created_at` if created on or after tracking start. Else unknown. `isLowerBound` when the row's origin is `reconcile` |
| Inactive | Created before tracking start, active, no transition. Counted only, not listed |
| Stuck | Active, not inactive, `limitDays` set, days in stage over the limit. Sorted by days over limit, 100 rows plus total. If no stage has a limit: sorted by days in stage with a notice. A form reset restarts the clock (open question 4) |
| Signed | People with success as current stage; only when `showSignedFigure` |
| `entered(k)` | Rows of `person_step` at stage k |
| `eligible(k)` | `entered_at + window_days <= now()` |
| `reachedNext(k)` | Eligible and `next_at <= entered_at + window_days` |
| `exited(k)` | Eligible, not reachedNext, and a transition with `to_kind = 'EXIT'` at or after `entered_at` and within the window |
| `timedOut(k)` | `eligible - reachedNext - exited`. A late mover counts here for this step and still enters the next step |
| `inWindow(k)` | `entered - eligible` |
| Step conversion (5B) | `reachedNext / eligible`, null when eligible is 0. Same cohort top and bottom |
| So far | People with `next_at` not null, over `entered`. Display only |
| Drop-off (5D) | `(eligible - reachedNext) / eligible`, with exited and timed out shown apart |
| Overall conversion (5C) | Entry-rank people with `entered_at + 90 days <= now()`; numerator those arriving at success rank within 90 days. Null when no eligible or no success stage |
| Final stage row | No next stage: step columns 0 or null |
| Lowest step | Lowest step conversion with `eligible >= minimumSample`, excluding the first step only if another qualifies. Neutral wording |
| Stage duration (5E) | Per cohort person, order the created-at row and transitions, keep rows where `to_key` changes, so reminder moves stay inside a stage. A stay runs to the next kept row. `percentile_cont(0.5)` of days. Excluded: open stays, stays touching a `reconcile` row, skipped stages (they have no row). Median only, `completedStays` returned |
| Category rows | `people` and `activePeople` from `scope`. `cohortSize`, `overallRate`, `stepRates` from the funnel SQL grouped by category. Tracks through `position_map`, programs by `unnest(positions)`, source by value. People with no position or source get key `NONE` |
| Cohort table | Funnel SQL grouped by week or month of application date. `isMature` when `eligible = entered` for that cell. Not mature shows `soFarRate` muted |
| Trend line | `NEW_APPLICATIONS` by `submittedAt` bucket. `TOTAL_CONTACTS`, `ACTIVE_PEOPLE`, `STAGE_COUNT` from the last snapshot in each bucket, one dimension only. `OVERALL_CONVERSION`, `DROP_OFF` by application-date cohort, week or month only, null until mature, so the line stops and never dips to 0. `MEDIAN_DAYS` by stay end date. Default window 30 days, 12 weeks or 12 months, or the date filter, at most 60 buckets. Previous is the same count of buckets before |
| Movement | Transitions in the current period (date filter, else the period containing today): `enteredInPeriod` where `to_key` is the stage and differs from `from_key`, `leftInPeriod` the reverse. Includes imported people. `countNow` from `scope`, `countPrevious` from the snapshot at period start. Null with more than one category filter |
| Comparisons (reports) | New applications, entries per stage, overall conversion, against the previous period. `isSignificant` per open question 9 |

Weekly and monthly reports: Monday-based local weeks and calendar months, finished only, first complete period after tracking start. Same payload shape; `cohorts` filled on monthly only.

## 7. API

Decision: GraphQL through `@CoreResolver` and the core client. REST would need an `ApiPath` edit in `twenty-shared`, its own auth guard and hand-rolled loading state (`research/backend.md` section 5). Each query returns one small DTO holding JSON, so only two GraphQL types are added and a nested type cannot collide at boot.

```ts
@ObjectType('CrmAnalyticsPayload')
export class CrmAnalyticsPayloadDTO {
  @Field(() => GraphQLJSON, { nullable: true }) payload: unknown; // null when switched off
}

@InputType('CrmAnalyticsFilterInput')
export class CrmAnalyticsFilterInput {
  // nullable String fields: dateFrom, dateTo, trackKey, programKey, sourceKey, status, period
}

@UseGuards(
  AuthPrincipalGuard({
    userSession: { standard: true, impersonated: true, playground: false, workspaceAgnostic: false },
    apiKey: false, oauthClient: false, application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.EXPORT_CSV),
)
@CoreResolver(() => CrmAnalyticsPayloadDTO)
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter, PreventNestToAutoLogGraphqlErrorsFilter)
export class CrmAnalyticsResolver {}
```
References: `packages/twenty-server/src/modules/notifications-seen/resolvers/notifications-seen.resolver.ts:19-34`, `packages/twenty-server/src/engine/core-modules/record-export/record-export.resolver.ts:21-36`, `packages/twenty-server/src/engine/guards/settings-permission.guard.ts:21`, `packages/twenty-server/src/engine/core-modules/workflow/resolvers/core-workflow.resolver.ts:68-71`. `@AuthWorkspace() workspace: WorkspaceEntity` supplies the workspace.

| Query (all `@Query(() => CrmAnalyticsPayloadDTO)`) | Args | Payload |
|---|---|---|
| `getCrmAnalyticsMeta` | none | `AnalyticsMeta` |
| `getCrmAnalyticsOverview` | `filter` | `AnalyticsOverview` |
| `getCrmAnalyticsFunnel` | `filter` | `AnalyticsFunnel` |
| `getCrmAnalyticsCategories` | `filter`, `groupBy: String` | `AnalyticsCategories` |
| `getCrmAnalyticsTrends` | `filter`, `metric: String`, `stageKey: String` nullable | `AnalyticsTrends` |
| `getCrmAnalyticsReports` | none | `AnalyticsReportListItem[]` |
| `getCrmAnalyticsReport` | `periodType: String`, `periodStart: String` | `AnalyticsReport` or null |

`parse-crm-analytics-filter.util.ts` validates every string (dates `YYYY-MM-DD`, allowed literals, length at most 200) and throws `UserInputError`. All values reach SQL as parameters. Literal unions, not GraphQL enums, so no enum type is registered. One root field per request.

**Sharing types without touching a shared package:** the block below is written byte for byte to `packages/twenty-server/src/modules/analytics/types/analytics-api.type.ts` and `packages/twenty-front/src/modules/crm-analytics/types/AnalyticsApi.ts`. The file has no imports. A server spec compares the two after normalizing line endings and fails on any difference. Hand-written `gql` on the front, `useQuery<{ getCrmAnalyticsFunnel: { payload: AnalyticsFunnel | null } }>`, as `packages/twenty-front/src/modules/team-inbox/hooks/useTeamInboxThreads.ts:27-32`, always with `client: apolloCoreClient`.

```ts
export type AnalyticsPeriod = 'DAY' | 'WEEK' | 'MONTH';
export type AnalyticsStatusFilter = 'ALL' | 'ACTIVE' | 'SUCCESS' | 'EXITED' | 'UNMAPPED' | 'NO_STAGE';
export type AnalyticsPageState = 'DISABLED' | 'NO_STAGE_FIELD' | 'NEVER_SYNCED' | 'READY';
export type AnalyticsFieldStatus = 'OK' | 'MISSING' | 'WRONG_TYPE';
export type AnalyticsStageKind = 'MAIN' | 'EXIT' | 'OTHER';
export type AnalyticsCategoryGroupBy = 'TRACK_PROGRAM' | 'SOURCE';
export type AnalyticsTrendMetric = 'NEW_APPLICATIONS' | 'TOTAL_CONTACTS' | 'ACTIVE_PEOPLE' | 'STAGE_COUNT' | 'OVERALL_CONVERSION' | 'DROP_OFF' | 'MEDIAN_DAYS';
export type AnalyticsReportPeriodType = 'WEEK' | 'MONTH';

export type AnalyticsFilter = {
  dateFrom: string | null; // YYYY-MM-DD local, inclusive
  dateTo: string | null; // YYYY-MM-DD local, inclusive
  trackKey: string | null;
  programKey: string | null;
  sourceKey: string | null;
  status: AnalyticsStatusFilter;
  period: AnalyticsPeriod;
};

export type AnalyticsBase = {
  asOf: string;
  trackingStartedAt: string;
  reportingTimeZone: string;
  minimumSample: number;
};

export type AnalyticsOption = { key: string; label: string };
export type AnalyticsProgramOption = AnalyticsOption & { trackKey: string };

export type AnalyticsStageDefinition = {
  stageKey: string;
  label: string;
  kind: AnalyticsStageKind;
  rank: number | null;
  limitDays: number | null;
  windowDays: number | null;
  isSuccess: boolean;
};

export type AnalyticsSyncState = {
  lastSuccessfulSyncAt: string | null;
  lastReconciliationAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: 'OK' | 'FAILED' | 'SKIPPED' | null;
  isStale: boolean;
  restoredInLastReconciliation: number | null;
};

export type AnalyticsMeta = AnalyticsBase & {
  state: AnalyticsPageState;
  isProvisional: boolean;
  showSignedFigure: boolean;
  sync: AnalyticsSyncState;
  fields: {
    stage: AnalyticsFieldStatus;
    isStageAuditLogged: boolean;
    positionsAppliedFor: AnalyticsFieldStatus;
    applicantSource: AnalyticsFieldStatus;
    hasFormSubmissionObject: boolean;
    hasApplicationObject: boolean;
  };
  stages: AnalyticsStageDefinition[];
  tracks: AnalyticsOption[];
  programs: AnalyticsProgramOption[];
  sources: AnalyticsOption[];
};

export type AnalyticsStageTotalRow = {
  rowKey: string;
  label: string;
  rowKind: 'MAIN' | 'NESTED' | 'EXIT' | 'OTHER' | 'UNMAPPED' | 'NO_STAGE';
  parentStageKey: string | null;
  count: number;
  pastLimitCount: number | null;
};

export type AnalyticsStuckRow = {
  personId: string;
  displayName: string;
  stageKey: string;
  stageLabel: string;
  stageEnteredAt: string;
  daysInStage: number;
  daysOverLimit: number | null;
  isLowerBound: boolean;
};

export type AnalyticsOverview = AnalyticsBase & {
  importedExcludedByDate: number;
  figures: {
    totalContacts: number;
    activePeople: number;
    newApplications: number | null;
    newApplicationsPrevious: number | null;
    newApplicationsFrom: string;
    newApplicationsTo: string;
    importedApplications: number | null;
    stuckPeople: number;
    inactivePeople: number;
    signedPeople: number | null;
  };
  stageTotals: AnalyticsStageTotalRow[];
  stuck: { rows: AnalyticsStuckRow[]; total: number; hasLimits: boolean };
};

export type AnalyticsFunnelRow = {
  stageKey: string;
  label: string;
  windowDays: number | null;
  entered: number;
  eligible: number;
  reachedNext: number;
  timedOut: number;
  exited: number;
  inWindow: number;
  stepRate: number | null;
  soFarRate: number | null;
  dropOffRate: number | null;
  isUnderMinimum: boolean;
  medianDays: number | null;
  completedStays: number;
};

export type AnalyticsOverallConversion = {
  finalStageKey: string | null;
  windowDays: number;
  eligible: number;
  reached: number;
  rate: number | null;
  soFarRate: number | null;
  isUnderMinimum: boolean;
};

export type AnalyticsFunnel = AnalyticsBase & {
  cohortSize: number;
  cohortExcludedUnmapped: number;
  overall: AnalyticsOverallConversion;
  rows: AnalyticsFunnelRow[];
  lowestStepStageKey: string | null;
};

export type AnalyticsStepRate = {
  stageKey: string;
  eligible: number;
  rate: number | null;
  soFarRate: number | null;
};

export type AnalyticsCategoryRow = {
  key: string;
  parentKey: string | null;
  label: string;
  isUnmapped: boolean;
  people: number;
  activePeople: number;
  cohortSize: number;
  overallEligible: number;
  overallRate: number | null;
  overallSoFarRate: number | null;
  stepRates: AnalyticsStepRate[];
};

export type AnalyticsCategories = AnalyticsBase & {
  groupBy: AnalyticsCategoryGroupBy;
  distinctPeople: number;
  peopleInSeveral: number;
  stepStageKeys: string[];
  rows: AnalyticsCategoryRow[];
};

export type AnalyticsTrendPoint = {
  bucketStart: string;
  value: number | null;
  previousValue: number | null;
  size: number | null;
  isPartial: boolean;
};

export type AnalyticsCohortCell = {
  stageKey: string;
  entered: number;
  eligible: number;
  rate: number | null;
  soFarRate: number | null;
  isMature: boolean;
};

export type AnalyticsCohortRow = {
  bucketStart: string;
  size: number;
  cells: AnalyticsCohortCell[];
  overallRate: number | null;
  overallSoFarRate: number | null;
};

export type AnalyticsMovementRow = {
  stageKey: string;
  label: string;
  enteredInPeriod: number;
  leftInPeriod: number;
  countNow: number;
  countPrevious: number | null;
};

export type AnalyticsTrends = AnalyticsBase & {
  metric: AnalyticsTrendMetric;
  stageKey: string | null;
  period: AnalyticsPeriod;
  unavailableReason: 'DAILY_RATE' | 'SNAPSHOT_FILTER_COMBINATION' | 'NO_SUBMISSION_OBJECT' | null;
  series: AnalyticsTrendPoint[];
  cohorts: AnalyticsCohortRow[];
  movement: { from: string; to: string; rows: AnalyticsMovementRow[] };
};

export type AnalyticsReportListItem = {
  periodType: AnalyticsReportPeriodType;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
};

export type AnalyticsReportComparison = {
  metricKey: string;
  label: string;
  current: number | null;
  previous: number | null;
  isSignificant: boolean;
};

export type AnalyticsReport = AnalyticsReportListItem & AnalyticsBase & {
  newApplications: number | null;
  newApplicationsPrevious: number | null;
  categories: AnalyticsCategories;
  funnel: AnalyticsFunnel;
  movement: AnalyticsMovementRow[];
  stuckByStage: { stageKey: string; label: string; count: number }[];
  comparisons: AnalyticsReportComparison[];
  cohorts: AnalyticsCohortRow[];
};
```

## 8. UI

Layout. One page, body owns its scroll (`packages/twenty-front/src/modules/team-inbox/components/TeamInboxContent.tsx:85-90`):
```
PageCardHeader: [IconLayoutDashboard] Analytics                 Last successful sync 12 minutes ago
Banner slot: stale warning, then provisional notice
TabList: Overview | Funnel | Categories | Trends | Reports
Filter row: Dates | Track | Program | Source | Status | Period   (hidden on Reports)
One takeaway sentence
Views for the tab, each with a title and a one-line unit and date-basis note
```

Component tree, all in `modules/crm-analytics/components/` except the page:
```
pages/analytics/AnalyticsPage.tsx            copy packages/twenty-front/src/pages/team-inbox/TeamInboxPage.tsx:10-33; calls useCrmAnalyticsMeta; actionButton = AnalyticsSyncLine
  AnalyticsContent.tsx                       state switch, banners, TabListRoot + TabList, filter useState
    AnalyticsStatePanel.tsx                  EmptyState or ErrorState per state
    AnalyticsFilterBar.tsx
    AnalyticsOverviewTab.tsx
      AnalyticsFiguresRow.tsx
      AnalyticsStageTotalsTable.tsx
      AnalyticsStuckTable.tsx
    AnalyticsFunnelTab.tsx
      AnalyticsStageLedger.tsx               signature element
    AnalyticsCategoriesTab.tsx
      AnalyticsCategoryTable.tsx
    AnalyticsTrendsTab.tsx
      AnalyticsTrendChart.tsx                only file importing page-layout/widgets/graph
      AnalyticsTrendTable.tsx
      AnalyticsCohortTable.tsx
      AnalyticsMovementTable.tsx
    AnalyticsReportsTab.tsx
      AnalyticsReportView.tsx                reuses ledger, category, movement and cohort tables
Shared: AnalyticsSection.tsx  AnalyticsTable.tsx (Linaria styled table)  AnalyticsBarCell.tsx  AnalyticsRateCell.tsx  AnalyticsSkeleton.tsx
NavigationDrawerAnalyticsItem.tsx            copy packages/twenty-front/src/modules/team-inbox/components/NavigationDrawerTeamInboxItem.tsx; returns null without useHasPermissionFlag(PermissionFlagType.EXPORT_CSV), hook at @/settings/roles/hooks/, enum from ~/generated-metadata/graphql
```

**Reused**

| Component | Path | Use |
|---|---|---|
| `PageTitle`, `PageCardLayout`, `PageCardHeader` | `@/ui/...`, per `packages/twenty-front/src/pages/team-inbox/TeamInboxPage.tsx:5-8` | Shell |
| `TabListRoot`, `TabList` | `@/ui/layout/tab-list/components/` | Default `behaveAsLinks` keeps tab in URL hash. Active tab from `activeTabIdComponentState` |
| `Select` | `@/ui/input/components/Select` | Five filters. Dates: presets plus two native date inputs when Custom |
| `SegmentedControl` | `twenty-ui/components/input` | Group switch on Categories |
| `InlineBanner` | `twenty-ui/components/feedback` | Banners. Props not opened |
| `EmptyState`, `ErrorState` | `@/ui/feedback/empty-state/components/` | States |
| `SkeletonLine` | `@/ui/feedback/skeleton/components/SkeletonLine` | Loading |
| `ToastOnQueryErrorEffect` | `@/apollo/components/ToastOnQueryErrorEffect` | Non-permission errors |
| `useOpenRecordInSidePanel` | `@/side-panel/hooks/useOpenRecordInSidePanel` | Stuck row opens person: `{ recordId, objectNameSingular: 'person' }` |
| `useNumberFormat`, `useDateTimeFormat`, `beautifyPastDateRelativeToNow` | `@/localization/hooks/`, `~/utils/date-utils` | Numbers, dates, sync text |
| `GraphWidgetLineChart` | `@/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart` | Trend line |

Trend chart wrapper provides `PageLayoutEditModeProviderContext`, `PageLayoutComponentInstanceContext`, `WidgetComponentInstanceContext` as `packages/twenty-front/src/modules/page-layout/widgets/graph/__tests__/GraphWidgetTestWrapper.tsx:26-34`, inside a 280 px box. Props: `id`, `colorMode="automaticPalette"`, `showLegend`, `showGrid`, `data` from `buildTrendChartSeries` with the gray previous series first, then blue. `y: null` is allowed (`packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-line-chart/types/LineChartDataPoint.ts`) and leaves a gap; `gray` exists (`packages/twenty-front/src/modules/page-layout/widgets/graph/utils/createGraphColorRegistry.ts:169`). Rates are passed as 0 to 100 with `suffix="%"`. Runtime color handling not verified.

**Custom:** figures row, ledger, all tables, bars. Plain DOM with Linaria, as `packages/twenty-front/src/modules/form-builder/components/FormBuilderResponsesTab.tsx:29-82, 103-140`. Canvas bars are not used: they cannot take focus or align with columns (`packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-bar-chart/components/BarChartBaseLayer.tsx:21`). No pies, no 3D, no rainbow, no dual axes.

**View mapping**

| Tab, view | Type and fields | Content |
|---|---|---|
| Sync line | `meta.sync` | "Last successful sync {relative}." Failed last attempt or stale: warning color. Text only |
| Filter bar | `meta.tracks`, `programs` filtered by `trackKey`, `sources`, `stages` | Status options from the type. Period disabled outside Trends with a tooltip giving the reason |
| Overview, figures | `figures` | Large tile `activePeople`. Tiles: `newApplications` with change against previous and "{n} imported, dates unknown" under it; `totalContacts`; `stuckPeople` with "{n} inactive" under it; `signedPeople` only when `showSignedFigure` |
| Overview, totals | `stageTotals` | Table: label, bar, count, past limit. NESTED rows indented under parent. Bars scale to the largest top row |
| Overview, stuck | `stuck` | Table: name, stage, days in stage ("at least N" when `isLowerBound`), days over limit. Row opens person. "Showing 100 of {total}" |
| Funnel | `AnalyticsFunnel` | Overall line (rate, or "so far" form), `AnalyticsStageLedger`, note giving cohort size, excluded unmapped, re-applicant rule |
| Categories | `AnalyticsCategories` | Switch Track and program or Source. Sticky first column: label, people bar, active, cohort, overall rate, one column per `stepStageKeys`. Tracks expand to programs by a button. Horizontal scroll inside the table box. Note "{peopleInSeveral} people count in several rows; rows do not add up to {distinctPeople}" |
| Trends, line | `series` with metric and stage selects | Bucket table directly under the chart: no toggle |
| Trends, cohorts | `cohorts` | Rows of cohorts, columns of stages, numbers with n, no shading |
| Trends, movement | `movement` | Stage, entered, left, now, previous, change |
| Reports | `AnalyticsReportListItem[]`, `AnalyticsReport` | List by period type, newest first. Viewer: generated time, tracking caveat, comparisons table with significant rows marked, then the shared tables |

**Stage ledger (signature).** One real `<table>`, stages as rows. Columns: Stage; Reached (solid bar scaled to first row, plus number); To next (rate set on the hairline between this row and the next, through a positioned element in the cell); Timed out; Exited; Too recent; Median days. Exactly one row carries the accent, `lowestStepStageKey`, with the neutral label "Lowest step" and no alarm color. Not yet known looks the same everywhere through `AnalyticsRateCell`.

**AnalyticsRateCell rule:** `rate` present and not under minimum: normal text. Under minimum: muted text with "n={eligible}". `rate` null with `soFarRate` present: no fill, muted "12% so far". Both null: "Not enough data". Never renders 0% as a placeholder.

**States**

| State | Trigger | Shows |
|---|---|---|
| Loading | First load only, `loading && data === undefined` | Skeleton rows in the view's shape |
| Permission | `isCrmAnalyticsForbiddenError`: `CombinedGraphQLErrors.is(error)` with `extensions.code === 'FORBIDDEN'` | "You do not have access to analytics. Ask an admin." No toast |
| Error | Other query error | `ErrorState` with retry, toast, other tabs still work |
| Off | `DISABLED` | "Analytics is switched off." No queries sent |
| No stage field | `NO_STAGE_FIELD` | "This workspace has no Stage field on People, so there is nothing to measure yet." |
| Never synced | `NEVER_SYNCED` | "The first sync has not finished." Numbers hidden |
| Stale | `sync.isStale` | Warning banner, numbers kept |
| Not recording | `isStageAuditLogged` false | Warning: "Stage changes are not being recorded on the timeline." |
| Empty | Zero rows | "No people match these filters" with reset |
| Date filter on | `importedExcludedByDate > 0` | "{n} imported people have no known application date and are not shown." |
| Unmapped | UNMAPPED rows or `isUnmapped` | Always a visible row labeled "Unmapped: {raw}" |
| No positions or source field | Field status not OK | That filter disabled with reason; Categories shows a notice for that switch |
| Too recent | Above | Muted "so far" form |
| Launch | `cohortSize` 0 | "Tracking started {date}. Conversion appears once people pass the {n}-day window." Current-state views work from day one |
| Trend unavailable | `unavailableReason` | Plain reason in place of the chart: daily rates are not offered; stored daily counts use one category at a time |

**Takeaways.** One sentence per tab, built on the front from typed numbers with Lingui, so reports reuse them and catalogs stay single-sourced. Critic cut one per chart.
- Overview: "{active} active people, {stuck} past their stage limit."
- Funnel: "{rate}% of {eligible} reached {final}. Lowest step: {a} to {b}, {x}%." Without data: the launch sentence.
- Categories: "{largest} is largest; {best} converts best, {x}%." Only rows at or above minimum qualify.
- Trends: "{value} in this {period}, {delta} against the previous one."

**Conventions.** Dark mode through `themeCssVariables` from `twenty-ui/theme`; no hard-coded colors; nivo handles its own theme. Keyboard: `TabList`, `Select`, native date inputs and real buttons; stuck rows have `tabIndex={0}` and open on Enter; expand buttons use `aria-expanded`; bars are `aria-hidden` beside numeric text; visible focus rings. Motion: none added. The line chart's `animate` is fixed on with a near-instant spring (`packages/twenty-front/src/modules/page-layout/widgets/graph/graph-widget-line-chart/components/GraphWidgetLineChart.tsx:318`, `packages/twenty-front/src/modules/page-layout/widgets/graph/constants/ChartMotionConfig.ts`), which cannot honor reduced motion without an edit; accepted and reported. No polling: filter changes refetch with `fetchPolicy: 'cache-and-network'`. Filter state is `useState`. Lint: `Styled` prefix, sorted CSS, one const per constants file, inline `type` imports, no `../`, Lingui everywhere. Do not run `lingui extract` or `compile`.

## 9. Test plan

**Server** (`npx jest <path> --config=packages/twenty-server/jest.config.mjs`, one file at a time; construct classes directly with fakes, as `packages/twenty-server/src/modules/timeline/repositories/__tests__/timeline-activity.repository.spec.ts:42-59`)

| Spec | Purpose |
|---|---|
| `crm-analytics-facade.service.spec.ts` | Absent fields report MISSING, wrong type WRONG_TYPE, no throw; NULL substitution in person relation; absent form objects return null; relation filters present; names capped at 100 |
| `crm-analytics-read-only.spec.ts` | Walks the folder: only the facade names `person`, `timelineActivity`, `_formSubmission` or calls `getWorkspaceSchemaName`; facade SQL starts with SELECT and has no write keyword; facade has no `.insert(`, `.update(`, `.delete(`, `.save(` |
| `crm-analytics-api-types.spec.ts` | Server and front type files are identical after normalizing line endings |
| `timeline-diff-shape.spec.ts` | `objectRecordChangedValues` (`packages/twenty-server/src/engine/core-modules/event-emitter/utils/object-record-changed-values.ts:70`) yields `{ stage: { before, after } }` for a SELECT and arrays for MULTI_SELECT. Catches an upstream shape change |
| `crm-analytics-ddl.constant.spec.ts` | Each statement has `IF NOT EXISTS` and only touches `analytics` |
| `crm-analytics-config.constant.spec.ts` | Ranks contiguous, one success stage, every raw value maps to a known stage, 39 positions all assigned once to 5 tracks |
| `build-crm-analytics-cte.util.spec.ts` | Escaping; reminder takes parent rank; Signed Paid and Non paid share a rank; filters become parameters; no-op filter present |
| `parse-crm-analytics-filter.util.spec.ts` | Bad dates and literals throw; null defaults |
| `build-crm-analytics-local-date-sql.util.spec.ts` | One expression; zone is a parameter |
| `compute-crm-analytics-report-periods.util.spec.ts` | Only finished, Monday local boundary in a non-UTC zone, month boundary, skips existing, cap of 8 |
| `compute-crm-analytics-significant-changes.util.spec.ts` | Threshold; both values must meet minimum |
| `crm-analytics-sync.service.spec.ts` | First run uses tracking start; later runs overlap 30 minutes; daily uses tracking start; failure writes `failed` and rethrows; off switch skips; missing stage logs `skipped`; first sync enqueues daily when none logged |
| `crm-analytics-metrics.service.spec.ts` | Row mapping: identities `entered = eligible + inWindow`, `eligible = reachedNext + timedOut + exited`; null rates at 0; lowest step needs minimum; off switch payload null |
| `crm-analytics-sync.cron.job.spec.ts` | One queue message per active workspace; a queue error for one does not stop the rest |
| `crm-analytics.resolver.spec.ts` | Guard metadata present; filter parsed before service call |

**Front** (`npx jest <file> --config=packages/twenty-front/jest.config.mjs`; patterns `packages/twenty-front/src/modules/notifications/utils/__tests__/buildNotificationItems.test.ts`, `packages/twenty-front/src/modules/ui/layout/page/components/__tests__/PageCardLayout.test.tsx`; query by text and role, `user-event`; `useApolloCoreClient` returns the default client under `NODE_ENV=test`)

| Test | Purpose |
|---|---|
| `formatAnalyticsRate.test.ts` | Fractions to percent; null handling |
| `buildOverviewTakeaway.test.ts`, `buildFunnelTakeaway.test.ts`, `buildCategoriesTakeaway.test.ts`, `buildTrendsTakeaway.test.ts` | Sentence with data; neutral sentence without; under-minimum rows do not qualify |
| `buildTrendChartSeries.test.ts` | Null stays null, never 0; gray series first; rate scaling |
| `isCrmAnalyticsForbiddenError.test.ts` | Detects FORBIDDEN only |
| `AnalyticsRateCell.test.tsx` | "12% so far" shown; never "0%" for unknown; n shown under minimum |
| `AnalyticsStageLedger.test.tsx` | Renders role `table`; exactly one row labeled "Lowest step"; none when key is null |
| `AnalyticsFilterBar.test.tsx` | Program list narrows by track; period disabled outside Trends; disabled filter when field missing |
| `AnalyticsStuckTable.test.tsx` | Click and Enter open the person; "at least" form |
| `AnalyticsContent.test.tsx` (`MockedProvider`) | Every page state; forbidden shows no numbers; stale keeps numbers; never synced hides them |
| `NavigationDrawerAnalyticsItem.test.tsx` | Hidden without the flag |

**Local end to end.** Answers what no unit test can: real timeline rows and real SQL. Files go in `WORK/e2e/` (the analytics-work folder), not the repo; `.env` files are git-ignored (checked). `setup-dev-env.sh` and `yarn start` are avoided because `nx reset:env` uses `cp` and `start` uses a `NODE_ENV=` prefix under Nx's Windows shell (likely to fail, not verified). `git status` must stay clean apart from code.

Ask the user to start Docker Desktop and close other apps first. In Git Bash from the worktree root:
```bash
docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db redis
cp -n packages/twenty-server/.env.example packages/twenty-server/.env
cp -n packages/twenty-front/.env.example packages/twenty-front/.env
npx nx build twenty-shared --skip-nx-cache
npx nx database:reset twenty-server          # heavy: builds server, seeds; ClickHouse step with no URL not verified
cd packages/twenty-server
node dist/command/command.js cron:register:all
NODE_ENV=development node dist/main.js                       # terminal 1, port 3000
NODE_ENV=development node dist/queue-worker/queue-worker.js  # terminal 2
cd ../.. && npx nx start twenty-front                        # terminal 3, port 3001
```
SQL shell: `docker compose -f packages/twenty-docker/docker-compose.dev.yml exec db psql -U postgres -d default`.

Sample setup, on the Apple seed workspace only, so the second seed workspace tests the missing-field state:
1. Log in with the prefilled credentials. Settings, APIs: create an admin API key, save to `WORK/e2e/token.txt`.
2. `WORK/e2e/fields.mjs`, copying `ensureField` from `packages/twenty-utils/flolabs/setup-forms.mjs:89-107`: `createOneField` on `/metadata` for person `stage` (SELECT, section 1 raw values plus `LEGACY_TEST` to test Unmapped), `positionsAppliedFor` (MULTI_SELECT, 6 values), `applicantSource` (SELECT, 4 values). Reserved-name issues not verified.
3. `TWENTY_URL=http://localhost:3000 TWENTY_TOKEN_FILE=<WORK>/e2e/token.txt node packages/twenty-utils/flolabs/setup-forms.mjs`. Create a `crmForm` named `Internship Application` through the form builder.
4. Set the tracking start for this test only:
   `INSERT INTO core."keyValuePair" ("key","value","workspaceId","type") VALUES ('CRM_ANALYTICS_TRACKING_START_AT','"2026-08-01T00:00:00.000Z"'::jsonb,'<id>','USER_VARIABLE');`
5. `WORK/e2e/people.mjs`: create and move people with `/rest/people` (under 100 requests a minute). Backdate only in local psql: `person."createdAt"` and `timelineActivity."happensAt"`, with `"updatedAt" = now()` so the sync re-reads them.

Run jobs on demand: `node dist/command/command.js crm-analytics:run --workspace-id <id> --job sync` (or `daily`) from `packages/twenty-server`.

**Timeline checks: do stage changes appear as expected?**

| # | Action | Expected |
|---|---|---|
| T1 | Change Stage once in the UI as the seeded user | One `timelineActivity` row: `properties.diff.stage` with before and after, `targetPersonId` set, `linkedRecordId` null. After sync, one transition |
| T2 | Change again within 10 minutes, same user | Same row updated, `updatedAt` moved, `happensAt` unchanged. Same transition upserted with first before and last after; no new row |
| T3 | Change A to B to A within 10 minutes | `before = after`. Transition kept, every read ignores it |
| T4 | Change after 11 minutes | New row, new transition |
| T5 | PATCH with the API key | Row with `workspaceMemberId` null, separate from T1's merge key |
| T6 | Bulk update several people in the table | One row per person |
| T7 | Submit a published form that sets `Stage = INTERESTED` | Row appears; furthest stage unchanged; stage clock restarts. Settles the "not verified" form path |
| T8 | Import a CSV updating Stage | Record what happens. Informs the HubSpot import question |
| T9 | Create a person with a stage | `properties` is `{}`; first stage comes from the person row or a later `before` |
| T10 | Rename a stage option | Record old-row handling; alias keeps it mapped; no false reconcile rows |
| T11 | Merge two people | Record what happens to their rows |

**Pipeline checks**

| # | Check | Expected |
|---|---|---|
| P1 | Run sync twice | Second run changes no row count |
| P2 | Run daily twice | Snapshot and report counts unchanged; `restored_count` 0 second time |
| P3 | `UPDATE person SET stage` in psql (no events), wait 30 minutes or backdate `updatedAt`, run daily | One `reconcile` row, logged, excluded from durations; rerun adds none |
| P4 | Second seed workspace | State `NO_STAGE_FIELD`, log `skipped`, no error in worker output |
| P5 | Off switch on | Jobs skip, page says off. Off again recovers |
| P6 | Stop the worker for over 60 minutes, or backdate the log | Stale banner, numbers kept |
| P7 | Force a failure (bad tracking start value), then fix | `failed` row, recovered next run |
| P8 | Drop schema `analytics` | Page `NEVER_SYNCED`, next job recreates |
| P9 | Soft delete, then restore | Counts drop then return; no new transition |
| P10 | Remove `EXPORT_CSV` from a role, log in as a member of it | Nav hidden; direct URL shows the permission state; API returns FORBIDDEN |
| P11 | Set `person` to imported (backdated `createdAt`) | Not in cohort; counted inactive; moved one shows "at least" only when origin is reconcile |
| P12 | CRM regression | People list, person page, Team inbox, Notifications, Forms still load; server and worker boot with no new errors |

**Hand-calculated sample (spec 11).** Step window 14 days, entry `NEW`, ages in days before now:

| Person | History | |
|---|---|---|
| A | created 40 at NEW; CONTACTED at 35 | in window |
| B | created 40 at NEW; CONTACTED at 20 | late |
| C | created 40 at NEW; NOT_INTERESTED at 30 | exit |
| D | created 40 at NEW; no move | timed out |
| E | created 5 at NEW; CONTACTED at 1 | too recent |
| F | created 5 at NEW; no move | too recent |
| G | created 40 at NEW; ATTENDED at 35 | skipped stages |
| H | created before tracking start; CONTACTED at 10 | imported, out |

Expected, compared with `AnalyticsFunnel`:

| Stage | entered | eligible | reachedNext | exited | timedOut | inWindow | stepRate | soFarRate |
|---|---|---|---|---|---|---|---|---|
| NEW | 7 | 5 | 2 | 1 | 2 | 2 | 40% | 4 of 7 |
| CONTACTED | 4 | 3 | 1 | 0 | 2 | 1 | 33% | 1 of 4 |

NEW median days: stays of 5, 20, 10, 4, 5, so 5, with `completedStays` 5. Then repeat with one hand-counted sample from recruiting.

**UI checks** with screenshots: all tabs and states, light and dark, keyboard-only pass, filters narrowing, 1280 px wide, stuck row opening the side panel.

## 10. Order of work

At most 5 agents at a time across all workflows until the user lifts the limit. Writers and reviewers count.

| Step | Work | Parallel | Commands |
|---|---|---|---|
| 0 | Verify this contract | Alone | Read only |
| 1 | Backend: config, DDL, facade, database, settings | With step 2 | Files only |
| 1b | Backend: sync, snapshot, metrics, reports, resolver, jobs | Same | One jest file at a time |
| 2 | UI: types, tables, tabs, states, chart wrapper | With step 1 | One jest file at a time |
| 3 | Integration: five edits, one writer, a different reviewer | After 1 and 2 | Read only until 4 |
| 4 | Typecheck and lint, server then front, never together | Alone | Heavy |
| 5 | Local end to end | Alone, Docker needed | Very heavy |
| 6 | Audit results from the user replace defaults in the constant | Any time | Rerun config spec |

Both sides write section 7's block on their own at the start, so neither waits. The bulk of steps 1 and 2 needs no heavy command.

| Weight | Commands |
|---|---|
| Light | Grep, Read, single `npx jest` file (one at a time) |
| Medium | `npx nx build twenty-shared --skip-nx-cache` |
| Heavy, one at a time | `npx tsgo -p tsconfig.json --noEmit` in a package, `npx nx lint:diff-with-main <pkg>`, `npx nx build twenty-server`, `npx nx database:reset twenty-server` |
| Very heavy, alone, other apps closed | Docker Desktop plus server, worker and Vite together; estimated 7 to 9 GB (not measured) |
| Do not run | `yarn start`, `lingui extract` or `compile`, Storybook build, `nx run twenty-front:graphql:generate`, whole-package jest |

Disk: 9.2 GB free on D:, 12 GB on C: (checked now). Docker's disk normally grows on C:. Check before step 5.

## 11. Requests for the user or recruiting

Read-only on production, results without personal data. `<id>` is the workspace schema suffix.

1. Run before funnel numbers are trusted:
```sql
SELECT stage, count(*) FROM workspace_<id>.person GROUP BY 1;
SELECT "happensAt", "updatedAt", properties->'diff'->'stage' FROM workspace_<id>."timelineActivity"
WHERE "targetPersonId" IS NOT NULL AND properties->'diff' ? 'stage' ORDER BY "createdAt" DESC LIMIT 20;
SELECT count(*), pg_size_pretty(pg_total_relation_size('workspace_<id>."timelineActivity"')) FROM workspace_<id>."timelineActivity";
SELECT date_trunc('day', "createdAt") AS day, count(*) FROM workspace_<id>.person GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
SELECT name, type, "isAuditLogged" FROM core."fieldMetadata" WHERE name IN ('stage', 'positionsAppliedFor', 'applicantSource');
```
2. Export the Person `Stage` options: value, label, order. Mark each as main stage, reminder (of which stage) or exit. Name the entry and success stages.
3. Should follow-up forms move someone at Contacted or Attended back to `INTERESTED`? Where does it sit in the order?
4. Check the 39-position, 5-track table in section 1 and correct it.
5. Reporting time zone, drop-off window, overall window, stuck days per stage, minimum sample.
6. Confirm: funnel counts people, not applications. One pipeline only.
7. Applications object: singular name, field list, whether it links to Person and holds an application date.
8. When did the last HubSpot import write finish? Is HubSpot stage history still readable? It could give a real funnel at launch.
9. Who may view analytics? Is the `EXPORT_CSV` flag acceptable as the gate? Is a report page enough for v1?
10. One hand-counted sample period to check results.
11. Approve the retention paragraph in section 3.
12. Start Docker Desktop and close other apps when step 5 begins.
