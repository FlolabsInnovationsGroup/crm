# Backend scout report

Read-only pass on `analytics_tool`. Nothing was run. Paths start at `packages/twenty-server/` unless stated. Anything marked "not verified" was not confirmed.

## 1. Recurring jobs

Files to add: a cron pattern constant, `*.cron.command.ts`, `*.cron.job.ts`. Edits to existing files: three, not two.
- `src/modules/modules.module.ts` (the worker loads it, `src/queue-worker/queue-worker.module.ts:13`).
- `src/database/commands/cron-register-all.command.ts`.
- `src/database/commands/database-command.module.ts` (imports `EmailingModule` at line 75, `TrashCleanupModule` at 92). The new module must be imported there so the command can be injected. The brief does not list this file.

Real example, `src/modules/emailing/crons/commands/reconcile-campaign-stats.cron.command.ts`:
```
@InjectMessageQueue(MessageQueue.cronQueue) private readonly messageQueueService
await this.messageQueueService.addCron<undefined>({ jobName: ReconcileCampaignStatsCronJob.name,
  data: undefined, options: { repeat: { pattern: RECONCILE_CAMPAIGN_STATS_CRON_PATTERN } } });
```
Pattern constant is `'15 * * * *'`. `repeat` also accepts `every` in ms (`src/engine/core-modules/message-queue/drivers/interfaces/job-options.interface.ts:28-34`).

Job, `.../crons/jobs/reconcile-campaign-stats.cron.job.ts`: class with `@Processor(MessageQueue.cronQueue)`, method `@Process(ReconcileCampaignStatsCronJob.name)` plus `@SentryCronMonitor(name, pattern)`.

Module wiring, `src/modules/emailing/emailing.module.ts`: command and job in `providers` (127-128), command also in `exports` (142).

Registration in `cron-register-all.command.ts`: import (24), constructor parameter (63), entry in `allCommands` (107): `{ name: 'ReconcileCampaignStats', command: this.reconcileCampaignStatsCronCommand }` (149-151). The loop (256-265) calls `command.run()` in a try/catch per command and supports `isEnabled`.

Workspace iteration: no shared helper. `src/engine/trash-cleanup/crons/trash-cleanup.cron.job.ts:75-80` uses `@InjectRepository(WorkspaceEntity)` and `find({ where: { activationStatus: WorkspaceActivationStatus.ACTIVE }, select, order: { id: 'ASC' } })`, then enqueues one job per workspace with `{ workspaceId }` on `MessageQueue.workspaceQueue` (lines 49-58).

Queue limits: `src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts:67-75, 148-156`. `cronQueue` and `workspaceQueue` both run concurrency 1 with lockDuration 30 s. A slow analytics job blocks other jobs on that queue. A new queue would need edits to `message-queue.constants.ts` and this Record (compile-enforced). Keep the minute job short instead.

Without editing existing files: only bootstrap registration. A provider with `OnApplicationBootstrap` could call `addCron` (`upsertJobScheduler` is idempotent, `bullmq.driver.ts:377`). No precedent: no `addCron` caller exists outside `*.cron.command.ts`. `OnApplicationBootstrap` is used elsewhere only for warm-up (`sdk-client.module.ts:38`). I found no lint rule against it (not verified exhaustively). Downsides: it breaks the repo convention, `ModulesModule` loads in the server too (`src/app.module.ts:60`) so it registers twice, and it ignores `DISABLE_CRON_JOBS_REGISTRATION`. Verdict: possible, not recommended. Accept the two small edits.

`twenty-docker/twenty/entrypoint.sh`: `register_background_jobs` runs `yarn command:prod cron:register:all` at server start unless `DISABLE_CRON_JOBS_REGISTRATION=true`. The worker sets it to true (`twenty-docker/docker-compose.yml:76`). Failure only prints a warning.

Removing the code: the scheduler stays in Redis. Each tick enqueues a job, the worker finds no matching `@Process` and returns silently (`message-queue.explorer.ts`, `handleProcessor`, `filteredProcessMethodNames.length === 0`). Nothing in the repo calls `removeCron`. It would keep ticking until removed by hand (Redis persistence behaviour not verified).

## 2. Reading CRM data

`src/modules/public-form/services/public-form.service.ts:133-142`:
```
await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
  const formRepository = this.workspaceOrmManager.getRepository(PUBLIC_FORM_OBJECT_NAME,
    { shouldBypassPermissionChecks: true });
  return formRepository.findOne({ where: { id: formId } });
}, buildSystemAuthContext(workspaceId));
```
`buildSystemAuthContext(workspaceId): SystemWorkspaceAuthContext` is in `src/engine/twenty-orm/utils/build-system-auth-context.util.ts`. `getRepository('person', ...)` is used the same way at line 392.

Raw SQL: `WorkspaceDataSource` has no `query` method. Two existing patterns:
- `@InjectDataSource() coreDataSource` plus `getWorkspaceSchemaName(workspaceId)` (`workspace_${uuidToBase36(id)}`) and `coreDataSource.query(sql, [params])`: `src/engine/metadata-modules/object-metadata/object-record-count.service.ts:14-31`. Table name from `computeObjectTargetTable` (`person`; custom objects get `_`).
- `runInWorkspaceTransaction(scope => scope.executeRawQuery(sql, params))` (`workspace-orm.manager.ts:115`, type in `src/engine/twenty-orm/types/workspace-transaction-scope.type.ts`). Must run inside `executeInWorkspaceContext`.

Paging 43,000 people (my design, not existing code): keyset on the primary key, `WHERE "deletedAt" IS NULL AND id > $1 ORDER BY id LIMIT 2000`, selecting only id and the needed columns. About 22 pages, no OFFSET. API cap is `QUERY_MAX_RECORDS = 200` (`packages/twenty-shared/src/constants/QueryMaxRecords.ts`); the repository `take` cap is not verified.

Custom field check: `WorkspaceManyOrAllFlatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps({ workspaceId, flatMapsKeys: ['flatObjectMetadataMaps','flatFieldMetadataMaps'] })` (used at `public-form.service.ts:288`), then `getObjectMetadataIdByName({ flatObjectMetadataMaps, objectName: 'person' })`, `findFlatEntityByIdInFlatEntityMaps`, and `buildFieldMapsFromFlatObjectMetadata(flatFieldMetadataMaps, flatObject).fieldIdByName['stage']`. Lower level: `WorkspaceCacheService.getOrRecompute` (`src/engine/workspace-cache/services/workspace-cache.service.ts:224`). SELECT and MULTI_SELECT are Postgres enum columns named after the field (`.../workspace-migration-runner/utils/field-metadata-type-to-column-type.util.ts:30-32`).

Active workspaces: the trash-cleanup query above. `PROVISIONED_WORKSPACE_ACTIVATION_STATUSES` (CREATED, ACTIVE, SUSPENDED) is in twenty-shared.

## 3. Timeline rows

Table `"workspace_<b36>"."timelineActivity"`. Columns (`src/modules/timeline/standard-objects/timeline-activity.workspace-entity.ts:19-53`; field defs in `.../twenty-standard-application/utils/field-metadata/compute-timeline-activity-standard-flat-field-metadata.util.ts`): `id, createdAt, updatedAt, deletedAt, createdBy, updatedBy, position, happensAt` (timestamptz, not null), `timelineActivityTypeId` (uuid, nullable), `timelineActivityTypeSnapshot` (jsonb), `properties` (jsonb), `linkedRecordCachedName, linkedRecordId, linkedObjectMetadataId, workspaceMemberId`, and one FK per target (`targetPersonId`, `targetCompanyId`, ...). There is no `recordId` or `name` column. Snapshot shape (`packages/twenty-shared/src/timeline/TimelineActivityTypeSnapshot.ts`): `id, universalIdentifier, name, label, action, icon, objectUniversalIdentifier, frontComponentUniversalIdentifier`; `action` is created, updated, deleted, restored, linked, unlinked or null. `core."timelineActivityType"` has the same data.

Stored for a person SELECT update (`src/engine/core-modules/event-emitter/utils/object-record-changed-values.ts`; `keepDiffOnly`, `timeline-activity.service.ts:53-56`):
`properties = {"diff": {"stage": {"before": "INTERESTED", "after": "CONTACTED"}}}`. `updatedAt` is excluded from the diff. MULTI_SELECT values are arrays. Not tested on real data.

Self-updates only: the SELF rule (`timeline-activity.service.ts:285-299`) writes `targetPersonId` and leaves `linkedRecordId` empty. Filter: `"targetPersonId" IS NOT NULL AND "linkedRecordId" IS NULL AND "timelineActivityTypeSnapshot"->>'action' = 'updated' AND properties->'diff' ? 'stage'`. Rows with a null snapshot exist (the repository spec builds one, `__tests__/timeline-activity.repository.spec.ts:33-34`), so add a fallback join on `timelineActivityTypeId` to `core."timelineActivityType".action`.

Merge, `src/modules/timeline/repositories/timeline-activity.repository.ts`:
- Candidates are rows with `createdAt > now - 10 min` (357-370), same record, same `workspaceMemberId`, same type (`build-timeline-activity-merge-key.util.ts:10-23`). The window is fixed from the first row's creation, not sliding.
- The merge calls `update(id, { properties, workspaceMemberId, snapshot? })` (434-440). `happensAt` and `createdAt` are unchanged. `updatedAt` is set to `CURRENT_TIMESTAMP` by the mutation builder (`src/engine/twenty-orm/query-builder/workspace-mutation-query-builder.ts:198-213`).
- `objectRecordDiffMerge` keeps the first `before` and the last `after`. A to B to C reads A to C. A to B to A reads before A, after A.

Consequences: `happensAt` is the time of the first change in a chain, intermediate stages are lost for good, and a poller must key on `updatedAt` and upsert by row id. Postgres `CURRENT_TIMESTAMP` is transaction start time, so overlap the cursor (for example 10 minutes back).

Creation stores no initial value: for non-update actions `properties` is `{}` (`timeline-activity.service.ts:288`). The first stage must come from the person row or from the `before` of the first update.

Audit logging: only POSITION is excluded (`src/engine/metadata-modules/field-metadata/utils/is-audit-loggable-field-type.util.ts:4-9`), so SELECT and MULTI_SELECT are logged. Custom fields default `isAuditLogged` from that function (`.../flat-field-metadata/utils/get-default-flat-field-metadata-from-create-field-input.util.ts:50-52`). The production `Stage` field's flag is not verified.

Writes from API and import: the ORM emits events for every repository write unless `shouldSkipEventEmission` (`src/engine/twenty-orm/repository/workspace-repository.ts:1265, 1396`). Its 33 uses are emailing, short-link, record-share and agent-history, none on person. The listener (`src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts:98-141`) enqueues the timeline job only when `shouldProcessEvent` is true (object audit-logged or eligible). The job runs on `entityEventsToDbQueue` with `retryLimit: 1`, so it is asynchronous and can be lost. Writes without a user (API key) get `workspaceMemberId` null (`timeline-activity.service.ts:507-514`). How the HubSpot import wrote its data is not verified.

Cleanup: no age-based cleanup found. `targetPerson` has `onDelete: CASCADE` (`compute-timeline-activity-standard-flat-field-metadata.util.ts:455`), so rows disappear when a person is destroyed.

Indexes (`.../utils/index/compute-timeline-activity-standard-flat-index-metadata.util.ts:19-155`): only one FK index per target (`personIdIndex`, `workspaceMemberIdIndex`, ...). None on `updatedAt`, `happensAt` or type. A poll by `updatedAt` scans the table. Table size is unknown (no production access), so measure before choosing the interval.

## 4. Own storage

Facts:
- Core TypeORM source uses schema `core`, legacy migrations frozen (`src/database/typeorm/core/core.datasource.ts:60-65`). Entity globs cover only `engine/core-modules` and `engine/metadata-modules` (36-47). A TypeORM entity under `src/modules` is not loaded, so use raw SQL with qualified names.
- `entrypoint.sh` runs `upgrade` on every start and `database:init:prod` only if schema `core` is missing.
- `docs/UPGRADE_COMMANDS.md`: instance commands (fast and slow) are generated and auto-registered in `instance-commands.constant.ts` (an existing file), are frozen once released, and their code must live in the version folder.
- `database:reset` runs `src/database/scripts/truncate-db.ts`, which drops every schema except pg_*, information_schema, public, metric_helpers and user_management. It would drop `analytics` (dev only). That script is the only all-schema scan I found; other `pg_namespace` queries filter one schema. `deploy.sh` uses `pg_dumpall`, so the schema is backed up.

Options:
- A. Idempotent DDL from the module, numbered steps tracked in `analytics.schema_version`, guarded by `PostgresAdvisoryLockService.tryWithLock(lockName, callback)` (`src/database/typeorm/postgres-advisory-lock.service.ts:29`). Zero existing-file edits, evolves with the module, immune to upstream version changes. Risks: DDL at runtime (the same connection role already creates workspace schemas, `workspace-schema.service.ts:41`), no formal `down`, reads must tolerate missing tables.
- B. Fast instance command in `2-48/` (precedent: `2-48-workspace-command-1793003613294-add-person-forms-tab.command.ts`). Runs once in the backed-up deploy, has `up` and `down`. Risks: edits the generated registry, every change needs a new command and a timestamp above all existing ones (a lower one is silently skipped), DDL sits in a frozen folder away from the module, and the upstream-update flow in `FLOLABS.md` section 8 means cherry-picking it again.
- C. Custom objects through metadata. They live in the workspace schema as `_` tables, every row emits events, timeline writes and record-stock accounting, they are visible and editable in the UI, and bulk writes of 100k+ rows are heavy. Reject.

Recommendation: A for tables, plus `UserVarsService` for small settings and cursors (section 8). Create the schema in the worker job before the first write.

Statement timeout: both pools set only a client-side `query_timeout` of `PG_DATABASE_PRIMARY_TIMEOUT_MS`, default 10000 (`core.datasource.ts:76`; `src/engine/twenty-orm/datasource/workspace-data-source.service.ts`, `createPool`). Server-side pattern, `src/engine/core-modules/search/services/search.service.ts:405-410`:
```
await this.workspaceOrmManager.runInWorkspaceTransaction(async (transactionScope) => {
  await transactionScope.executeRawQuery(`SELECT set_config('statement_timeout', $1, true)`, [String(timeoutMs)]);
```
The `true` makes it transaction-local, so it is safe with pooled connections. A plain `SET` would leak. `coreDataSource` has a pool of 10 shared with CRM metadata, so prefer the workspace pool for heavy reads. Qualified names let one transaction read `workspace_x` and write `analytics`.

## 5. API for the page

Guards in use:
- GraphQL (`src/modules/notifications-seen/resolvers/notifications-seen.resolver.ts:19-34`, `src/modules/public-form/resolvers/public-form-stats.resolver.ts:14-29`):
```
@UseGuards(AuthPrincipalGuard({ userSession: { standard: true, impersonated: true, playground: false/true,
  workspaceAgnostic: false }, apiKey: false, oauthClient: false, application: false }), CustomPermissionGuard)
@CoreResolver(() => Dto) @UseFilters(AuthGraphqlApiExceptionFilter)
```
- REST: `public-form.controller.ts:90-91` is public (`PublicEndpointGuard, NoPermissionGuard`). Authenticated example, `src/engine/core-modules/application/connection-provider/connections/application-connections.controller.ts:33-42`: `JwtAuthGuard, AuthPrincipalGuard({...}), NoPermissionGuard`.

`CustomPermissionGuard` always returns true (`src/engine/guards/custom-permission.guard.ts:17-19`). It only satisfies lint, so today any logged-in user passes both existing resolvers.

Edits outside the new folder:
- GraphQL: none beyond `modules.module.ts`. The schema is code-first (`graphql-config.service.ts:83-85`, `include: [CoreEngineModule, ModulesModule]`). The front can use a local `gql` with hand-written types, as `packages/twenty-front/src/modules/notifications/graphql/notificationsSeenState.ts` does, and the core Apollo client. Regenerating `src/generated/graphql.ts` is optional and noisy. Keep to one root field per query (complexity hook, `GRAPHQL_MAX_ROOT_RESOLVERS = 20`, `config-variables.ts:1890`).
- REST: a new value in `packages/twenty-shared/src/types/ApiPath.ts` (the fork already added `Forms` there) and a twenty-shared rebuild. `app.module.ts:85-95` logs only `ApiPath` values. Token hydration middleware is applied only to `/rest/*` (`app.module.ts:140-143`), so the controller needs `JwtAuthGuard`, and the front must send the token by hand.
- Both: `test/integration/endpoint-permissions/__snapshots__/` snapshots every endpoint's guard config. Existing fork endpoints are already absent from it, so it is stale (not run, needs a database).

Recommendation: GraphQL `@CoreResolver`.

Lint: yes. `.oxlintrc.json:93-94` sets `twenty/rest-api-methods-should-be-guarded` and `twenty/graphql-resolvers-should-be-guarded` to error (rules in `packages/twenty-oxlint-rules/rules/`). Each endpoint needs `AuthPrincipalGuard` or `PublicEndpointGuard` plus `SettingsPermissionGuard`, `CustomPermissionGuard` or `NoPermissionGuard`.

Role restriction with no new flag: `SettingsPermissionGuard(requiredPermission: PermissionFlagType)` (`src/engine/guards/settings-permission.guard.ts:21-68`) reads `req.workspace.id` and `req.userWorkspaceId`, calls `permissionsService.userHasWorkspaceSettingPermission`, and throws `PermissionsException` unless every caller role has the flag. A role passes if it has the flag or is role-wide (`canUpdateAllSettings` for settings flags, `canAccessAllTools` for the tool flags in `TOOL_PERMISSION_FLAGS`, `has-role-wide-access-to-permission-flag.util.ts:14-17`). The enum is fixed in twenty-shared. Precedent: `src/engine/core-modules/record-export/record-export.resolver.ts:33` uses `EXPORT_CSV`. Using an existing flag overloads its label in the role editor, which the team must accept. EXPORT_CSV or DOWNLOAD_FILE is the closest in meaning, and admin roles pass automatically. Alternative: `CustomPermissionGuard` plus a role check in the service against roles stored in settings; more code.

## 6. Module registration

`src/modules/modules.module.ts`: imports at lines 23-24, listed in the array at 38-39 (`NotificationsSeenModule`, `PublicFormModule`). Both are plain `@Module` classes (`public-form.module.ts`, `notifications-seen.module.ts`). `ModulesModule` is imported by `app.module.ts:60`, `queue-worker.module.ts:13`, `graphql-config.service.ts:85` and `metadata.module-factory.ts:39`.

Job processors: the explorer finds them through `discoveryService.getProviders()` filtered by `@Processor` (`message-queue.explorer.ts:55-65`), and only runs in the worker (`MessageQueueModule.registerExplorer()`, `queue-worker.module.ts:14`). A processor listed in a new module's `providers` is picked up with only the `modules.module.ts` edit. Precedent: the emailing cron jobs are in `emailing.module.ts` providers, not `JobsModule`. Message queue modules are `@Global`, so `@InjectMessageQueue` needs no import. The cron command still needs the `cron-register-all` and `database-command.module.ts` edits (section 1).

## 7. Tests

Closest pattern: `src/modules/timeline/repositories/__tests__/timeline-activity.repository.spec.ts`. It builds the class directly with a fake manager cast as `WorkspaceOrmManager`: `executeInWorkspaceContext: jest.fn(async (cb) => cb())` and `runInWorkspaceTransaction: jest.fn(async (cb) => cb({ getRepository: () => repo, executeRawQuery: jest.fn().mockResolvedValue([]) }))`. For a core DataSource, `src/engine/core-modules/admin-panel/__tests__/database.health.spec.ts` uses `Test.createTestingModule` with `{ provide: getDataSourceToken(), useValue: dataSource }`. Single spec, from repo root per CLAUDE.md: `npx jest <path>.spec.ts --config=packages/twenty-server/jest.config.mjs` (testRegex `.*\.spec\.ts$`, swc, `twenty-shared` must be built). Not run.

## 8. Existing help

- Chart data: `src/modules/dashboard/chart-data/` (bar, line, pie resolvers, `@MetadataResolver`) call `CommonGroupByQueryRunnerService.run` (`chart-data-query.service.ts:73-130`) with group-by field id, aggregate, date granularity and `splitMultiValueFields` (multi-select). `GET /rest/<object>/groupBy` does the same. These give live counts of people by Stage, Source or Position with the caller's permissions, and CRM dashboards can already chart them. They give nothing for history, transitions, funnels or durations.
- Key-value store: `UserVarsService` over `core.keyValuePair` accepts workspace-level keys with no user (`src/engine/core-modules/user/user-vars/services/user-vars.service.ts:16-35, 131-155`). It can be typed with a local generic, as `notifications-seen.resolver.ts:36-40` does. Fits settings, thresholds and cursors. Not for large data.
- `PostgresAdvisoryLockService` for single-flight jobs and DDL.
- Redis cache: `CacheStorageService` with a fixed namespace enum (`cache-storage-namespace.enum.ts`; `ModuleForms` at line 7 is a fork addition), so a new namespace edits an existing file. Public-form stats keep Redis counters and accept losing them. Not suitable for durable analytics.
- Nothing else helps: no stage-transition store, funnel, snapshot or report generator exists.
