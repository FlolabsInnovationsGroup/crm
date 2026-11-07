'use strict';
// Planted defects, one at a time. Each is a mistake someone could really make. `tests` limits
// which test files run, for time: it names where the defect should be caught.
const SERVER = 'packages/twenty-server/src/modules/analytics/';
const FRONT = 'packages/twenty-front/src/modules/crm-analytics/';

const UNIT_SERVER = [
  {
    name: 'significant change at exactly the ratio stops counting',
    file: `${SERVER}utils/compute-crm-analytics-significant-changes.util.ts`,
    find: '/ previous >= significantChangeRatio',
    replace: '/ previous > significantChangeRatio',
    tests: 'significant-changes',
  },
  {
    name: 'one value over the minimum is enough for a significant change',
    file: `${SERVER}utils/compute-crm-analytics-significant-changes.util.ts`,
    find: 'current < minimumSample || previous < minimumSample',
    replace: 'current < minimumSample && previous < minimumSample',
    tests: 'significant-changes',
  },
  {
    name: 'nine reports per run instead of eight',
    file: `${SERVER}utils/compute-crm-analytics-report-periods.util.ts`,
    find: 'REPORTS_PER_RUN_LIMIT = 8',
    replace: 'REPORTS_PER_RUN_LIMIT = 9',
    tests: 'report-periods',
  },
  {
    name: 'filter value one character over the limit is accepted',
    file: `${SERVER}utils/parse-crm-analytics-filter.util.ts`,
    find: 'value.length > MAXIMUM_VALUE_LENGTH ||',
    replace: 'value.length > MAXIMUM_VALUE_LENGTH + 1 ||',
    tests: 'parse-crm-analytics-filter',
  },
  {
    name: 'a date before the floor reaches Postgres',
    file: `${SERVER}utils/parse-crm-analytics-filter.util.ts`,
    find: ' || value < MINIMUM_LOCAL_DATE',
    replace: '',
    tests: 'parse-crm-analytics-filter',
  },
  {
    name: 'stale only after twice the limit',
    file: `${SERVER}services/crm-analytics-meta.service.ts`,
    find: 'CRM_ANALYTICS_CONFIG.staleAfterMinutes * MILLISECONDS_PER_MINUTE',
    replace: 'CRM_ANALYTICS_CONFIG.staleAfterMinutes * 2 * MILLISECONDS_PER_MINUTE',
    tests: 'meta.service',
  },
  {
    name: 'drop-off reports the step rate',
    file: `${SERVER}services/crm-analytics-metrics.service.ts`,
    find: 'dropOffRate: computeRate(eligible - reachedNext, eligible)',
    replace: 'dropOffRate: computeRate(reachedNext, eligible)',
    tests: 'metrics.service',
  },
  {
    name: 'exactly the minimum sample reads as under it',
    file: `${SERVER}services/crm-analytics-metrics.service.ts`,
    find: 'isUnderMinimum: eligible < CRM_ANALYTICS_CONFIG.minimumSample',
    replace: 'isUnderMinimum: eligible <= CRM_ANALYTICS_CONFIG.minimumSample',
    tests: 'metrics',
  },
  {
    name: 'median days leave the server unrounded',
    file: `${SERVER}services/crm-analytics-metrics.service.ts`,
    find: 'Math.round(days * 10) / 10',
    replace: 'days',
    tests: 'metrics.service',
  },
  {
    name: 'lowest step accepts a row under the minimum',
    file: `${SERVER}services/crm-analytics-metrics.service.ts`,
    find: 'row.eligible >= CRM_ANALYTICS_CONFIG.minimumSample',
    replace: 'row.eligible >= 0',
    tests: 'metrics.service',
  },
  {
    name: 'reconcile rows move the sync cursor',
    file: `${SERVER}services/crm-analytics-sync.service.ts`,
    find: "max(source_updated_at) FILTER (WHERE origin = 'timeline')",
    replace: 'max(source_updated_at)',
    tests: 'sync.service',
  },
  {
    name: 'the off switch stops no job',
    file: `${SERVER}services/crm-analytics-sync.service.ts`,
    find: 'if (await this.crmAnalyticsSettingsService.isDisabled(workspaceId)) {',
    replace: 'if (false) {',
    tests: 'sync.service',
  },
  {
    name: 'a mismatch needs both totals to be wrong',
    file: `${SERVER}services/crm-analytics-snapshot.service.ts`,
    find: 'allTotal === liveTotal && sourceTotal === liveTotal',
    replace: 'allTotal === liveTotal || sourceTotal === liveTotal',
    tests: 'snapshot',
  },
  {
    name: 'a rerun compares its empty rows and reads as a mismatch',
    file: `${SERVER}services/crm-analytics-snapshot.service.ts`,
    find: 'if (insertedRows === 0) {',
    replace: 'if (insertedRows < 0) {',
    tests: 'snapshot',
  },
  {
    name: 'stage rows linked to another record are read as stage changes',
    file: `${SERVER}facade/crm-analytics-facade.service.ts`,
    find: ' AND t."linkedRecordId" IS NULL',
    replace: '',
    tests: 'facade',
  },
  {
    name: 'the resolver drops its permission guard',
    file: `${SERVER}resolvers/crm-analytics.resolver.ts`,
    find: 'SettingsPermissionGuard(PermissionFlagType.EXPORT_CSV),',
    replace: '',
    tests: 'resolver',
  },
  {
    name: 'the resolver lets API keys in',
    file: `${SERVER}resolvers/crm-analytics.resolver.ts`,
    find: 'apiKey: false,',
    replace: 'apiKey: true,',
    tests: 'resolver',
  },
  {
    name: 'a config value reaches SQL unescaped',
    file: `${SERVER}utils/build-crm-analytics-cte.util.ts`,
    find: '`${escapeLiteral(value)}::text`',
    replace: "`'${value}'::text`",
    tests: 'build-crm-analytics-cte',
  },
  {
    name: 'the sync cron runs on another pattern',
    file: `${SERVER}constants/crm-analytics-cron-patterns.constant.ts`,
    find: '7,22,37,52 * * * *',
    replace: '*/15 * * * *',
    tests: 'jobs-wiring',
  },
  {
    name: 'page transactions can write',
    file: `${SERVER}services/crm-analytics-database.service.ts`,
    find: "await run(SET_PAGE_TRANSACTION_SQL, []);",
    replace: '',
    tests: 'database.service',
  },
  {
    name: 'a job listens on the wrong queue',
    file: `${SERVER}jobs/crm-analytics-workspace-daily.job.ts`,
    find: '@Processor(MessageQueue.workspaceQueue)',
    replace: '@Processor(MessageQueue.cronQueue)',
    tests: 'jobs-wiring',
  },
  {
    name: 'a provider reads a dependency while it is built',
    file: `${SERVER}services/crm-analytics-database.service.ts`,
    find: 'private readonly coreDataSource: DataSource,\n  ) {}',
    replace: 'private readonly coreDataSource: DataSource,\n  ) { void coreDataSource.options; }',
    tests: 'analytics-module',
  },
];

const UNIT_FRONT = [
  {
    name: 'an unknown rate formats as 0%',
    file: `${FRONT}utils/formatAnalyticsRate.ts`,
    find: 'return null;',
    replace: "return '0%';",
    tests: 'formatAnalyticsRate',
  },
  {
    name: 'a null trend point draws at 0',
    file: `${FRONT}utils/buildTrendChartSeries.ts`,
    find: 'return null;\n    }\n\n    return isAnalyticsRateMetric(metric)',
    replace: 'return 0;\n    }\n\n    return isAnalyticsRateMetric(metric)',
    tests: 'buildTrendChartSeries',
  },
  {
    name: 'rates reach the chart as fractions',
    file: `${FRONT}utils/buildTrendChartSeries.ts`,
    find: 'Math.round(value * 1000) / 10',
    replace: 'value',
    tests: 'buildTrendChartSeries',
  },
  {
    name: 'any GraphQL error reads as forbidden',
    file: `${FRONT}utils/isCrmAnalyticsForbiddenError.ts`,
    find: "graphQLError.extensions?.code === 'FORBIDDEN'",
    replace: 'graphQLError.extensions?.code !== undefined',
    tests: 'isCrmAnalyticsForbiddenError',
  },
  {
    name: 'every row is labeled Lowest step',
    file: `${FRONT}components/AnalyticsStageLedger.tsx`,
    find: '!isFinalStage && row.stageKey === lowestStepStageKey',
    replace: '!isFinalStage',
    tests: 'AnalyticsStageLedger',
  },
  {
    name: 'a stuck row opens nothing',
    file: `${FRONT}components/AnalyticsStuckTable.tsx`,
    find: 'onClick={() => openPerson(row.personId)}',
    replace: 'onClick={() => undefined}',
    tests: 'AnalyticsStuckTable',
  },
  {
    name: 'a rate under the minimum sample looks like any other',
    file: `${FRONT}components/AnalyticsRateCell.tsx`,
    find: 'if (!isUnderMinimum) {',
    replace: 'if (true) {',
    tests: 'AnalyticsRateCell',
  },
  {
    name: 'no stale banner',
    file: `${FRONT}components/AnalyticsContent.tsx`,
    find: '{meta.sync.isStale && (',
    replace: '{false && (',
    tests: 'AnalyticsContent',
  },
  {
    name: 'forbidden shows the page anyway',
    file: `${FRONT}components/AnalyticsContent.tsx`,
    find: 'if (isForbidden) {',
    replace: 'if (false) {',
    tests: 'AnalyticsContent',
  },
  {
    name: 'the program list ignores the chosen track',
    file: `${FRONT}components/AnalyticsFilterBar.tsx`,
    find: '? meta.programs.filter((program) => program.trackKey === filter.trackKey)',
    replace: '? meta.programs',
    tests: 'AnalyticsFilterBar',
  },
  {
    name: 'the takeaway names a step with too few people',
    file: `${FRONT}utils/buildFunnelTakeaway.ts`,
    find: 'lowestRow.isUnderMinimum ||\n',
    replace: '',
    tests: 'buildFunnelTakeaway',
  },
];

const DATAFLOW = [
  {
    name: 'a move merged into a row already read is lost',
    file: `${SERVER}services/crm-analytics-sync.service.ts`,
    find: 'WHERE l.source_id IS NULL OR l.to_stage IS DISTINCT FROM c.to_stage',
    replace: 'WHERE l.source_id IS NULL',
  },
  {
    name: 'a merged move keeps the old happened time',
    file: `${SERVER}services/crm-analytics-sync.service.ts`,
    find: 'CASE WHEN l.source_id IS NULL THEN c.happened_at ELSE c.source_updated_at END',
    replace: 'c.happened_at',
  },
  {
    name: 'reconcile reads people whose timeline job may still be pending',
    file: `${SERVER}services/crm-analytics-sync.service.ts`,
    find: "WHERE p.updated_at < now() - interval '30 minutes'\n    AND ",
    replace: 'WHERE ',
  },
  {
    name: 'an empty source string is stored as its own source',
    file: `${SERVER}services/crm-analytics-snapshot.service.ts`,
    find: "COALESCE(NULLIF(p.source, ''), 'NONE')",
    replace: "COALESCE(p.source, 'NONE')",
  },
  {
    name: 'a cohort still in its window reads as mature',
    file: `${SERVER}services/crm-analytics-metrics.service.ts`,
    find: 'const isMature = step.eligible === step.entered;',
    replace: 'const isMature = true;',
  },
  {
    name: 'the first stage comes from where a person is now',
    file: `${SERVER}utils/build-crm-analytics-cte.util.ts`,
    find: 'CASE WHEN fm.person_id IS NULL THEN s.current_rank ELSE fm.from_rank END AS initial_rank',
    replace: 's.current_rank AS initial_rank',
  },
];

const MUTANTS = {
  'unit-server': UNIT_SERVER,
  'unit-front': UNIT_FRONT,
  dataflow: DATAFLOW,
};

module.exports = { MUTANTS };
