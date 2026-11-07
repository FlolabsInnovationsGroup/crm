#!/usr/bin/env node
// Loads the demo data into the Apple workspace of the local CRM database. See README.md.
//   node load.mjs --i-am-local [--stage people|snapshots]
//
// The target is checked before anything connects, and port and credentials are fixed, so no
// setting can aim this at another machine.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_ID_PREFIX, buildDemo, readRealCode } from './generate.mjs';

const require = createRequire(import.meta.url);
const {
  RefusedTargetError,
  assertLocalCrmDatabaseName,
  assertLocalDatabaseHost,
} = require('../lib/local-only.cjs');

const CRM_DATABASE = 'default';
const CRM_WORKSPACE_DISPLAY_NAME = 'Apple';
// Production holds about 43,000 people, so a target that only looks local still stops here.
const CRM_MAXIMUM_EXISTING_PEOPLE = 5000;
const TRACKING_START_KEY = 'CRM_ANALYTICS_TRACKING_START_AT';
const DEMO_ID_PATTERN = `${DEMO_ID_PREFIX}-%`;
const SEED_ID_PATTERN = '5eed0001-%';
const STAGES = ['people', 'snapshots'];
const DAY_MILLISECONDS = 86_400_000;
const INSERT_BATCH_SIZE = 2000;
// The daily cron, 30 2 * * *: a snapshot holds what the CRM held at this time on its date.
const SNAPSHOT_HOUR_UTC = 2;
const SNAPSHOT_MINUTE_UTC = 30;

const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;

const resolveConnection = () => ({
  host: assertLocalDatabaseHost(process.env.ANALYTICS_TEST_PG_HOST ?? 'localhost'),
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: assertLocalCrmDatabaseName(CRM_DATABASE),
  connectionTimeoutMillis: 5000,
});

export const openWorkspace = async (query) => {
  const { loader } = readRealCode();
  const { getWorkspaceSchemaName } = loader.real(
    'src/engine/workspace-datasource/utils/get-workspace-schema-name.util',
  );
  const [workspace] = await query(`SELECT id FROM core.workspace WHERE "displayName" = $1`, [
    CRM_WORKSPACE_DISPLAY_NAME,
  ]);

  if (workspace === undefined) {
    throw new Error(`No workspace named ${CRM_WORKSPACE_DISPLAY_NAME}. Reset the local database first.`);
  }

  const schema = getWorkspaceSchemaName(workspace.id);
  const qualify = (table) => `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const [{ total }] = await query(`SELECT count(*)::int AS total FROM ${qualify('person')}`);

  if (total > CRM_MAXIMUM_EXISTING_PEOPLE) {
    throw new RefusedTargetError(
      `Refused: this workspace holds ${total} people, far more than the local demo workspace. It does not look local.`,
    );
  }

  return {
    workspaceId: workspace.id,
    schema,
    tables: {
      person: qualify('person'),
      timeline: qualify('timelineActivity'),
      form: qualify('_crmForm'),
      submission: qualify('_formSubmission'),
      application: qualify('_application'),
    },
    positionsEnum: `${quoteIdentifier(schema)}.${quoteIdentifier('person_positionsAppliedFor_enum')}`,
  };
};

const tableExists = async ({ query, table }) =>
  (await query(`SELECT to_regclass($1) IS NOT NULL AS found`, [table]))[0].found;

// This never creates a field or an enum value, because the CRM's metadata would stop
// matching its columns. fields.mjs says what the fields need.
export const assertCrmIsReady = async ({ query, schema, demo }) => {
  const writtenColumns = {
    person: ['id', 'nameFirstName', 'nameLastName', 'emailsPrimaryEmail', 'stage', 'positionsAppliedFor', 'applicantSource', 'createdAt', 'updatedAt'],
    timelineActivity: ['id', 'targetPersonId', 'properties', 'happensAt', 'timelineActivityTypeId', 'timelineActivityTypeSnapshot', 'createdAt', 'updatedAt'],
    _crmForm: ['id', 'name', 'status'],
    _formSubmission: ['id', 'name', 'formId', 'personId', 'submittedAt', 'answers', 'createdAt', 'updatedAt'],
  };
  const problems = [];

  for (const [table, written] of Object.entries(writtenColumns)) {
    const columns = await query(
      `SELECT column_name, is_nullable, column_default, is_generated FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    const names = new Set(columns.map((column) => column.column_name));

    for (const column of written) {
      if (!names.has(column)) {
        problems.push(`missing column ${table}.${column}`);
      }
    }

    for (const column of columns) {
      if (
        column.is_nullable === 'NO' &&
        column.column_default === null &&
        column.is_generated === 'NEVER' &&
        !written.includes(column.column_name)
      ) {
        problems.push(`this loader does not fill the required column ${table}.${column.column_name}`);
      }
    }
  }

  const needed = {
    person_stage_enum: demo.people.flatMap((person) => [
      person.initialStage,
      ...person.changes.map((change) => change.after),
    ]),
    person_positionsAppliedFor_enum: demo.people.flatMap((person) => person.positions),
    person_applicantSource_enum: demo.people.map((person) => person.source).filter((value) => value !== null),
  };

  for (const [enumName, values] of Object.entries(needed)) {
    const present = new Set(
      (
        await query(
          `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = $1 AND t.typname = $2`,
          [schema, enumName],
        )
      ).map((row) => row.enumlabel),
    );

    for (const value of new Set(values)) {
      if (!present.has(value)) {
        problems.push(`missing option ${enumName}: ${value}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Run setup-seed-objects.mjs first (see README.md):\n  ${problems.join('\n  ')}`);
  }
};

// The snapshot a row carries, as toResolvedTimelineActivityType builds it.
export const readTimelineTypes = async ({ query, workspaceId }) => {
  const rows = await query(
    `SELECT id, "universalIdentifier", name, label, action, icon, "objectUniversalIdentifier", "frontComponentUniversalIdentifier"
     FROM core."timelineActivityType"
     WHERE "workspaceId" = $1 AND name IN ('recordCreated', 'recordUpdated') AND "objectUniversalIdentifier" IS NULL`,
    [workspaceId],
  );
  const find = (name) => {
    const row = rows.find((candidate) => candidate.name === name);

    if (row === undefined) {
      throw new Error(`The workspace has no timeline activity type ${name}.`);
    }

    return row;
  };

  return { created: find('recordCreated'), updated: find('recordUpdated') };
};

export const removeEarlierRows = async ({ query, tables, hasApplicationTable }) => {
  for (const pattern of [DEMO_ID_PATTERN, SEED_ID_PATTERN]) {
    // By form too: a submission made through a seed form would block removing that form.
    await query(`DELETE FROM ${tables.submission} WHERE id::text LIKE $1 OR "formId"::text LIKE $1`, [pattern]);

    for (const table of [tables.timeline, tables.form, tables.person, ...(hasApplicationTable ? [tables.application] : [])]) {
      await query(`DELETE FROM ${table} WHERE id::text LIKE $1`, [pattern]);
    }
  }
};

export const insertDemoRows = async ({ query, tables, positionsEnum, demo, timelineTypes }) => {
  const insertTimelineRow = ({ id, personId, type, properties, atMs }) =>
    query(
      `INSERT INTO ${tables.timeline} (id, "targetPersonId", "timelineActivityTypeId", "timelineActivityTypeSnapshot", properties, "happensAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6, $6)`,
      [id, personId, type.id, JSON.stringify(type), JSON.stringify(properties), new Date(atMs)],
    );

  for (const form of Object.values(demo.forms)) {
    await query(`INSERT INTO ${tables.form} (id, name, status) VALUES ($1, $2, 'PUBLISHED')`, [form.id, form.name]);
  }

  for (const person of demo.people) {
    await query(
      `INSERT INTO ${tables.person} (id, "nameFirstName", "nameLastName", "emailsPrimaryEmail", stage, "applicantSource", "positionsAppliedFor", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[]::${positionsEnum}[], $8, $9)`,
      [
        person.id,
        person.firstName,
        person.lastName,
        person.email,
        person.stage,
        person.source,
        person.positions,
        new Date(person.createdAtMs),
        new Date(person.updatedAtMs),
      ],
    );

    // Creation stores no diff, so the first stage is only ever read from the person row.
    await insertTimelineRow({
      id: person.creationRowId,
      personId: person.id,
      type: timelineTypes.created,
      properties: {},
      atMs: person.createdAtMs,
    });

    for (const change of person.changes) {
      await insertTimelineRow({
        id: change.id,
        personId: person.id,
        type: timelineTypes.updated,
        properties: { diff: { stage: { before: change.before, after: change.after } } },
        atMs: change.atMs,
      });
    }
  }

  for (const submission of demo.submissions) {
    const submittedAt = new Date(submission.submittedAtMs);

    await query(
      `INSERT INTO ${tables.submission} (id, name, "formId", "personId", "submittedAt", answers, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $5, $5)`,
      [
        submission.id,
        submission.name,
        submission.formId,
        submission.personId,
        submittedAt,
        JSON.stringify(submission.answers),
      ],
    );
  }
};

export const finishPeopleStage = async ({ query, tables, workspaceId, trackingStartMs }) => {
  await query(`UPDATE ${tables.person} SET "deletedAt" = now() WHERE id::text NOT LIKE $1 AND "deletedAt" IS NULL`, [
    DEMO_ID_PATTERN,
  ]);
  await query(`DELETE FROM core."keyValuePair" WHERE "key" = $1 AND "workspaceId" = $2 AND "userId" IS NULL`, [
    TRACKING_START_KEY,
    workspaceId,
  ]);
  await query(
    `INSERT INTO core."keyValuePair" ("key", "value", "workspaceId", "type") VALUES ($1, $2::jsonb, $3, 'USER_VARIABLE')`,
    [TRACKING_START_KEY, JSON.stringify(new Date(trackingStartMs).toISOString()), workspaceId],
  );
};

const loadPeople = async ({ query, workspace }) => {
  const { tables, schema, workspaceId, positionsEnum } = workspace;
  const demo = buildDemo();

  await assertCrmIsReady({ query, schema, demo });

  const timelineTypes = await readTimelineTypes({ query, workspaceId });
  const hasApplicationTable = await tableExists({ query, table: tables.application });

  await query('BEGIN');
  await removeEarlierRows({ query, tables, hasApplicationTable });
  await insertDemoRows({ query, tables, positionsEnum, demo, timelineTypes });
  await finishPeopleStage({ query, tables, workspaceId, trackingStartMs: demo.trackingStartMs });
  // A stored transition is never rewritten, so old rows would keep counting.
  await query('DROP SCHEMA IF EXISTS analytics CASCADE');
  await query('COMMIT');

  console.log(`Loaded ${demo.people.length} people and ${demo.submissions.length} submissions into workspace ${workspaceId}.`);
  console.log(`Tracking start is ${new Date(demo.trackingStartMs).toISOString()}. Next steps are in README.md.`);
};

// The same rows the real snapshot statement groups for one moment, for people as they stood then.
export const buildSnapshotRows = ({ people, trackByPosition }) => {
  const counts = new Map();
  const add = (dimension, dimensionKey, stage) => {
    const key = JSON.stringify([dimension, dimensionKey, stage]);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const person of people) {
    const stage = person.stage ?? '';
    const positions = [...new Set(person.positions)];

    add('all', '', stage);
    add('source', person.source === null || person.source === '' ? 'NONE' : person.source, stage);

    if (positions.length === 0) {
      add('position', 'NONE', stage);
      add('track', 'NONE', stage);
    }

    for (const position of positions) {
      add('position', position, stage);
    }

    if (positions.length > 0) {
      for (const track of new Set(positions.map((position) => trackByPosition.get(position) ?? 'UNMAPPED'))) {
        add('track', track, stage);
      }
    }
  }

  return [...counts.entries()].map(([key, personCount]) => {
    const [dimension, dimensionKey, stage] = JSON.parse(key);

    return { dimension, dimensionKey, stage, personCount };
  });
};

// One run per day at the cron's time, dated as the real job dates it, ending at yesterday.
export const listSnapshotRuns = ({ trackingStartMs, nowMs, timeZone }) => {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDate = (atMs) => formatter.format(atMs);
  const startDay = new Date(trackingStartMs);
  const firstRunMs = Date.UTC(
    startDay.getUTCFullYear(),
    startDay.getUTCMonth(),
    startDay.getUTCDate(),
    SNAPSHOT_HOUR_UTC,
    SNAPSHOT_MINUTE_UTC,
  );
  const firstDate = localDate(trackingStartMs);
  const today = localDate(nowMs);
  const runs = [];

  for (let atMs = firstRunMs; localDate(atMs) < today; atMs += DAY_MILLISECONDS) {
    if (localDate(atMs) >= firstDate) {
      runs.push({ atMs, snapshotDate: localDate(atMs) });
    }
  }

  return { runs, today };
};

// Stage changes are ordered by time, so the last one at or before the moment wins. Before the
// first, a person holds that change's "before"; with no change, the stage on the person row.
export const peopleAtMoment = ({ people, changesByPerson, atMs }) =>
  people
    .filter((person) => person.createdAtMs <= atMs)
    .map((person) => {
      const changes = changesByPerson.get(person.id) ?? [];
      const reached = changes.filter((change) => change.atMs <= atMs);
      const stage =
        changes.length === 0
          ? person.stage
          : reached.length === 0
            ? changes[0].before
            : reached[reached.length - 1].after;

      return { ...person, stage };
    });

export const readHistory = async ({ query, tables }) => {
  const people = (
    await query(
      `SELECT id, "createdAt" AS created_at, stage::text AS stage, "applicantSource"::text AS source,
              COALESCE("positionsAppliedFor"::text[], '{}'::text[]) AS positions
       FROM ${tables.person} WHERE "deletedAt" IS NULL`,
    )
  ).map((row) => ({
    id: row.id,
    createdAtMs: row.created_at.getTime(),
    stage: row.stage,
    source: row.source,
    positions: row.positions,
  }));
  const changes = await query(
    `SELECT "targetPersonId" AS person_id, "happensAt" AS happens_at,
            properties->'diff'->'stage'->>'before' AS before_stage,
            properties->'diff'->'stage'->>'after' AS after_stage
     FROM ${tables.timeline}
     WHERE "targetPersonId" IS NOT NULL AND "linkedRecordId" IS NULL AND properties->'diff' ? 'stage'
     ORDER BY "happensAt"`,
  );
  const changesByPerson = new Map();

  for (const change of changes) {
    if (!changesByPerson.has(change.person_id)) {
      changesByPerson.set(change.person_id, []);
    }

    changesByPerson.get(change.person_id).push({
      atMs: change.happens_at.getTime(),
      before: change.before_stage,
      after: change.after_stage,
    });
  }

  return { people, changesByPerson };
};

export const insertSnapshotRows = async ({ query, workspaceId, rows }) => {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);

    await query(
      `INSERT INTO analytics.daily_snapshot (workspace_id, snapshot_date, dimension, dimension_key, stage, person_count)
       SELECT $1::uuid, row_value.snapshot_date::date, row_value.dimension, row_value.dimension_key, row_value.stage, row_value.person_count
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
         AS row_value (snapshot_date, dimension, dimension_key, stage, person_count)`,
      [
        workspaceId,
        batch.map((row) => row.snapshotDate),
        batch.map((row) => row.dimension),
        batch.map((row) => row.dimensionKey),
        batch.map((row) => row.stage),
        batch.map((row) => row.personCount),
      ],
    );
  }
};

const loadSnapshots = async ({ query, workspace }) => {
  const { tables, workspaceId } = workspace;
  const { config } = readRealCode();

  if (!(await tableExists({ query, table: 'analytics.daily_snapshot' }))) {
    throw new Error('The analytics schema does not exist yet. Run the first sync, as README.md says, then run this again.');
  }

  const [trackingStart] = await query(
    `SELECT value FROM core."keyValuePair" WHERE "key" = $1 AND "workspaceId" = $2 AND "userId" IS NULL`,
    [TRACKING_START_KEY, workspaceId],
  );

  if (trackingStart === undefined) {
    throw new Error('No tracking start is set. Run --stage people first.');
  }

  const trackByPosition = new Map(
    config.tracks.flatMap((track) => track.positions.map((position) => [position, track.trackKey])),
  );
  const { people, changesByPerson } = await readHistory({ query, tables });
  const { runs, today } = listSnapshotRuns({
    trackingStartMs: Date.parse(trackingStart.value),
    nowMs: Date.now(),
    timeZone: config.reportingTimeZone,
  });
  const rows = runs.flatMap(({ atMs, snapshotDate }) =>
    buildSnapshotRows({
      people: peopleAtMoment({ people, changesByPerson, atMs }),
      trackByPosition,
    }).map((row) => ({ ...row, snapshotDate })),
  );

  await query('BEGIN');
  await query(`DELETE FROM analytics.daily_snapshot WHERE workspace_id = $1 AND snapshot_date < $2::date`, [
    workspaceId,
    today,
  ]);
  await insertSnapshotRows({ query, workspaceId, rows });
  // Reports are frozen when built, so any built before this backfill would lack its history.
  // The next daily job rebuilds them.
  await query(`DELETE FROM analytics.report WHERE workspace_id = $1`, [workspaceId]);
  await query('COMMIT');

  console.log(`Backfilled ${rows.length} snapshot rows for ${runs.length} days, up to ${runs[runs.length - 1]?.snapshotDate}.`);
  console.log('Run the daily job now, as README.md says, so reports are built from them.');
};

const main = async () => {
  const argv = process.argv.slice(2);
  const stageIndex = argv.indexOf('--stage');
  const stage = stageIndex === -1 ? 'people' : argv[stageIndex + 1];

  // Checked first and separately, so a refusal needs no database and no dependency.
  const connection = resolveConnection();

  if (!argv.includes('--i-am-local')) {
    throw new RefusedTargetError(
      `Refused: this writes to the local CRM database "${CRM_DATABASE}". Pass --i-am-local to confirm this is your own machine.`,
    );
  }

  if (!STAGES.includes(stage)) {
    throw new Error(`Unknown stage "${stage}". Use one of: ${STAGES.join(', ')}.`);
  }

  const pg = readRealCode().loader.repoRequire('pg');
  const client = new pg.Client(connection);

  await client.connect();

  try {
    const query = async (sql, parameters = []) => (await client.query(sql, parameters)).rows;
    const workspace = await openWorkspace(query);

    await (stage === 'people' ? loadPeople : loadSnapshots)({ query, workspace });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof RefusedTargetError ? error.message : error);
    process.exitCode = error instanceof RefusedTargetError ? 3 : 1;
  });
}
