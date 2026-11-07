#!/usr/bin/env node
// Loads the seed into analytics_seed, runs the REAL sync, daily and metrics code against it
// (only metadata, user vars, queue and workspace ORM are fakes) and compares every number
// with expected.mjs. See README.md. Writes ANALYTICS_TEST_OUTPUT_FILE when that is set.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import util from 'node:util';

import { classifyDifference, CORRECTED_IN_EXPECTED } from './difference-notes.mjs';
import { NO_FILTER, createExpectedWorkspace } from './expected.mjs';
import { openSeedDatabase, runLoaderCommand, seedDatabaseName } from './load.mjs';
import {
  ANSWER_SENTINEL,
  EMAIL_DOMAIN_SENTINEL,
  KNOWN_SOURCE_VALUES,
  MAIN_APPLICATIONS,
  MAIN_PEOPLE,
  MAIN_SUBMISSIONS,
  IGNORED_TIMELINE_ROWS,
  NAME_SENTINEL,
  OTHER_WORKSPACES,
  SECOND_WORKSPACE_SENTINEL,
  SETUP_USE_CASES,
} from './seed-data.mjs';
import { USE_CASE_CHECKS } from './use-case-checks.mjs';

const require = createRequire(import.meta.url);
const USE_CASES = JSON.parse(
  fs.readFileSync(new URL('./use-cases.json', import.meta.url), 'utf8'),
);

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const NUMBER_TOLERANCE = 1e-6;
const TEST_ZONE = 'Asia/Karachi';

const REQUIRED_CLASSES = [
  'CrmAnalyticsFacadeService',
  'CrmAnalyticsDatabaseService',
  'CrmAnalyticsSettingsService',
  'CrmAnalyticsSyncService',
  'CrmAnalyticsSnapshotService',
  'CrmAnalyticsMetricsService',
  'CrmAnalyticsReportService',
  'CrmAnalyticsMetaService',
  'CrmAnalyticsWorkspaceSyncJob',
  'CrmAnalyticsWorkspaceDailyJob',
];

// Maps of rows, where an absent row and an all-zero row mean the same thing.
const ROW_MAPS = new Set([
  'rows',
  'stageTotals',
  'series',
  'cells',
  'cohorts',
  'stepRates',
  'stuckByStage',
  'comparisons',
  'movement',
]);

const inspect = (value) => util.inspect(value, { depth: 6, breakLength: 120 });

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === 0) {
    return true;
  }

  if (typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return isPlainObject(value) && Object.values(value).every(isEmptyValue);
};

const keyBy = (rows, key) =>
  Object.fromEntries((rows ?? []).map((row) => [row[key], row]));

// The contract does not say how a part day displays, so whole-day people are exact and a
// mid-day clock gets one day of room. Medians are compared at the product's one decimal;
// check D-1 reports that rounding once, so it does not repeat on every median.
const toleranceFor = (path, expected) => {
  if (path.endsWith('.daysInStage') || path.endsWith('.daysOverLimit')) {
    return Number.isInteger(expected) ? NUMBER_TOLERANCE : 1;
  }

  return /(\.medianDays|MEDIAN_DAYS.*\.(value|previousValue)|New stays ended.*)$/.test(path)
    ? 0.05 + NUMBER_TOLERANCE
    : NUMBER_TOLERANCE;
};

const createRecorder = () => {
  const results = [];
  const differences = [];
  const coveredUseCases = new Set();

  const createAsserter = ({ checkId, useCases, failures, counter }) => {
    const report = (label, expected, actual) => {
      const { suspect, why, isAccepted } = classifyDifference({ checkId, label });

      differences.push({ check: checkId, label, expected, actual, useCases, suspect, why, isAccepted });

      if (isAccepted) {
        return;
      }

      failures.push(
        `${label}: expected ${inspect(expected)}, actual ${inspect(actual)} [suspect: ${suspect}${why ? `. ${why}` : ''}]`,
      );
    };

    const compareTree = (path, actual, expected) => {
      counter.count += 1;

      if (typeof expected === 'number' && typeof actual === 'number') {
        if (Math.abs(actual - expected) > toleranceFor(path, expected)) {
          report(path, expected, actual);
        }

        return;
      }

      if (isPlainObject(expected) && isPlainObject(actual)) {
        const lastSegment = path.split('.').at(-1);
        const isRowMap = ROW_MAPS.has(lastSegment);
        const keys = isRowMap
          ? new Set([...Object.keys(expected), ...Object.keys(actual)])
          : Object.keys(expected);

        for (const key of keys) {
          const isMissing = !(key in expected) || !(key in actual);

          if (isRowMap && isMissing) {
            if (!isEmptyValue(expected[key]) || !isEmptyValue(actual[key])) {
              report(`${path}.${key}`, expected[key], actual[key]);
            }
          } else {
            compareTree(`${path}.${key}`, actual[key], expected[key]);
          }
        }

        return;
      }

      if (!util.isDeepStrictEqual(actual, expected)) {
        report(path, expected, actual);
      }
    };

    return {
      equal: (label, actual, expected) => compareTree(label, actual, expected),
      ok: (label, condition, detail) => {
        counter.count += 1;

        if (!condition) {
          report(label, true, detail ?? false);
        }
      },
    };
  };

  return {
    results,
    differences,
    coveredUseCases,
    check: async (id, title, useCases, work) => {
      const failures = [];
      const counter = { count: 0 };
      const asserter = createAsserter({ checkId: id, useCases, failures, counter });

      try {
        await work(asserter);
      } catch (error) {
        const message = error?.driverError?.message ?? error?.message ?? String(error);

        failures.push(`threw: ${message}`);
        differences.push({
          check: id,
          label: 'threw',
          expected: 'no error',
          actual: message,
          useCases,
          suspect: 'product bug',
          why: 'The call threw instead of answering.',
        });
      }

      // A failed assertion still proves the case was asserted. Coverage is about whether
      // a case is tested at all; the failure is reported on its own.
      if (counter.count > 0) {
        useCases.forEach((useCase) => coveredUseCases.add(useCase));
      }

      results.push({
        id,
        title,
        status: failures.length === 0 ? 'PASS' : 'FAIL',
        useCases,
        failures,
      });
    },
    skip: (id, title, reason) => {
      results.push({ id, title, status: 'NOT_RUN', reason, useCases: [], failures: [] });
    },
    summary: () => {
      const count = (status) =>
        results.filter((result) => result.status === status).length;

      return { passed: count('PASS'), failed: count('FAIL'), notRun: count('NOT_RUN') };
    },
  };
};

const stageTotalKey = (row) => {
  const rawValue = row.rowKey.split(':').at(-1);

  switch (row.rowKind) {
    case 'NESTED':
      return `${row.parentStageKey}/${rawValue}`;
    case 'UNMAPPED':
      return `UNMAPPED/${rawValue}`;
    case 'NO_STAGE':
      return 'NO_STAGE';
    default:
      return row.rowKey;
  }
};

const normalizeFunnel = (funnel) =>
  funnel === null
    ? null
    : { ...funnel, rows: keyBy(funnel.rows, 'stageKey') };

const normalizeCategories = (categories) =>
  categories === null
    ? null
    : {
        ...categories,
        rows: Object.fromEntries(
          categories.rows.map((row) => [
            `${row.parentKey ?? 'TOP'}/${row.key}`,
            { ...row, stepRates: keyBy(row.stepRates, 'stageKey') },
          ]),
        ),
      };

const normalizeCohorts = (cohorts) =>
  Object.fromEntries(
    (cohorts ?? []).map((row) => [
      row.bucketStart,
      { ...row, cells: keyBy(row.cells, 'stageKey') },
    ]),
  );

const normalizeTrends = (trends) =>
  trends === null
    ? null
    : {
        ...trends,
        series: keyBy(trends.series, 'bucketStart'),
        movement: { ...trends.movement, rows: keyBy(trends.movement?.rows, 'stageKey') },
        cohorts: normalizeCohorts(trends.cohorts),
      };

const main = async () => {
  const startedAt = Date.now();
  const recorder = createRecorder();
  const { check } = recorder;

  const finish = (extra = {}) => {
    const summary = recorder.summary();
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const report = {
      summary,
      results: recorder.results,
      differences: recorder.differences,
      database: seedDatabaseName(),
      durationSeconds,
      useCaseCount: USE_CASES.length,
      ...extra,
    };

    if (process.env.ANALYTICS_TEST_OUTPUT_FILE) {
      fs.writeFileSync(process.env.ANALYTICS_TEST_OUTPUT_FILE, JSON.stringify(report));
    }

    for (const result of recorder.results.filter((entry) => entry.status !== 'PASS')) {
      console.log(`${result.status === 'FAIL' ? 'FAIL   ' : 'NOT RUN'} ${result.id} ${result.title}`);

      for (const failure of result.failures) {
        console.log(`    ${failure}`);
      }

      if (result.reason) {
        console.log(`    ${result.reason}`);
      }
    }

    console.log(
      `\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run, ${durationSeconds}s`,
    );
    process.exitCode = summary.failed > 0 ? 1 : 0;
  };

  let opened;

  try {
    opened = await openSeedDatabase();
  } catch (error) {
    const code = error?.code ?? error?.errors?.[0]?.code;

    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
      recorder.skip(
        'seed',
        'Seeded metrics',
        `Postgres is not reachable (${code}). Start it from the worktree with: docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db`,
      );
      finish();

      return;
    }

    throw error;
  }

  const { loader, config, query, seed, pool, setClock } = opened;
  const { createRealServices } = require('../integration/lib/real-services.cjs');
  const { createMetricsReader } = require('../integration/lib/metrics-adapter.cjs');
  const { createBaseCteReader } = require('../integration/lib/base-ctes.cjs');

  loader.repoRequire('@nestjs/common').Logger.overrideLogger(false);

  const services = createRealServices({
    loader,
    pagePool: pool,
    databaseUrl: opened.databaseUrl,
    workspaces: opened.workspaces,
  });
  const missingClasses = REQUIRED_CLASSES.filter((name) => !services.has(name));

  if (missingClasses.length > 0) {
    recorder.skip(
      'seed',
      'Seeded metrics',
      `Not written yet: ${missingClasses.map((name) => `${services.requestOf(name)}.ts`).join(', ')}`,
    );
    await opened.close();
    finish();

    return;
  }

  const reader = createMetricsReader({ loader, services });
  const readBaseCtes = createBaseCteReader({ loader, services });
  const metaService = () => services.get('CrmAnalyticsMetaService');
  const reportService = () => services.get('CrmAnalyticsReportService');
  const runSync = (workspaceId) =>
    services.get('CrmAnalyticsWorkspaceSyncJob').handle({ workspaceId });
  const runDaily = (workspaceId) =>
    services.get('CrmAnalyticsWorkspaceDailyJob').handle({ workspaceId });

  const { nowMs, trackingStartMs, jobPlan, secondWorkspaceSyncAt } = seed;
  const trackingStartIso = new Date(trackingStartMs).toISOString();
  const mainSeed = seed.workspaces.main;
  const mainWorkspaceId = mainSeed.workspaceId;

  const expectedFor = (workspaceName, jobs, options = {}) =>
    createExpectedWorkspace({
      workspace: seed.workspaces[workspaceName],
      jobs,
      config,
      nowMs,
      trackingStartMs,
      knownSources: KNOWN_SOURCE_VALUES,
      ...options,
    });

  const keyById = new Map(
    Object.values(seed.workspaces).flatMap((workspace) =>
      workspace.people.map((person) => [person.id, person.key]),
    ),
  );
  const personIdOf = (key) => mainSeed.people.find((person) => person.key === key).id;

  const readTransitions = async (workspaceId) =>
    query(
      `SELECT source_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin
       FROM analytics.stage_transition WHERE workspace_id = $1
       ORDER BY happened_at, source_updated_at`,
      [workspaceId],
    );
  const groupByPerson = (rows) => {
    const byPerson = {};

    for (const row of rows) {
      const key = keyById.get(row.person_id);

      (byPerson[key] ??= []).push(row);
    }

    return byPerson;
  };
  const readLogRows = (workspaceId, jobName) =>
    query(
      `SELECT id, job_name, status, processed_count, restored_count, details, error_message, started_at
       FROM analytics.sync_log WHERE workspace_id = $1 ${jobName === undefined ? '' : `AND job_name = '${jobName}'`}
       ORDER BY started_at, job_name DESC`,
      [workspaceId],
    );
  const readReportRows = async (workspaceId = mainWorkspaceId) =>
    Object.fromEntries(
      (
        await query(
          `SELECT period_type, period_start::text AS period_start, generated_at, md5(payload::text) AS payload_hash
           FROM analytics.report WHERE workspace_id = $1`,
          [workspaceId],
        )
      ).map((row) => [
        `${row.period_type}:${row.period_start}`,
        { generatedAt: new Date(row.generated_at).toISOString(), payloadHash: row.payload_hash },
      ]),
    );
  const readSnapshots = async (workspaceId) => {
    const rows = await query(
      `SELECT snapshot_date::text AS snapshot_date, dimension, dimension_key, stage, person_count
       FROM analytics.daily_snapshot WHERE workspace_id = $1`,
      [workspaceId],
    );
    const byDate = {};

    for (const row of rows) {
      (byDate[row.snapshot_date] ??= {})[`${row.dimension}|${row.dimension_key}|${row.stage}`] =
        row.person_count;
    }

    return byDate;
  };
  const countRows = async (table, workspaceId) =>
    (
      await query(`SELECT count(*)::int AS count FROM analytics.${table} WHERE workspace_id = $1`, [
        workspaceId,
      ])
    )[0].count;

  const mainWorkspace = await opened.openWorkspace('main');
  const secondWorkspace = await opened.openWorkspace('second');
  const observed = { afterStep: {}, logByStep: {} };

  // Before any job: the storage does not exist yet.
  await setClock(jobPlan[0].at - MINUTE_MS);
  await mainWorkspace.applyUpTo(jobPlan[0].at - MINUTE_MS);
  {
    const meta = await metaService().getMeta(mainWorkspaceId);
    let readError = null;

    try {
      await reader.getOverview(mainWorkspaceId, {});
      await reader.getFunnel(mainWorkspaceId, {});
    } catch (error) {
      readError = error?.message ?? String(error);
    }

    const [{ found }] = await query(`SELECT to_regclass('analytics.sync_log') IS NOT NULL AS found`);

    observed.beforeAnyJob = {
      state: meta.state,
      sync: meta.sync,
      hasStorageAfterReads: found,
      readError,
    };
  }

  const seenLogIds = new Set();

  const observeStep = async (step) => {
    const transitions = await readTransitions(mainWorkspaceId);
    const logRows = (await readLogRows(mainWorkspaceId)).filter(
      (row) => row.details?.seedLabel === undefined,
    );
    const newRow = logRows.find(
      (row) => row.job_name === step.job && !seenLogIds.has(row.id),
    );

    logRows.forEach((row) => seenLogIds.add(row.id));
    observed.logByStep[step.id] = newRow;

    const reportRows = await readReportRows();

    observed.afterStep[step.id] = {
      transitions,
      byPerson: groupByPerson(transitions),
      transitionCount: transitions.length,
      snapshotCount: await countRows('daily_snapshot', mainWorkspaceId),
      reportCount: Object.keys(reportRows).length,
      reportKeys: Object.keys(reportRows),
      reportRows,
      queueCalls: services.queueCalls.map((call) => call.jobName),
      queueCallCount: services.queueCalls.length,
      oldLogRows: (
        await query(
          `SELECT details->>'seedLabel' AS label FROM analytics.sync_log
           WHERE workspace_id = $1 AND details ? 'seedLabel' ORDER BY started_at`,
          [mainWorkspaceId],
        )
      ).map((row) => row.label),
    };
  };

  for (const step of jobPlan) {
    if (step.id === 'overlapSync') {
      // The second workspace syncs while the main one waits for its next tick.
      await setClock(secondWorkspaceSyncAt);
      await secondWorkspace.applyUpTo(secondWorkspaceSyncAt);
      await runSync(secondWorkspace.seedWorkspace.workspaceId);
    }

    await setClock(step.at);
    await mainWorkspace.applyUpTo(step.at, { includeRerunOnly: step.isRerun === true });
    await (step.job === 'sync' ? runSync : runDaily)(mainWorkspaceId);

    if (step.id === 'firstSync') {
      await query(
        `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, finished_at, status, details)
         VALUES ($1, 'sync', $2, $2, 'ok', '{"seedLabel":"91 days"}'), ($1, 'sync', $3, $3, 'ok', '{"seedLabel":"89 days"}')`,
        [
          mainWorkspaceId,
          new Date(jobPlan.find(({ id }) => id === 'firstDaily').at - 91 * DAY_MS),
          new Date(jobPlan.find(({ id }) => id === 'firstDaily').at - 89 * DAY_MS),
        ],
      );
    }

    await observeStep(step);
  }

  await setClock(nowMs);

  const mainExpected = expectedFor('main', jobPlan);

  await check('T-0', 'Column shapes against contract section 4', ['UC-122'], async (t) => {
    const shapeOf = async (table, column) => {
      const [row] = await query(
        `SELECT data_type, udt_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [opened.workspaces.get(mainWorkspaceId).schemaName, table, column],
      );

      return row === undefined ? null : `${row.data_type} ${row.udt_name}`;
    };

    t.equal('stage is an enum', await shapeOf('person', 'stage'), 'USER-DEFINED person_stage_enum');
    t.equal('positions are an enum array', await shapeOf('person', 'positionsAppliedFor'), 'ARRAY _person_positionsAppliedFor_enum');
    t.equal('source is an enum', await shapeOf('person', 'applicantSource'), 'USER-DEFINED person_applicantSource_enum');
    t.equal('name columns', await shapeOf('person', 'nameFirstName'), 'text text');
    t.equal('timeline properties', await shapeOf('timelineActivity', 'properties'), 'jsonb jsonb');
    t.equal('timeline times', await shapeOf('timelineActivity', 'happensAt'), 'timestamp with time zone timestamptz');
    t.equal('timeline person', await shapeOf('timelineActivity', 'targetPersonId'), 'uuid uuid');
    t.equal('submission form', await shapeOf('_formSubmission', 'formId'), 'uuid uuid');
    t.equal('submission date', await shapeOf('_formSubmission', 'submittedAt'), 'timestamp with time zone timestamptz');
  });

  // Step by step, so a row a later job repairs still shows up against the job that missed it.
  await check('T-1', 'Stored transitions after every job, against the rules of contract section 5', ['UC-22', 'UC-23', 'UC-24', 'UC-25', 'UC-26', 'UC-27', 'UC-33', 'UC-34', 'UC-35'], async (t) => {
    const describe = (row) =>
      `${row.person} ${row.from}>${row.to} at ${new Date(row.happenedAt).toISOString()} ${row.origin}`;

    for (const step of jobPlan) {
      const actual = observed.afterStep[step.id].transitions
        .map((row) =>
          describe({
            person: keyById.get(row.person_id),
            from: row.from_stage,
            to: row.to_stage,
            happenedAt: new Date(row.happened_at).getTime(),
            origin: row.origin,
          }),
        )
        .sort();
      const expected = mainExpected
        .storedTransitions()
        .filter((row) => row.storedAt <= step.at)
        .map((row) =>
          describe({
            person: row.personKey,
            from: row.from,
            to: row.to,
            happenedAt: row.happenedAt,
            origin: row.origin,
          }),
        )
        .sort();

      t.equal(`after ${step.id}`, actual, expected);
    }
  });

  await check('T-2', 'Job log against the plan: counts, restored, consistency, reports built', ['UC-32', 'UC-96', 'UC-97', 'UC-107'], async (t) => {
    for (const step of mainExpected.jobLog()) {
      const row = observed.logByStep[step.id];

      t.equal(`${step.id}.status`, row?.status, step.status);
      t.equal(`${step.id}.processedCount`, row?.processed_count, step.processedCount);

      if (step.job === 'daily') {
        t.equal(`${step.id}.restoredCount`, row?.restored_count, step.restoredCount);
        t.equal(`${step.id}.consistency`, row?.details?.consistency, step.consistency);
        t.equal(`${step.id}.reportsBuilt`, row?.details?.reportsBuilt, step.reportsBuilt);
      }
    }
  });

  await check('T-3', 'Snapshot rows on every date', ['UC-96', 'UC-97'], async (t) => {
    t.equal('snapshots', await readSnapshots(mainWorkspaceId), mainExpected.snapshotRows());
  });

  // Per person: the product's real CTEs, classified by contract section 6, against the
  // hand-calculated column in seed-data.mjs and against expected.mjs.
  const stepRows = await readBaseCtes({
    workspaceId: mainWorkspaceId,
    trackingStart: trackingStartIso,
    select: `SELECT person_id, stage_key, rank, window_days, entered_at, next_at FROM person_step ORDER BY rank`,
  });
  const exitRows = await readBaseCtes({
    workspaceId: mainWorkspaceId,
    trackingStart: trackingStartIso,
    select: `SELECT person_id, happened_at FROM transition WHERE to_kind = 'EXIT'`,
  });
  const productSteps = {};
  const productEntered = {};

  for (const row of stepRows) {
    const key = keyById.get(row.person_id);
    const enteredAt = new Date(row.entered_at).getTime();
    const nextAt = row.next_at === null ? null : new Date(row.next_at).getTime();
    let letter = 'F';

    if (row.window_days !== null) {
      const windowEnd = enteredAt + row.window_days * DAY_MS;
      const hasExited = exitRows.some((exit) => {
        const at = new Date(exit.happened_at).getTime();

        return exit.person_id === row.person_id && at >= enteredAt && at <= windowEnd;
      });

      if (windowEnd > nowMs) {
        letter = 'W';
      } else if (nextAt !== null && nextAt <= windowEnd) {
        letter = 'R';
      } else {
        letter = hasExited ? 'E' : 'T';
      }
    }

    productSteps[key] = (productSteps[key] ?? '') + letter;
    (productEntered[key] ??= {})[row.stage_key] = enteredAt;
  }

  const stepsOf = (key) => productSteps[key] ?? '';
  const engineSteps = mainExpected.personSteps(nowMs);

  await check('T-4', 'Each person: hand-calculated steps against expected.mjs and the product CTEs', ['UC-15', 'UC-16', 'UC-19'], async (t) => {
    for (const { key, steps } of MAIN_PEOPLE) {
      t.equal(`${key} expected.mjs`, engineSteps[key] ?? '', steps);
      t.equal(`${key} product`, stepsOf(key), steps);
    }
  });

  const rawOverview = await reader.getOverview(mainWorkspaceId, {});
  const normalizeOverview = (overview) =>
    overview === null
      ? null
      : {
          ...overview,
          stageTotals: Object.fromEntries(
            overview.stageTotals.map((row) => [stageTotalKey(row), row]),
          ),
          stuck: {
            ...overview.stuck,
            rows: Object.fromEntries(
              overview.stuck.rows.map((row) => [
                row.personId,
                { ...row, personKey: keyById.get(row.personId) },
              ]),
            ),
          },
        };
  const overview = normalizeOverview(rawOverview);
  const expectedOverview = mainExpected.computeOverview();
  const stuckOf = (key) => overview.stuck.rows[personIdOf(key)];

  await check('T-5', 'Each person: hand-calculated days over the limit against expected.mjs and the product', ['UC-39', 'UC-43'], async (t) => {
    for (const { key, stuck } of MAIN_PEOPLE) {
      const hand = stuck === null ? null : Number(String(stuck).replace('~', ''));
      const isLowerBound = String(stuck).endsWith('~');
      const engineRow = expectedOverview.stuck.rows[personIdOf(key)];
      const productRow = stuckOf(key);

      t.equal(`${key} expected.mjs`, engineRow === undefined ? null : Math.round(engineRow.daysOverLimit), hand);
      t.equal(`${key} product`, productRow === undefined ? null : Math.round(productRow.daysOverLimit), hand);

      if (productRow !== undefined) {
        t.equal(`${key} lower bound`, productRow.isLowerBound, isLowerBound);
      }
    }
  });

  // Main data is settled from here on, so one question needs one trip to the database.
  const remember = (read) => {
    const answers = new Map();

    return (...args) => {
      const key = JSON.stringify([args, config.reportingTimeZone, config.minimumSample]);

      if (!answers.has(key)) {
        answers.set(key, read(...args));
      }

      return answers.get(key);
    };
  };
  const overviewOf = remember(async (filter) =>
    normalizeOverview(await reader.getOverview(mainWorkspaceId, filter)),
  );
  const funnelOf = remember(async (filter) =>
    normalizeFunnel(await reader.getFunnel(mainWorkspaceId, filter)),
  );
  const categoriesOf = remember(async (groupBy, filter) =>
    normalizeCategories(await reader.getCategories(mainWorkspaceId, groupBy, filter)),
  );
  const trendsOf = remember(async (metric, stageKey, filter) =>
    normalizeTrends(await reader.getTrends(mainWorkspaceId, metric, stageKey, filter)),
  );

  const OVERVIEW_VIEWS = [
    ['no filter', {}, ['UC-14', 'UC-39', 'UC-41']],
    ['status ACTIVE', { status: 'ACTIVE' }, ['UC-90']],
    ['status SUCCESS', { status: 'SUCCESS' }, ['UC-90']],
    ['status EXITED', { status: 'EXITED' }, ['UC-90']],
    ['status UNMAPPED', { status: 'UNMAPPED' }, ['UC-90']],
    ['status NO_STAGE', { status: 'NO_STAGE' }, ['UC-90']],
    ['track ROBOTICS', { trackKey: 'ROBOTICS' }, ['UC-91']],
    ['track NONE', { trackKey: 'NONE' }, ['UC-57', 'UC-91']],
    ['track UNMAPPED', { trackKey: 'UNMAPPED' }, ['UC-58', 'UC-91']],
    ['program FINANCE_INTERN', { programKey: 'FINANCE_INTERN' }, ['UC-92']],
    ['program NONE', { programKey: 'NONE' }, ['UC-57', 'UC-92']],
    ['source REFERRAL', { sourceKey: 'REFERRAL' }, ['UC-93']],
    ['source NONE', { sourceKey: 'NONE' }, ['UC-93']],
    ['source UNMAPPED', { sourceKey: 'UNMAPPED' }, ['UC-64', 'UC-93']],
    ['September', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }, ['UC-94', 'UC-95']],
    ['from October on', { dateFrom: '2026-10-01' }, ['UC-94']],
    ['until September', { dateTo: '2026-09-30' }, ['UC-94']],
    ['September, LinkedIn', { dateFrom: '2026-09-01', dateTo: '2026-09-30', sourceKey: 'LINKEDIN' }, ['UC-93', 'UC-94']],
    ['track and status', { trackKey: 'AI_SOFTWARE', status: 'ACTIVE' }, ['UC-90', 'UC-91']],
  ];

  for (const [name, filter, useCases] of OVERVIEW_VIEWS) {
    await check(`V-overview ${name}`, `Overview, ${name}`, useCases, async (t) => {
      t.equal(`overview[${name}]`, await overviewOf(filter), mainExpected.computeOverview({ filter: { ...NO_FILTER, ...filter } }));
    });
  }

  const FUNNEL_VIEWS = [
    ['no filter', {}, ['UC-15', 'UC-16', 'UC-21', 'UC-36', 'UC-50', 'UC-62']],
    ['status ACTIVE', { status: 'ACTIVE' }, ['UC-90']],
    ['sample source', { sourceKey: 'UNIVERSITY' }, ['UC-117', 'UC-106']],
    ['program SOFTWARE', { programKey: 'SOFTWARE_DEVELOPMENT_INTERN' }, ['UC-61', 'UC-62']],
    ['program FINANCE', { programKey: 'FINANCE_INTERN' }, ['UC-60', 'UC-62']],
    ['program QUALITY_ASSURANCE', { programKey: 'QUALITY_ASSURANCE_INTERN' }, ['UC-06']],
    ['program PROMPT_ENGINEER', { programKey: 'PROMPT_ENGINEER_INTERN' }, ['UC-26', 'UC-106']],
    ['track ROBOTICS', { trackKey: 'ROBOTICS' }, ['UC-91']],
    ['track UNMAPPED', { trackKey: 'UNMAPPED' }, ['UC-58', 'UC-91']],
    ['source NONE', { sourceKey: 'NONE' }, ['UC-93']],
    ['September', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }, ['UC-95']],
  ];

  for (const [name, filter, useCases] of FUNNEL_VIEWS) {
    await check(`V-funnel ${name}`, `Funnel, ${name}`, useCases, async (t) => {
      t.equal(`funnel[${name}]`, await funnelOf(filter), mainExpected.computeFunnel({ filter: { ...NO_FILTER, ...filter } }));
    });
  }

  const CATEGORY_VIEWS = [
    ['tracks and programs', 'TRACK_PROGRAM', {}, ['UC-54', 'UC-55', 'UC-56', 'UC-57', 'UC-58', 'UC-59', 'UC-60', 'UC-61']],
    ['sources', 'SOURCE', {}, ['UC-63', 'UC-64', 'UC-65']],
    ['tracks and programs, September', 'TRACK_PROGRAM', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }, ['UC-94', 'UC-95']],
    ['tracks and programs, sample source', 'TRACK_PROGRAM', { sourceKey: 'UNIVERSITY' }, ['UC-93']],
    ['sources, AI track', 'SOURCE', { trackKey: 'AI_SOFTWARE' }, ['UC-91']],
    ['sources, active', 'SOURCE', { status: 'ACTIVE' }, ['UC-90']],
  ];

  for (const [name, groupBy, filter, useCases] of CATEGORY_VIEWS) {
    await check(`V-categories ${name}`, `Categories, ${name}`, useCases, async (t) => {
      t.equal(`categories[${name}]`, await categoriesOf(groupBy, filter), mainExpected.computeCategories({ groupBy, filter: { ...NO_FILTER, ...filter } }));
    });
  }

  const TREND_VIEWS = [
    ['NEW_APPLICATIONS', null, { period: 'DAY' }, ['UC-100']],
    ['NEW_APPLICATIONS', null, { period: 'WEEK' }, ['UC-100', 'UC-103', 'UC-104']],
    ['NEW_APPLICATIONS', null, { period: 'MONTH' }, ['UC-100', 'UC-103']],
    ['NEW_APPLICATIONS', null, { period: 'WEEK', dateFrom: '2026-11-01', dateTo: '2026-11-18' }, ['UC-95', 'UC-100']],
    ['NEW_APPLICATIONS', null, { period: 'WEEK', trackKey: 'AI_SOFTWARE' }, ['UC-71', 'UC-100']],
    ['TOTAL_CONTACTS', null, { period: 'DAY' }, ['UC-99']],
    ['TOTAL_CONTACTS', null, { period: 'WEEK' }, ['UC-99']],
    ['TOTAL_CONTACTS', null, { period: 'MONTH' }, ['UC-99']],
    ['TOTAL_CONTACTS', null, { period: 'WEEK', trackKey: 'ROBOTICS' }, ['UC-99']],
    ['TOTAL_CONTACTS', null, { period: 'WEEK', trackKey: 'ROBOTICS', sourceKey: 'WEBSITE' }, ['UC-105']],
    ['ACTIVE_PEOPLE', null, { period: 'WEEK' }, ['UC-99']],
    ['STAGE_COUNT', 'CONTACTED', { period: 'WEEK' }, ['UC-99']],
    ['OVERALL_CONVERSION', null, { period: 'DAY' }, ['UC-101']],
    ['OVERALL_CONVERSION', null, { period: 'WEEK' }, ['UC-101']],
    ['OVERALL_CONVERSION', null, { period: 'MONTH' }, ['UC-101']],
    ['OVERALL_CONVERSION', null, { period: 'WEEK', dateFrom: '2026-08-10', dateTo: '2026-08-23' }, ['UC-101']],
    ['DROP_OFF', 'NEW', { period: 'WEEK' }, ['UC-101']],
    ['DROP_OFF', 'CONTACTED', { period: 'MONTH' }, ['UC-101']],
    ['MEDIAN_DAYS', 'NEW', { period: 'WEEK' }, ['UC-102']],
    ['MEDIAN_DAYS', 'NEW', { period: 'MONTH' }, ['UC-102']],
  ];

  for (const [metric, stageKey, filter, useCases] of TREND_VIEWS) {
    const name = `${metric} ${stageKey ?? ''} ${JSON.stringify(filter)}`;

    await check(`V-trends ${name}`, `Trends, ${name}`, useCases, async (t) => {
      const expected = mainExpected.computeTrends({ metric, stageKey, filter: { ...NO_FILTER, ...filter } });
      const actual = await trendsOf(metric, stageKey, filter);

      // Cohorts and movement do not depend on the metric, so the first metric covers them.
      if (metric !== 'NEW_APPLICATIONS') {
        delete expected.cohorts;
        delete expected.movement;
      }

      t.equal(`trends[${name}]`, actual, expected);
    });
  }

  const reportOf = async (periodType, periodStart) => {
    const report = await reportService().getReport({ workspaceId: mainWorkspaceId, periodType, periodStart });

    return report === null
      ? null
      : {
          ...report,
          generatedAt: new Date(report.generatedAt).getTime(),
          movement: keyBy(report.movement, 'stageKey'),
          stuckByStage: Object.fromEntries(
            report.stuckByStage.map((row) => [row.stageKey, row.count]),
          ),
          comparisons: keyBy(report.comparisons, 'metricKey'),
          funnel: normalizeFunnel(report.funnel),
          categories: normalizeCategories(report.categories),
          cohorts: normalizeCohorts(report.cohorts),
        };
  };

  const reportKeys = Object.keys(await readReportRows());

  await check('V-reports list', 'Reports built, against the plan', ['UC-107'], async (t) => {
    t.equal(
      'report keys',
      [...reportKeys].sort(),
      mainExpected.builtReports().map((row) => `${row.periodType}:${row.periodStart}`).sort(),
    );
    t.equal('newest first', (await reportService().listReports(mainWorkspaceId)).map((row) => row.periodStart)[0], '2026-11-09');
  });

  for (const [periodType, periodStart, useCases] of [
    ['WEEK', '2026-08-17', ['UC-108', 'UC-109']],
    ['MONTH', '2026-09-01', ['UC-108', 'UC-110']],
    ['WEEK', '2026-11-09', ['UC-109', 'UC-111']],
    ['MONTH', '2026-10-01', ['UC-110']],
  ]) {
    await check(`V-report ${periodType} ${periodStart}`, `Report, ${periodType} ${periodStart}`, useCases, async (t) => {
      t.equal(`report[${periodType} ${periodStart}]`, await reportOf(periodType, periodStart), mainExpected.computeReport({ periodType, periodStart }));
    });
  }

  await check('D-1', 'Median days keep their full precision', ['UC-102'], async (t) => {
    const exact = mainExpected.computeFunnel().rows.NEW.medianDays;

    t.equal('funnel.rows.NEW.medianDays to full precision', (await funnelOf({})).rows.NEW?.medianDays, exact);
  });

  // Small separate setups, each with its own engine and jobs at the fixed now.
  const others = {};
  const finalJobs = [
    { id: 'sync', job: 'sync', at: nowMs },
    { id: 'daily', job: 'daily', at: nowMs },
  ];

  await secondWorkspace.applyUpTo(nowMs);

  for (const workspaceName of Object.keys(OTHER_WORKSPACES)) {
    const workspace =
      workspaceName === 'second' ? secondWorkspace : await opened.openWorkspace(workspaceName);
    const { workspaceId } = workspace.seedWorkspace;
    const jobs =
      workspaceName === 'second'
        ? [{ id: 'first', job: 'sync', at: secondWorkspaceSyncAt }, ...finalJobs]
        : finalJobs;

    await workspace.applyUpTo(nowMs);
    await runSync(workspaceId);
    await runDaily(workspaceId);

    const expected = expectedFor(workspaceName, jobs);
    // A TEXT source has no option list, so known and unknown mean nothing there.
    const hasKnownSourceOptions = workspaceName !== 'textFields';
    const read = {
      meta: await metaService().getMeta(workspaceId),
      overview: normalizeOverview(await reader.getOverview(workspaceId, {})),
      funnel: normalizeFunnel(await reader.getFunnel(workspaceId, {})),
      track: normalizeCategories(await reader.getCategories(workspaceId, 'TRACK_PROGRAM', {})),
      source: normalizeCategories(await reader.getCategories(workspaceId, 'SOURCE', {})),
      newApplicationsTrend: normalizeTrends(await reader.getTrends(workspaceId, 'NEW_APPLICATIONS', null, {})),
      logs: await readLogRows(workspaceId),
      transitionCount: await countRows('stage_transition', workspaceId),
    };

    others[workspaceName] = read;

    const useCases = seed.workspaces[workspaceName].people.flatMap((person) => person.useCases);

    await check(`V-workspace ${workspaceName}`, `Workspace ${workspaceName}: every number`, [...new Set(useCases), ...seed.workspaces[workspaceName].setupUseCases], async (t) => {
      t.equal(`${workspaceName}.overview`, read.overview, expected.computeOverview());
      t.equal(`${workspaceName}.funnel`, read.funnel, expected.computeFunnel());
      t.equal(`${workspaceName}.track`, read.track, expected.computeCategories({ groupBy: 'TRACK_PROGRAM' }));

      if (hasKnownSourceOptions) {
        t.equal(`${workspaceName}.source`, read.source, expected.computeCategories({ groupBy: 'SOURCE' }));
      }

      t.equal(
        `${workspaceName}.transitions`,
        (await readTransitions(workspaceId)).map((row) => `${keyById.get(row.person_id)} ${row.from_stage}>${row.to_stage} ${row.origin}`).sort(),
        expected.storedTransitions().map((row) => `${row.personKey} ${row.from}>${row.to} ${row.origin}`).sort(),
      );
      t.equal(`${workspaceName}.snapshots`, await readSnapshots(workspaceId), expected.snapshotRows());
    });
  }

  // Settings the seed varies for one read and then restores.
  const withMinimumSample = async (minimumSample, work) => {
    const saved = config.minimumSample;

    config.minimumSample = minimumSample;

    try {
      return await work();
    } finally {
      config.minimumSample = saved;
    }
  };

  const signedWhenOn = await (async () => {
    config.showSignedFigure = true;

    try {
      return (await reader.getOverview(mainWorkspaceId, {})).figures.signedPeople;
    } finally {
      config.showSignedFigure = false;
    }
  })();

  // Stage limits are read when the analytics files load, so this read loads them again.
  const noLimits = await (async () => {
    const savedLimits = config.stages.map((stage) => stage.limitDays);

    for (const stage of config.stages) {
      stage.limitDays = null;
    }

    loader.purgeAnalyticsModules();

    try {
      const altered = createRealServices({
        loader,
        pagePool: pool,
        databaseUrl: opened.databaseUrl,
        workspaces: opened.workspaces,
      });
      const { stuck, figures } = await createMetricsReader({ loader, services: altered }).getOverview(mainWorkspaceId, {});
      const [first] = stuck.rows;

      return {
        hasLimits: stuck.hasLimits,
        stuckPeople: figures.stuckPeople,
        rowCount: stuck.rows.length,
        firstRow: { personKey: keyById.get(first?.personId), daysInStage: first?.daysInStage, daysOverLimit: first?.daysOverLimit },
        isSorted: stuck.rows.every((row, index) => index === 0 || stuck.rows[index - 1].daysInStage >= row.daysInStage),
      };
    } finally {
      config.stages.forEach((stage, index) => {
        stage.limitDays = savedLimits[index];
      });
      loader.purgeAnalyticsModules();
    }
  })();

  // The same data read in another reporting zone.
  const zone = {};

  zone.utcCreatedNov3 = (await overviewOf({ dateFrom: '2026-11-03', dateTo: '2026-11-03' })).figures.totalContacts;
  zone.utcMovedNov10 = (await trendsOf('NEW_APPLICATIONS', null, { period: 'DAY', dateFrom: '2026-11-10', dateTo: '2026-11-10' })).movement.rows.CONTACTED?.enteredInPeriod;

  config.reportingTimeZone = TEST_ZONE;

  try {
    const zoneExpected = expectedFor('main', jobPlan, { timeZone: TEST_ZONE });
    const localOverview = await overviewOf({});

    zone.localCreatedNov3 = (await overviewOf({ dateFrom: '2026-11-03', dateTo: '2026-11-03' })).figures.totalContacts;
    zone.localCreatedNov4 = (await overviewOf({ dateFrom: '2026-11-04', dateTo: '2026-11-04' })).figures.totalContacts;
    zone.localMovedNov10 = (await trendsOf('NEW_APPLICATIONS', null, { period: 'DAY', dateFrom: '2026-11-10', dateTo: '2026-11-10' })).movement.rows.CONTACTED?.enteredInPeriod;
    zone.localMovedNov11 = (await trendsOf('NEW_APPLICATIONS', null, { period: 'DAY', dateFrom: '2026-11-11', dateTo: '2026-11-11' })).movement.rows.CONTACTED?.enteredInPeriod;
    zone.localNewApplications = localOverview.figures.newApplications;
    zone.localNewApplicationsPrevious = localOverview.figures.newApplicationsPrevious;

    await check('V-zone', `Every number in ${TEST_ZONE}: date filters, volume, trend buckets, movement`, ['UC-47'], async (t) => {
      const created = { dateFrom: '2026-11-04', dateTo: '2026-11-04' };

      t.equal('zone.overview', localOverview, zoneExpected.computeOverview());
      t.equal('zone.overview[Nov 4]', await overviewOf(created), zoneExpected.computeOverview({ filter: { ...NO_FILTER, ...created } }));
      t.equal('zone.funnel[Nov 4]', await funnelOf(created), zoneExpected.computeFunnel({ filter: { ...NO_FILTER, ...created } }));
      t.equal('zone.categories[Nov 4]', await categoriesOf('SOURCE', created), zoneExpected.computeCategories({ groupBy: 'SOURCE', filter: { ...NO_FILTER, ...created } }));

      const volume = { period: 'DAY', dateFrom: '2026-11-11', dateTo: '2026-11-12' };

      t.equal('zone.trend', await trendsOf('NEW_APPLICATIONS', null, volume), zoneExpected.computeTrends({ metric: 'NEW_APPLICATIONS', filter: { ...NO_FILTER, ...volume } }));
    });

    // 20:00 UTC on the last day is the next day there, so a new snapshot date appears.
    await setClock(nowMs + 8 * 60 * MINUTE_MS);
    await runDaily(secondWorkspace.seedWorkspace.workspaceId);
    zone.secondWorkspaceSnapshotDates = Object.keys(await readSnapshots(secondWorkspace.seedWorkspace.workspaceId)).sort();
  } finally {
    config.reportingTimeZone = 'UTC';
    await setClock(nowMs);
  }

  // Lifecycle of a workspace, on the second one so main numbers stay put.
  const secondId = secondWorkspace.seedWorkspace.workspaceId;
  const secondVars = opened.workspaces.get(secondId).vars;
  const offSwitch = {};

  {
    const before = (await readLogRows(secondId)).length;

    secondVars.set('CRM_ANALYTICS_DISABLED', true);

    try {
      await runSync(secondId);
      await runDaily(secondId);
      offSwitch.logRowsAdded = (await readLogRows(secondId)).length - before;
      offSwitch.metaState = (await metaService().getMeta(secondId)).state;
      offSwitch.overview = await reader.getOverview(secondId, {});
      offSwitch.funnel = await reader.getFunnel(secondId, {});
      offSwitch.reports = await reportService().listReports(secondId);
    } finally {
      secondVars.delete('CRM_ANALYTICS_DISABLED');
    }

    await runSync(secondId);
    offSwitch.metaStateAfter = (await metaService().getMeta(secondId)).state;
    offSwitch.logRowsAddedAfter = (await readLogRows(secondId)).length - before;
  }

  const failure = {};

  {
    const good = secondVars.get('CRM_ANALYTICS_TRACKING_START_AT');

    secondVars.set('CRM_ANALYTICS_TRACKING_START_AT', 'not-a-date');
    await setClock(nowMs + MINUTE_MS);

    try {
      await runSync(secondId);
      failure.didThrow = false;
    } catch {
      failure.didThrow = true;
    } finally {
      secondVars.set('CRM_ANALYTICS_TRACKING_START_AT', good);
    }

    const failedRow = (await readLogRows(secondId, 'sync')).at(-1);

    failure.status = failedRow?.status;
    failure.errorMessage = failedRow?.error_message ?? '';

    await setClock(nowMs + 2 * MINUTE_MS);
    await runSync(secondId);
    failure.statusAfter = (await readLogRows(secondId, 'sync')).at(-1)?.status;
  }

  const syncState = {};

  {
    const anHourLater = nowMs + 2 * MINUTE_MS + 61 * MINUTE_MS;

    await setClock(anHourLater);
    syncState.isStaleAfterAnHour = (await metaService().getMeta(secondId)).sync.isStale;
    await runDaily(secondId);
    syncState.isStaleAfterDaily = (await metaService().getMeta(secondId)).sync.isStale;

    await query(
      `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, status) VALUES ($1, 'sync', $2, 'running')`,
      [secondId, new Date(anHourLater - 5 * MINUTE_MS)],
    );
    syncState.statusWithYoungRunningRow = (await metaService().getMeta(secondId)).sync.lastAttemptStatus;

    await query(
      `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, status) VALUES ($1, 'sync', $2, 'running')`,
      [secondId, new Date(anHourLater - 40 * MINUTE_MS)],
    );
    syncState.statusWithOldRunningRow = (await metaService().getMeta(secondId)).sync.lastAttemptStatus;

    await setClock(nowMs);
  }

  // The safety rule, as a stranger would hit it: a fresh process, no database needed.
  const asGuardResult = ({ status, stderr }) => ({
    status,
    refused: String(stderr).includes('Refused'),
  });
  const guards = {
    otherHost: asGuardResult(runLoaderCommand(['--host', 'db.example.com'])),
    otherHostCrm: asGuardResult(runLoaderCommand(['--crm', '--i-am-local', '--host', 'crm.flolabs.example'])),
    crmWithoutFlag: asGuardResult(runLoaderCommand(['--crm'])),
    otherHostInEnvironment: asGuardResult(runLoaderCommand([], { ANALYTICS_TEST_PG_HOST: '10.0.0.5' })),
    crmDatabaseAsSeed: asGuardResult(runLoaderCommand([], { ANALYTICS_SEED_DATABASE: 'default' })),
  };

  // Personal data: every analytics table as text, then page payloads.
  const tableRows = [];

  for (const table of ['stage_transition', 'daily_snapshot', 'report', 'sync_log']) {
    const rows = await query(`SELECT t::text AS row FROM analytics.${table} t`);

    tableRows.push(...rows.map(({ row }) => ({ table, row: row.toLowerCase() })));
  }

  const SENTINELS = [NAME_SENTINEL, ANSWER_SENTINEL, EMAIL_DOMAIN_SENTINEL, SECOND_WORKSPACE_SENTINEL];
  const pagePayloads = {
    overview: rawOverview,
    funnel: await reader.getFunnel(mainWorkspaceId, {}),
    track: await reader.getCategories(mainWorkspaceId, 'TRACK_PROGRAM', {}),
    source: await reader.getCategories(mainWorkspaceId, 'SOURCE', {}),
    trends: await reader.getTrends(mainWorkspaceId, 'NEW_APPLICATIONS', null, {}),
    meta: await metaService().getMeta(mainWorkspaceId),
    reports: await reportService().listReports(mainWorkspaceId),
    report: await reportService().getReport({ workspaceId: mainWorkspaceId, periodType: 'WEEK', periodStart: '2026-11-09' }),
  };
  const payloadText = (replacer) =>
    Object.entries(pagePayloads).map(([name, payload]) => ({
      name,
      text: JSON.stringify(payload, replacer).toLowerCase(),
    }));
  const hasCrmSentinels = await (async () => {
    const [{ names }] = await query(`SELECT count(*)::int AS names FROM ${mainWorkspace.tables.person} WHERE "nameFirstName" ILIKE $1`, [`%${NAME_SENTINEL}%`]);
    const [{ emails }] = await query(`SELECT count(*)::int AS emails FROM ${mainWorkspace.tables.person} WHERE "emailsPrimaryEmail" ILIKE $1`, [`%${EMAIL_DOMAIN_SENTINEL}`]);
    const [{ answers }] = await query(`SELECT count(*)::int AS answers FROM ${mainWorkspace.tables.submission} WHERE answers::text ILIKE $1`, [`%${ANSWER_SENTINEL}%`]);

    return names > 0 && emails > 0 && answers > 0;
  })();
  const leaks = {
    tables: tableRows
      .filter(({ row }) => SENTINELS.some((sentinel) => row.includes(sentinel)))
      .map(({ table, row }) => `${table}: ${row.slice(0, 120)}`),
    payloadEmailsAndAnswers: payloadText()
      .filter(({ text }) => text.includes(ANSWER_SENTINEL) || text.includes(EMAIL_DOMAIN_SENTINEL))
      .map(({ name }) => name),
    // Stuck rows show a name by design, read live, so that one field is left out.
    payloadNames: payloadText((key, value) => (key === 'displayName' ? undefined : value))
      .filter(({ text }) => text.includes(NAME_SENTINEL))
      .map(({ name }) => name),
    secondInMainPayloads: payloadText()
      .filter(({ text }) => text.includes(SECOND_WORKSPACE_SENTINEL))
      .map(({ name }) => name),
    crmHasSentinels: hasCrmSentinels,
  };

  const finalTransitions = await readTransitions(mainWorkspaceId);
  const finalByPerson = groupByPerson(finalTransitions);
  const snapshots = await readSnapshots(mainWorkspaceId);
  const context = {
    observed,
    overview,
    rawOverview,
    funnel: await funnelOf({}),
    track: await categoriesOf('TRACK_PROGRAM', {}),
    source: await categoriesOf('SOURCE', {}),
    meta: await metaService().getMeta(mainWorkspaceId),
    others,
    zone,
    offSwitch,
    failure,
    syncState,
    guards,
    leaks,
    noLimits,
    signedWhenOn,
    reportKeys,
    query,
    workspaceId: mainWorkspaceId,
    ignoredRowIds: mainSeed.ignoredRows.map((row) => row.id),
    personIdOf,
    keyOfPerson: (id) => keyById.get(id),
    stepsOf,
    stuckOf,
    enteredAge: (key, stageKey) => (nowMs - productEntered[key]?.[stageKey]) / DAY_MS,
    ageOf: (value) => {
      const minutes = Math.round((nowMs - new Date(value).getTime()) / MINUTE_MS);

      return `${Math.floor(minutes / 1440)}d${minutes % 1440}m`;
    },
    transitionsOf: (key) => finalByPerson[key] ?? [],
    snapshotOn: (date) => snapshots[date] ?? {},
    logRow: (stepId) => observed.logByStep[stepId],
    readReportRows: () => readReportRows(),
    overviewOf,
    funnelOf,
    categoriesOf,
    trendsOf,
    reportOf,
    withMinimumSample,
  };

  for (const [useCases, title, work] of USE_CASE_CHECKS) {
    await check(`U-${useCases.join('+')}`, title, useCases, (t) => work(t, context));
  }

  // Every use case needs a row of data and an assertion that ran.
  const seedTags = new Set([
    ...MAIN_PEOPLE.flatMap((person) => person.useCases),
    ...MAIN_SUBMISSIONS.flatMap((row) => row.useCases),
    ...MAIN_APPLICATIONS.flatMap((row) => row.useCases),
    ...IGNORED_TIMELINE_ROWS.flatMap((row) => row.useCases),
    ...Object.values(OTHER_WORKSPACES).flatMap((workspace) => [
      ...workspace.people.flatMap((person) => person.useCases),
      ...(workspace.submissions ?? []).flatMap((row) => row.useCases),
      ...(workspace.setupUseCases ?? []),
    ]),
    ...Object.keys(SETUP_USE_CASES),
  ]);
  const knownIds = new Set(USE_CASES.map((useCase) => useCase.id));
  const coverage = {
    withoutSeedRow: USE_CASES.filter((useCase) => !seedTags.has(useCase.id)).map((useCase) => useCase.id),
    withoutAssertion: USE_CASES.filter((useCase) => !recorder.coveredUseCases.has(useCase.id)).map((useCase) => useCase.id),
    unknownTags: [...seedTags, ...recorder.coveredUseCases].filter((id) => !knownIds.has(id)),
  };

  await check('COVERAGE', 'Every use case has a seed row and an assertion', [], async (t) => {
    t.equal('use cases without a seed row', coverage.withoutSeedRow, []);
    t.equal('use cases without an assertion', coverage.withoutAssertion, []);
    t.equal('tags with no use case', [...new Set(coverage.unknownTags)], []);
  });

  await opened.close();

  const peopleCount = Object.values(seed.workspaces).reduce(
    (total, workspace) => total + workspace.people.length,
    0,
  );

  finish({
    peopleCount,
    mainPeopleCount: MAIN_PEOPLE.length,
    coverage,
    correctedInExpected: CORRECTED_IN_EXPECTED,
    statementCount: services.timing?.count,
    statementSeconds: Math.round((services.timing?.totalMs ?? 0) / 1000),
    missingAnalyticsModules: [...loader.missingAnalyticsModules],
    notes: [...new Set(services.notes)],
    unknownDependencies: [...services.unknownDependencies],
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
