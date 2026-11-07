'use strict';
// The live layer's handle on the running local CRM. Changes go through the real API, as a
// user's would. The local database is only for reading what came of them, and for the
// backdating and off switch that contract section 9 does there. Local only, Apple only.
const { createRequire } = require('node:module');
const path = require('node:path');

const {
  RefusedTargetError,
  assertLocalCrmDatabaseName,
  assertLocalDatabaseHost,
} = require('../../lib/local-only.cjs');
const {
  ADMIN_EMAIL,
  callAnalytics,
  createApiKey,
  getApiUrl,
  login,
  postGraphql,
} = require('../../blackbox/lib/api-client.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const repoRequire = createRequire(path.join(REPO_ROOT, 'package.json'));

const WORKSPACE_DISPLAY_NAME = 'Apple';
const MAXIMUM_EXISTING_PEOPLE = 5000;
const WORKSPACE_QUEUE = 'workspace-queue';
const EVENTS_QUEUE = 'entity-events-to-db-queue';
const SYNC_JOB = 'CrmAnalyticsWorkspaceSyncJob';
const DAILY_JOB = 'CrmAnalyticsWorkspaceDailyJob';
const DISABLED_KEY = 'CRM_ANALYTICS_DISABLED';
const POLL_INTERVAL_MS = 300;
const TIMELINE_WAIT_MS = 45_000;
const JOB_WAIT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const databaseConfig = () => ({
  host: assertLocalDatabaseHost(process.env.ANALYTICS_TEST_PG_HOST ?? 'localhost'),
  port: Number(process.env.ANALYTICS_TEST_PG_PORT ?? 5432),
  user: process.env.ANALYTICS_TEST_PG_USER ?? 'postgres',
  password: process.env.ANALYTICS_TEST_PG_PASSWORD ?? 'postgres',
  database: assertLocalCrmDatabaseName(
    process.env.ANALYTICS_TEST_CRM_DATABASE ?? 'default',
  ),
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
});

const redisConfig = () => ({
  host: assertLocalDatabaseHost(process.env.ANALYTICS_TEST_REDIS_HOST ?? 'localhost'),
  port: Number(process.env.ANALYTICS_TEST_REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
  connectTimeout: CONNECT_TIMEOUT_MS,
});

// Before anything connects, so a setting cannot reach another machine even for a moment.
const assertLiveTargetsAreLocal = () => {
  databaseConfig();
  redisConfig();
};

const workspaceSchemaName = (workspaceId) =>
  `workspace_${BigInt(`0x${workspaceId.replace(/-/g, '')}`).toString(36)}`;

const firstErrorOf = (body) => body?.errors?.[0]?.message ?? 'no data in the response';

const openQueue = (name) => {
  const { Queue } = repoRequire('bullmq');

  return new Queue(name, { connection: redisConfig() });
};

const countWorkers = async (queueName) => {
  const queue = openQueue(queueName);

  try {
    return (await queue.getWorkers()).length;
  } finally {
    await queue.close();
  }
};

const openDatabase = async () => {
  const { Pool } = repoRequire('pg');
  const pool = new Pool({ ...databaseConfig(), max: 3 });
  const query = async (sql, parameters = []) =>
    (await pool.query(sql, parameters)).rows;

  const workspaces = await query(
    `SELECT id FROM core.workspace WHERE "displayName" = $1`,
    [WORKSPACE_DISPLAY_NAME],
  );

  if (workspaces.length !== 1) {
    await pool.end();

    throw new Error(
      `the local CRM has ${workspaces.length} workspaces named ${WORKSPACE_DISPLAY_NAME}, expected the seed's one`,
    );
  }

  const workspaceId = workspaces[0].id;
  const schema = workspaceSchemaName(workspaceId);
  const [{ count }] = await query(`SELECT count(*)::int AS count FROM "${schema}".person`);

  if (count > MAXIMUM_EXISTING_PEOPLE) {
    await pool.end();

    throw new RefusedTargetError(
      `Refused: ${count} people in the ${WORKSPACE_DISPLAY_NAME} workspace looks like real data, not the seed.`,
    );
  }

  return { pool, query, workspaceId, schema };
};

// Returns null when the local database and Redis answer, else the exact reason they do not.
const checkDatabaseAndRedis = async () => {
  let database;

  try {
    database = await openDatabase();
  } catch (error) {
    if (error instanceof RefusedTargetError) {
      throw error;
    }

    return `The local CRM database cannot be used: ${error?.code ?? error?.message}. Start Docker and seed it, see README.md.`;
  } finally {
    await database?.pool.end();
  }

  try {
    await Promise.race([
      countWorkers(WORKSPACE_QUEUE),
      sleep(CONNECT_TIMEOUT_MS * 2).then(() => {
        throw new Error('no answer');
      }),
    ]);

    return null;
  } catch (error) {
    return `Redis is not reachable on localhost (${error?.message}). Start it: docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d redis`;
  }
};

// Returns null when the live layer can run, else the exact reason it cannot.
const checkLiveStack = async () => {
  const problem = await checkDatabaseAndRedis();

  if (problem !== null) {
    return problem;
  }

  const [workspaceWorkers, eventWorkers] = await Promise.all([
    countWorkers(WORKSPACE_QUEUE),
    countWorkers(EVENTS_QUEUE),
  ]);

  return workspaceWorkers === 0 || eventWorkers === 0
    ? 'The CRM worker is not running, so no timeline row or job can happen. Start it: node dist/queue-worker/queue-worker.js in packages/twenty-server.'
    : null;
};

const openLocalCrm = async () => {
  const { pool, query, workspaceId, schema } = await openDatabase();
  const token = await login(ADMIN_EMAIL);
  const workspaceQueue = openQueue(WORKSPACE_QUEUE);
  const createdPeople = new Set();
  const startedAt = new Date();
  const timelineTable = `"${schema}"."timelineActivity"`;
  const personTable = `"${schema}".person`;

  const core = async (graphqlQuery, variables = {}) => {
    const { body } = await postGraphql({
      path: '/graphql',
      token,
      query: graphqlQuery,
      variables,
    });

    if (body?.errors?.length > 0 || body?.data === undefined) {
      throw new Error(firstErrorOf(body));
    }

    return body.data;
  };

  const metadata = async (graphqlQuery, variables = {}) => {
    const { body } = await postGraphql({
      path: '/metadata',
      token,
      query: graphqlQuery,
      variables,
    });

    if (body?.errors?.length > 0 || body?.data === undefined) {
      throw new Error(firstErrorOf(body));
    }

    return body.data;
  };

  const analytics = async (queryName, variables = {}) => {
    const { errors, payload } = await callAnalytics(queryName, variables, token);

    if (errors.length > 0) {
      throw new Error(`${queryName}: ${errors[0].message}`);
    }

    return payload;
  };

  let personCounter = 0;

  const uniqueEmail = () =>
    `analytics-live-${Date.now()}-${(personCounter += 1)}@example.com`;

  const createPerson = async ({ stage = null, email = uniqueEmail() }) => {
    const { createPerson: person } = await core(
      `mutation ($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
      {
        data: {
          name: { firstName: 'Analytics', lastName: `Live ${personCounter}` },
          emails: { primaryEmail: email, additionalEmails: null },
          ...(stage === null ? {} : { stage }),
        },
      },
    );

    createdPeople.add(person.id);

    return { id: person.id, email };
  };

  const setStage = async (personId, stage) => {
    await core(
      `mutation ($id: UUID!, $data: PersonUpdateInput!) { updatePerson(id: $id, data: $data) { id } }`,
      { id: personId, data: { stage } },
    );
  };

  const setStageForMany = async (personIds, stage) => {
    await core(
      `mutation ($filter: PersonFilterInput!, $data: PersonUpdateInput!) { updatePeople(filter: $filter, data: $data) { id } }`,
      { filter: { id: { in: personIds } }, data: { stage } },
    );
  };

  // The call the CSV import makes: a batch with upsert, matching on the record id.
  const importPeople = async (rows) => {
    const { createPeople } = await core(
      `mutation ($data: [PersonCreateInput!]!, $upsert: Boolean) { createPeople(data: $data, upsert: $upsert) { id } }`,
      { data: rows, upsert: true },
    );

    for (const { id } of createPeople) {
      createdPeople.add(id);
    }

    return createPeople;
  };

  const mergePeople = async (personIds) => {
    const { mergePeople: merged } = await core(
      `mutation ($ids: [UUID!]!, $conflictPriorityIndex: Int!) { mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex, dryRun: false) { id } }`,
      { ids: personIds, conflictPriorityIndex: 0 },
    );

    return merged;
  };

  const readPersonStage = async (personId) => {
    const rows = await query(
      `SELECT stage, "deletedAt" FROM ${personTable} WHERE id = $1`,
      [personId],
    );

    return rows[0];
  };

  const timelineRows = (personId) =>
    query(
      `SELECT id, properties, "happensAt", "createdAt", "updatedAt", "workspaceMemberId", "targetPersonId", "linkedRecordId"
       FROM ${timelineTable} WHERE "targetPersonId" = $1 ORDER BY "createdAt", id`,
      [personId],
    );

  const stageRowsOf = async (personId) =>
    (await timelineRows(personId)).filter(
      (row) => row.properties?.diff?.stage !== undefined,
    );

  // Timeline rows come from a queue, a moment after the change.
  const waitForStageRow = async (
    personId,
    isExpected,
    description,
    timeoutMs = TIMELINE_WAIT_MS,
  ) => {
    const deadline = Date.now() + timeoutMs;
    let rows = [];

    while (Date.now() < deadline) {
      rows = await stageRowsOf(personId);

      if (isExpected(rows)) {
        return rows;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `No timeline row for ${description} within ${timeoutMs} ms. Rows now: ${JSON.stringify(rows.map((row) => row.properties))}`,
    );
  };

  const waitForRowEndingAt = (personId, after) =>
    waitForStageRow(
      personId,
      (rows) => rows.at(-1)?.properties.diff.stage.after === after,
      `a stage change to ${after}`,
    );

  const waitForAnyRow = async (personId, timeoutMs = TIMELINE_WAIT_MS) => {
    const deadline = Date.now() + timeoutMs;
    let rows = [];

    while (Date.now() < deadline) {
      rows = await timelineRows(personId);

      if (rows.length > 0) {
        return rows;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`No timeline row at all for ${personId} within ${timeoutMs} ms`);
  };

  const hasAnalyticsSchema = async () =>
    (await query(`SELECT 1 FROM pg_namespace WHERE nspname = 'analytics'`)).length > 0;

  const transitions = async (personId) => {
    if (!(await hasAnalyticsSchema())) {
      return [];
    }

    return query(
      `SELECT from_stage AS "from", to_stage AS "to", origin, source_id AS "sourceId", happened_at AS "happenedAt", source_updated_at AS "sourceUpdatedAt"
       FROM analytics.stage_transition
       WHERE workspace_id = $1 AND person_id = $2
       ORDER BY source_updated_at, happened_at`,
      [workspaceId, personId],
    );
  };

  const moves = async (personId) =>
    (await transitions(personId)).map(
      ({ from, to, origin }) => `${from}>${to} ${origin}`,
    );

  const runJob = async (jobName) => {
    const job = await workspaceQueue.add(jobName, { workspaceId });
    const deadline = Date.now() + JOB_WAIT_MS;

    while (Date.now() < deadline) {
      const state = await job.getState();

      if (state === 'completed' || state === 'unknown') {
        return;
      }

      if (state === 'failed') {
        const { Job } = repoRequire('bullmq');
        const finished = await Job.fromId(workspaceQueue, job.id);

        throw new Error(`${jobName} failed: ${finished?.failedReason}`);
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`${jobName} did not finish within ${JOB_WAIT_MS} ms. Is the worker busy?`);
  };

  const runSync = () => runJob(SYNC_JOB);
  const runDaily = () => runJob(DAILY_JOB);

  // Reconcile leaves alone anyone changed in the last 30 minutes, as their job may be pending.
  const backdatePersonUpdate = (personId) =>
    query(
      `UPDATE ${personTable} SET "updatedAt" = now() - interval '31 minutes' WHERE id = $1`,
      [personId],
    );

  // The CRM merges into a row created in the last 10 minutes, so this ages it past that.
  const ageTimelineRows = (personId, minutes) =>
    query(
      `UPDATE ${timelineTable} SET "createdAt" = "createdAt" - make_interval(mins => $2), "happensAt" = "happensAt" - make_interval(mins => $2)
       WHERE "targetPersonId" = $1`,
      [personId, minutes],
    );

  const setOffSwitch = async (isOff) => {
    await query(
      `DELETE FROM core."keyValuePair" WHERE key = $1 AND "workspaceId" = $2 AND "userId" IS NULL`,
      [DISABLED_KEY, workspaceId],
    );

    if (isOff) {
      await query(
        `INSERT INTO core."keyValuePair" (key, value, "workspaceId", type) VALUES ($1, 'true'::jsonb, $2, 'USER_VARIABLE')`,
        [DISABLED_KEY, workspaceId],
      );
    }
  };

  const syncLogCount = async () => {
    if (!(await hasAnalyticsSchema())) {
      return 0;
    }

    const [{ count }] = await query(
      `SELECT count(*)::int AS count FROM analytics.sync_log WHERE workspace_id = $1`,
      [workspaceId],
    );

    return count;
  };

  // Makes the last sync look older than the stale limit, and gives back a way to undo it.
  const ageSyncLog = async (minutes) => {
    const rows = await query(
      `UPDATE analytics.sync_log
       SET started_at = started_at - make_interval(mins => $2), finished_at = finished_at - make_interval(mins => $2)
       WHERE workspace_id = $1 AND finished_at > now() - make_interval(mins => $2)
       RETURNING id`,
      [workspaceId, minutes],
    );
    const ids = rows.map(({ id }) => id);

    return () =>
      query(
        `UPDATE analytics.sync_log
         SET started_at = started_at + make_interval(mins => $2), finished_at = finished_at + make_interval(mins => $2)
         WHERE id = ANY($1::uuid[])`,
        [ids, minutes],
      );
  };

  const readObjects = async () => {
    const { objects } = await metadata(
      `query { objects(paging: { first: 1000 }) { edges { node { id nameSingular fieldsList { id name type isAuditLogged options } } } } }`,
    );

    return objects.edges.map(({ node }) => node);
  };

  const readStageField = async () =>
    (await readObjects())
      .find(({ nameSingular }) => nameSingular === 'person')
      ?.fieldsList.find(({ name }) => name === 'stage');

  const updateStageOptions = async (fieldId, options) => {
    await metadata(
      `mutation ($id: UUID!, $update: UpdateFieldInput!) { updateOneField(input: { id: $id, update: $update }) { id } }`,
      { id: fieldId, update: { options } },
    );
  };

  // Any stage this layer moves people through, added to the real field if it is missing.
  const ensureStageOptions = async (values) => {
    const field = await readStageField();

    if (field === undefined) {
      return { problem: 'the Apple workspace has no Stage field on People' };
    }

    const missing = values.filter(
      (value) => !field.options.some((option) => option.value === value),
    );

    if (missing.length > 0) {
      await updateStageOptions(field.id, [
        ...field.options,
        ...missing.map((value, index) => ({
          value,
          label: value,
          color: 'gray',
          position: field.options.length + index,
        })),
      ]);
    }

    return { field: await readStageField() };
  };

  const hasFormObjects = async () => {
    const names = (await readObjects()).map(({ nameSingular }) => nameSingular);

    return names.includes('crmForm') && names.includes('formSubmission');
  };

  const createPublishedForm = async (definition) => {
    const { createCrmForm } = await core(
      `mutation ($data: CrmFormCreateInput!) { createCrmForm(data: $data) { id } }`,
      {
        data: {
          name: `Analytics live ${Date.now()}`,
          status: 'PUBLISHED',
          definition,
        },
      },
    );

    return createCrmForm.id;
  };

  const destroyForm = (formId) =>
    core(`mutation ($id: UUID!) { destroyCrmForm(id: $id) { id } }`, { id: formId });

  const submitPublicForm = async (formId, answers) => {
    const response = await fetch(`${getApiUrl()}/forms/${workspaceId}/${formId}`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: JSON.stringify(answers) }),
    });

    if (!response.ok) {
      throw new Error(`form submit answered ${response.status}: ${await response.text()}`);
    }
  };

  const withApiKey = async (work) => {
    const apiKey = await createApiKey(token);

    if (apiKey.token === undefined) {
      return { problem: apiKey.problem };
    }

    try {
      return { value: await work(apiKey.token) };
    } finally {
      await apiKey.revoke();
    }
  };

  const patchPersonWithApiKey = async (apiKeyToken, personId, data) => {
    const response = await fetch(`${getApiUrl()}/rest/people/${personId}`, {
      method: 'PATCH',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKeyToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`PATCH answered ${response.status}: ${await response.text()}`);
    }
  };

  // Leaves the local CRM as it was: the seed's numbers must not move because this ran.
  const cleanUp = async () => {
    const personIds = [...createdPeople];

    await setOffSwitch(false);

    if (personIds.length > 0) {
      await core(
        `mutation ($filter: PersonFilterInput!) { destroyPeople(filter: $filter) { id } }`,
        { filter: { id: { in: personIds } } },
      ).catch(() => undefined);

      if (await hasAnalyticsSchema()) {
        await query(
          `DELETE FROM analytics.stage_transition WHERE workspace_id = $1 AND person_id = ANY($2::uuid[])`,
          [workspaceId, personIds],
        );
      }
    }

    if (await hasAnalyticsSchema()) {
      await query(
        `DELETE FROM analytics.report WHERE workspace_id = $1 AND generated_at >= $2`,
        [workspaceId, startedAt],
      );
    }
  };

  const close = async () => {
    await workspaceQueue.close();
    await pool.end();
  };

  return {
    workspaceId,
    token,
    query,
    core,
    analytics,
    createPerson,
    setStage,
    setStageForMany,
    importPeople,
    mergePeople,
    readPersonStage,
    timelineRows,
    stageRowsOf,
    waitForStageRow,
    waitForRowEndingAt,
    waitForAnyRow,
    transitions,
    moves,
    runSync,
    runDaily,
    backdatePersonUpdate,
    ageTimelineRows,
    setOffSwitch,
    syncLogCount,
    ageSyncLog,
    readStageField,
    updateStageOptions,
    ensureStageOptions,
    hasFormObjects,
    createPublishedForm,
    destroyForm,
    submitPublicForm,
    withApiKey,
    patchPersonWithApiKey,
    trackPerson: (personId) => createdPeople.add(personId),
    cleanUp,
    close,
  };
};

module.exports = {
  assertLiveTargetsAreLocal,
  checkDatabaseAndRedis,
  checkLiveStack,
  countWorkers,
  openDatabase,
  openLocalCrm,
  openQueue,
};
