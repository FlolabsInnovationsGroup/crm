#!/usr/bin/env node
// Loads the seed into a local database. See README.md for the commands.
//   node load.mjs                     analytics_seed, dropped and recreated
//   node load.mjs --crm --i-am-local  the Apple workspace in the local CRM database
//
// Both paths check the target before anything connects, so a setting cannot aim this at
// another machine. analytics_seed holds a fixed clock: seed_clock.now() comes first on the
// database's search_path, so the product's own now() returns the seed's time.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONFIG_ADDITIONS,
  FIXED_NOW,
  UNKNOWN_SOURCE_VALUE,
  UNMAPPED_STAGE_VALUES,
  buildSeed,
} from './seed-data.mjs';

const require = createRequire(import.meta.url);
const { RefusedTargetError, assertLocalDatabaseHost } = require('../lib/local-only.cjs');

const SEED_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SEED_ROOT, '..', '..', '..', '..', '..');

const SEED_DATABASE_PATTERN = /^analytics_seed(_[a-z0-9]+)?$/;
const CRM_DATABASE = 'default';
const CRM_WORKSPACE_DISPLAY_NAME = 'Apple';
// Production holds about 43,000 people and the demo workspace a few hundred, so a target
// that only looks local, such as a tunnel, still stops here.
const CRM_MAXIMUM_EXISTING_PEOPLE = 5000;
const TRACKING_START_KEY = 'CRM_ANALYTICS_TRACKING_START_AT';
const SEED_ID_PATTERN = '5eed0001-%';

const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;

// Port and credentials are fixed on purpose: no setting can bring in another server's.
const resolveConnection = (host) => ({
  host: assertLocalDatabaseHost(host ?? process.env.ANALYTICS_TEST_PG_HOST ?? 'localhost'),
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 5000,
});

// Each load drops and recreates this database, so it can never be a CRM database. A suffix
// lets two runs share one server without dropping each other's data.
export const seedDatabaseName = () => {
  const name = process.env.ANALYTICS_SEED_DATABASE ?? 'analytics_seed';

  if (!SEED_DATABASE_PATTERN.test(name)) {
    throw new RefusedTargetError(`Refused: database "${name}". This step only drops and recreates analytics_seed.`);
  }

  return name;
};

// Every value the seed writes that the default config does not list.
const addConfigAdditions = (config) => {
  for (const { stageKey, rawValue, isReminder } of CONFIG_ADDITIONS) {
    const stage = config.stages.find((candidate) => candidate.stageKey === stageKey);

    if (!stage.rawValues.some((candidate) => candidate.rawValue === rawValue)) {
      stage.rawValues.push({ rawValue, isReminder });
    }
  }
};

const installRealCode = () => {
  const { installLoader } = require('../integration/lib/loader.cjs');
  const loader = installLoader(REPO_ROOT);
  const { CRM_ANALYTICS_CONFIG } = loader.real(
    'src/modules/analytics/constants/crm-analytics-config.constant',
  );

  addConfigAdditions(CRM_ANALYTICS_CONFIG);

  return { loader, config: CRM_ANALYTICS_CONFIG };
};

const recreateSeedDatabase = async ({ pg, connection, name }) => {
  const admin = new pg.Client({ ...connection, database: 'postgres' });

  await admin.connect();

  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.query(`ALTER DATABASE ${name} SET search_path TO seed_clock, pg_catalog, public`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ ...connection, database: name });

  await client.connect();

  try {
    // The column generator defaults ids to public.uuid_generate_v4(), as in the CRM.
    await client.query('CREATE EXTENSION "uuid-ossp" WITH SCHEMA public');
    await client.query('CREATE SCHEMA seed_clock');
    await client.query('CREATE TABLE seed_clock.clock_value (instant timestamptz NOT NULL)');
    await client.query(`INSERT INTO seed_clock.clock_value VALUES ($1)`, [FIXED_NOW]);
    await client.query(
      `CREATE FUNCTION seed_clock.now() RETURNS timestamptz LANGUAGE sql STABLE AS 'SELECT instant FROM seed_clock.clock_value'`,
    );
  } finally {
    await client.end();
  }
};

// The page pool in workspace-data-source.service.ts keeps DATE as a raw string.
const createPagePool = ({ pg, connection, name }) =>
  new pg.Pool({
    ...connection,
    database: name,
    max: 2,
    types: {
      getTypeParser: (oid, format) =>
        oid === pg.types.builtins.DATE
          ? (value) => value
          : pg.types.getTypeParser(oid, format),
    },
  });

// Writes what the CRM's own writes would leave behind. `person`, `timeline` and the rest
// are qualified table names, so this works on the seed database and on the CRM database.
const buildEvents = ({ seedWorkspace, tables, objectRecordDiffMerge, castPositionsSql }) => {
  const { personFields, forms, removedFields = [] } = seedWorkspace.fields;
  const hasStage = personFields === 'FULL' || personFields === 'TEXT';
  const hasPositions = personFields === 'FULL' && !removedFields.includes('positionsAppliedFor');
  const hasSource =
    (personFields === 'FULL' || personFields === 'TEXT') &&
    !removedFields.includes('applicantSource');
  const events = [];
  const add = (visibleAt, run, { isRerunOnly = false } = {}) => {
    events.push({ visibleAt, run, isRerunOnly, order: events.length });
  };

  if (forms === 'FULL') {
    for (const form of Object.values(seedWorkspace.forms)) {
      add(0, (query) =>
        query(`INSERT INTO ${tables.form} (id, name, status) VALUES ($1, $2, 'PUBLISHED')`, [
          form.id,
          form.name,
        ]),
      );
    }
  }

  for (const application of seedWorkspace.applications) {
    add(0, (query) =>
      query(`INSERT INTO ${tables.application} (id, name, "deletedAt") VALUES ($1, $2, $3)`, [
        application.id,
        application.key,
        application.isDeleted ? new Date(0) : null,
      ]),
    );
  }

  for (const person of seedWorkspace.people) {
    add(
      person.createdAt,
      (query) => {
        const columns = {
          id: person.id,
          nameFirstName: person.firstName,
          nameLastName: person.lastName,
          emailsPrimaryEmail: person.email,
          createdAt: new Date(person.createdAt),
          updatedAt: new Date(person.createdAt),
          ...(hasStage ? { stage: person.initialRaw } : {}),
          ...(hasSource ? { applicantSource: person.source } : {}),
          ...(hasPositions ? { positionsAppliedFor: person.positions } : {}),
        };
        const names = Object.keys(columns);
        const placeholders = names.map((name, index) =>
          name === 'positionsAppliedFor' ? castPositionsSql(`$${index + 1}`) : `$${index + 1}`,
        );

        return query(
          `INSERT INTO ${tables.person} (${names.map(quoteIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`,
          Object.values(columns),
        );
      },
      { isRerunOnly: person.isCreatedOnRerun },
    );

    if (hasStage) {
      for (const change of person.changes) {
        add(change.at, (query) =>
          query(`UPDATE ${tables.person} SET stage = $2, "updatedAt" = $3 WHERE id = $1`, [
            person.id,
            change.to,
            new Date(change.at),
          ]),
        );
      }
    }

    for (const event of person.lifecycle) {
      add(event.at, (query) =>
        query(`UPDATE ${tables.person} SET "deletedAt" = $2 WHERE id = $1`, [
          person.id,
          event.isDeleted ? new Date(event.at) : null,
        ]),
      );
    }

    for (const row of person.timelineRows) {
      add(row.visibleAt, (query) =>
        query(
          `INSERT INTO ${tables.timeline} (id, "targetPersonId", properties, "happensAt", "createdAt", "updatedAt")
           VALUES ($1, $2, $3::jsonb, $4, $4, $5)`,
          [
            row.id,
            person.id,
            JSON.stringify({
              diff: { stage: { before: row.before, after: row.after }, ...row.extraDiff },
            }),
            new Date(row.happensAt),
            new Date(row.updatedAt),
          ],
        ),
      );

      if (row.merge !== undefined) {
        // What upsertTimelineActivities does to a recent row: the real diff merge writes
        // the same row, and updatedAt moves while happensAt stays.
        add(row.merge.updatedAt, async (query) => {
          const [current] = await query(`SELECT properties FROM ${tables.timeline} WHERE id = $1`, [row.id]);
          const merged = objectRecordDiffMerge(current.properties, {
            diff: { stage: { before: current.properties.diff.stage.after, after: row.merge.after } },
          });

          await query(`UPDATE ${tables.timeline} SET properties = $2::jsonb, "updatedAt" = $3 WHERE id = $1`, [
            row.id,
            JSON.stringify(merged),
            new Date(row.merge.updatedAt),
          ]);
        });
      }
    }
  }

  for (const row of seedWorkspace.ignoredRows) {
    add(row.at, (query) =>
      query(
        `INSERT INTO ${tables.timeline} (id, "targetPersonId", "linkedRecordId", properties, "happensAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::jsonb, $5, $5, $5)`,
        [row.id, row.personId, row.linkedRecordId ?? null, JSON.stringify(row.properties), new Date(row.at)],
      ),
    );
  }

  for (const submission of seedWorkspace.submissions) {
    add(submission.submittedAt, (query) =>
      query(
        `INSERT INTO ${tables.submission} (id, "formId", "personId", "submittedAt", answers)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          submission.id,
          seedWorkspace.forms[submission.form].id,
          submission.personId,
          new Date(submission.submittedAt),
          JSON.stringify(submission.answers),
        ],
      ),
    );

    if (submission.deletedAt !== null) {
      add(submission.deletedAt, (query) =>
        query(`UPDATE ${tables.submission} SET "deletedAt" = $2 WHERE id = $1`, [
          submission.id,
          new Date(submission.deletedAt),
        ]),
      );
    }
  }

  return events.sort(
    (first, second) => first.visibleAt - second.visibleAt || first.order - second.order,
  );
};

const applyEvents = async ({ events, query, upTo, includeRerunOnly }) => {
  const pending = [];

  for (const event of events) {
    if (!event.isApplied && event.visibleAt <= upTo && (includeRerunOnly || !event.isRerunOnly)) {
      pending.push(event);
    }
  }

  for (const event of pending) {
    await event.run(query);
    event.isApplied = true;
  }
};

// The factory's fields, plus what this seed needs beyond them: a value in the column the
// config and the field options do not know, and the email column the leak test fills.
const finishSeedWorkspace = async ({ query, crmWorkspace, seedWorkspace }) => {
  const { personFields, removedFields = [], forms } = seedWorkspace.fields;
  const person = crmWorkspace.table('person');
  const enumName = (columnName) =>
    `${quoteIdentifier(crmWorkspace.schemaName)}.${quoteIdentifier(`person_${columnName}_enum`)}`;

  await query(`ALTER TABLE ${person} ADD COLUMN "emailsPrimaryEmail" text`);

  if (personFields === 'FULL') {
    for (const value of UNMAPPED_STAGE_VALUES) {
      await query(`ALTER TYPE ${enumName('stage')} ADD VALUE IF NOT EXISTS '${value}'`);
    }

    await query(`ALTER TYPE ${enumName('applicantSource')} ADD VALUE IF NOT EXISTS '${UNKNOWN_SOURCE_VALUE}'`);
  }

  for (const fieldName of removedFields) {
    const { flatFieldMetadataMaps, flatObjectMetadataMaps } = crmWorkspace.flatMaps;
    const fieldId = `person-${fieldName}-id`;
    const personObject = flatObjectMetadataMaps.byUniversalIdentifier['person-uid'];

    delete flatFieldMetadataMaps.byUniversalIdentifier[`person-${fieldName}-uid`];
    delete flatFieldMetadataMaps.universalIdentifierById[fieldId];
    personObject.fieldIds = personObject.fieldIds.filter((id) => id !== fieldId);

    await query(`ALTER TABLE ${person} DROP COLUMN ${quoteIdentifier(fieldName)}`);
  }

  return {
    person,
    timeline: crmWorkspace.table('timelineActivity'),
    form: forms === 'NONE' ? null : crmWorkspace.table('_crmForm'),
    submission: forms === 'NONE' ? null : crmWorkspace.table('_formSubmission'),
    application: crmWorkspace.table('_application'),
  };
};

// Opens analytics_seed, freshly recreated. The test drives the clock and the events through
// the result, so a job can run between two rows of the same history.
export const openSeedDatabase = async ({ host, nowIso = FIXED_NOW } = {}) => {
  const connection = resolveConnection(host);
  const { loader, config } = installRealCode();
  const pg = loader.repoRequire('pg');
  const { FieldMetadataType, RelationType } = loader.repoRequire('twenty-shared/types');
  const { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } = loader.repoRequire(
    'twenty-shared/application',
  );
  const { createCrmFactory } = require('../integration/lib/crm-tables.cjs');
  const name = seedDatabaseName();

  await recreateSeedDatabase({ pg, connection, name });

  const pool = createPagePool({ pg, connection, name });
  const query = async (sql, parameters = []) => (await pool.query(sql, parameters)).rows;
  const seed = buildSeed(nowIso);
  const factory = createCrmFactory({
    loader,
    standardApplicationId: TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
    FieldMetadataType,
    RelationType,
  });
  const openWorkspaces = new Map();

  const openWorkspace = async (workspaceName) => {
    const seedWorkspace = seed.workspaces[workspaceName];
    const crmWorkspace = await factory.createWorkspace({
      query,
      workspaceId: seedWorkspace.workspaceId,
      personFields: seedWorkspace.fields.personFields,
      forms: seedWorkspace.fields.forms,
      withApplication: seedWorkspace.fields.withApplication,
    });
    const tables = await finishSeedWorkspace({ query, crmWorkspace, seedWorkspace });
    const positionsEnum = `${quoteIdentifier(crmWorkspace.schemaName)}.${quoteIdentifier('person_positionsAppliedFor_enum')}`;
    const events = buildEvents({
      seedWorkspace,
      tables,
      objectRecordDiffMerge: factory.objectRecordDiffMerge,
      castPositionsSql: (placeholder) => `${placeholder}::text[]::${positionsEnum}[]`,
    });

    crmWorkspace.vars.set(TRACKING_START_KEY, new Date(seed.trackingStartMs).toISOString());
    openWorkspaces.set(seedWorkspace.workspaceId, crmWorkspace);

    return {
      seedWorkspace,
      crmWorkspace,
      tables,
      applyUpTo: (upTo, { includeRerunOnly = false } = {}) =>
        applyEvents({ events, query, upTo, includeRerunOnly }),
    };
  };

  return {
    loader,
    config,
    pg,
    pool,
    query,
    seed,
    openWorkspace,
    workspaces: openWorkspaces,
    databaseUrl: `postgres://${connection.user}:${connection.password}@${connection.host}:${connection.port}/${name}`,
    setClock: (at) => query(`UPDATE seed_clock.clock_value SET instant = $1`, [new Date(at)]),
    close: () => pool.end(),
  };
};

const loadSeedDatabase = async ({ host }) => {
  const opened = await openSeedDatabase({ host });
  const names = Object.keys(opened.seed.workspaces);
  let peopleCount = 0;

  for (const name of names) {
    const workspace = await opened.openWorkspace(name);

    await workspace.applyUpTo(opened.seed.nowMs, { includeRerunOnly: true });
    peopleCount += workspace.seedWorkspace.people.length;
  }

  await opened.setClock(opened.seed.nowMs);
  await opened.close();

  console.log(
    `Loaded ${peopleCount} people into ${seedDatabaseName()}, ${names.length} workspaces, clock at ${FIXED_NOW}. No job has run.`,
  );
};

// Local run only: real people, real now(), so ages are from the moment of loading, and
// changes the CRM merged appear in their merged form. Numbers on a page come from it.
const loadCrmDatabase = async ({ host }) => {
  const connection = resolveConnection(host);
  const { loader } = installRealCode();
  const pg = loader.repoRequire('pg');
  const { getWorkspaceSchemaName } = loader.real(
    'src/engine/workspace-datasource/utils/get-workspace-schema-name.util',
  );
  const { objectRecordDiffMerge } = loader.real(
    'src/engine/core-modules/event-emitter/utils/object-record-diff-merge',
  );
  const client = new pg.Client({ ...connection, database: CRM_DATABASE });

  await client.connect();

  try {
    const query = async (sql, parameters = []) => (await client.query(sql, parameters)).rows;
    const [workspaceRow] = await query(`SELECT id FROM core.workspace WHERE "displayName" = $1`, [
      CRM_WORKSPACE_DISPLAY_NAME,
    ]);

    if (workspaceRow === undefined) {
      throw new Error(`No workspace named ${CRM_WORKSPACE_DISPLAY_NAME}. Reset the local database first.`);
    }

    const schema = getWorkspaceSchemaName(workspaceRow.id);
    const qualify = (table) => `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
    const seed = buildSeed(new Date().toISOString());
    const seedWorkspace = seed.workspaces.main;
    const [{ total }] = await query(`SELECT count(*)::int AS total FROM ${qualify('person')}`);

    if (total > CRM_MAXIMUM_EXISTING_PEOPLE) {
      throw new RefusedTargetError(
        `Refused: this workspace holds ${total} people, far more than the local demo workspace. It does not look local.`,
      );
    }

    await assertCrmIsReady({ query, schema, seedWorkspace });

    const tables = {
      person: qualify('person'),
      timeline: qualify('timelineActivity'),
      form: qualify('_crmForm'),
      submission: qualify('_formSubmission'),
      application: qualify('_application'),
    };
    const hasApplicationTable = await tableExists({ query, schema, table: '_application' });

    if (!hasApplicationTable) {
      seedWorkspace.applications = [];
    }

    await query('BEGIN');

    for (const table of [tables.submission, tables.timeline, tables.form, tables.person, ...(hasApplicationTable ? [tables.application] : [])]) {
      await query(`DELETE FROM ${table} WHERE id::text LIKE $1`, [SEED_ID_PATTERN]);
    }

    const positionsEnum = `${quoteIdentifier(schema)}.${quoteIdentifier('person_positionsAppliedFor_enum')}`;
    const events = buildEvents({
      seedWorkspace,
      tables,
      objectRecordDiffMerge,
      castPositionsSql: (placeholder) => `${placeholder}::text[]::${positionsEnum}[]`,
    });

    await applyEvents({ events, query, upTo: seed.nowMs, includeRerunOnly: true });
    await query(`DELETE FROM core."keyValuePair" WHERE "key" = $1 AND "workspaceId" = $2 AND "userId" IS NULL`, [
      TRACKING_START_KEY,
      workspaceRow.id,
    ]);
    await query(
      `INSERT INTO core."keyValuePair" ("key", "value", "workspaceId", "type") VALUES ($1, $2::jsonb, $3, 'USER_VARIABLE')`,
      [TRACKING_START_KEY, JSON.stringify(new Date(seed.trackingStartMs).toISOString()), workspaceRow.id],
    );
    // A stored transition is never rewritten, so old rows would keep their old times.
    await query('DROP SCHEMA IF EXISTS analytics CASCADE');
    await query('COMMIT');

    console.log(`Loaded ${seedWorkspace.people.length} people into workspace ${workspaceRow.id}.`);
    console.log('Add the reminder and alias values below to the config before running jobs:');
    console.log(`  ${CONFIG_ADDITIONS.map(({ stageKey, rawValue }) => `${rawValue} under ${stageKey}`).join(', ')}`);
    console.log('Then, from packages/twenty-server:');
    console.log(`  node dist/command/command.js crm-analytics:run --workspace-id ${workspaceRow.id} --job sync`);
    console.log(`  node dist/command/command.js crm-analytics:run --workspace-id ${workspaceRow.id} --job daily`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
};

const tableExists = async ({ query, schema, table }) =>
  (await query(`SELECT to_regclass($1) IS NOT NULL AS found`, [`${quoteIdentifier(schema)}.${quoteIdentifier(table)}`]))[0].found;

// "After the fields exist": this mode never creates a field or an enum value, because the
// CRM's metadata would no longer match its columns.
const assertCrmIsReady = async ({ query, schema, seedWorkspace }) => {
  const missing = [];

  for (const [table, columns] of [
    ['person', ['stage', 'positionsAppliedFor', 'applicantSource', 'emailsPrimaryEmail']],
    ['timelineActivity', ['targetPersonId', 'linkedRecordId', 'properties', 'happensAt']],
    ['_crmForm', ['name', 'status']],
    ['_formSubmission', ['formId', 'personId', 'submittedAt', 'answers']],
  ]) {
    const found = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    const names = new Set(found.map((row) => row.column_name));

    for (const column of columns) {
      if (!names.has(column)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Create these first (contract section 9, sample setup): ${missing.join(', ')}`);
  }

  // A required column this mode does not fill would fail half way through the load.
  const writtenColumns = {
    person: ['id', 'nameFirstName', 'nameLastName', 'emailsPrimaryEmail', 'stage', 'positionsAppliedFor', 'applicantSource', 'createdAt', 'updatedAt'],
    timelineActivity: ['id', 'targetPersonId', 'linkedRecordId', 'properties', 'happensAt', 'createdAt', 'updatedAt'],
    _crmForm: ['id', 'name', 'status'],
    _formSubmission: ['id', 'formId', 'personId', 'submittedAt', 'answers'],
  };

  for (const [table, written] of Object.entries(writtenColumns)) {
    const required = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND is_nullable = 'NO' AND column_default IS NULL AND is_generated = 'NEVER'`,
      [schema, table],
    );
    const unfilled = required.map((row) => row.column_name).filter((name) => !written.includes(name));

    if (unfilled.length > 0) {
      throw new Error(`load.mjs does not fill these required columns of ${table}: ${unfilled.join(', ')}`);
    }
  }

  const enumValues = async (enumName) =>
    (
      await query(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = $1 AND t.typname = $2`,
        [schema, enumName],
      )
    ).map((row) => row.enumlabel);

  const needed = {
    person_stage_enum: new Set(
      seedWorkspace.people.flatMap((person) => [
        person.initialRaw,
        ...person.changes.map((change) => change.to),
      ]).filter((value) => value !== null),
    ),
    person_positionsAppliedFor_enum: new Set(
      seedWorkspace.people.flatMap((person) => person.positions ?? []),
    ),
    person_applicantSource_enum: new Set(
      seedWorkspace.people.map((person) => person.source).filter((value) => value !== null),
    ),
  };
  const absent = [];

  for (const [enumName, values] of Object.entries(needed)) {
    const present = new Set(await enumValues(enumName));

    for (const value of values) {
      if (!present.has(value)) {
        absent.push(`${enumName}: ${value}`);
      }
    }
  }

  if (absent.length > 0) {
    throw new Error(`Add these options to the fields first:\n  ${absent.join('\n  ')}`);
  }
};

const readHostArgument = (argv) => {
  const index = argv.indexOf('--host');

  return index === -1 ? undefined : argv[index + 1];
};

const main = async () => {
  const argv = process.argv.slice(2);
  const host = readHostArgument(argv);

  // Checked first and separately, so a refusal needs no database and no dependency.
  resolveConnection(host);
  seedDatabaseName();

  if (argv.includes('--crm')) {
    if (!argv.includes('--i-am-local')) {
      throw new RefusedTargetError(
        `Refused: --crm writes to the local CRM database "${CRM_DATABASE}". Pass --i-am-local to confirm this is your own machine.`,
      );
    }

    await loadCrmDatabase({ host });

    return;
  }

  await loadSeedDatabase({ host });
};

// Runs this file's guards as a stranger would: a fresh process with the given arguments.
export const runLoaderCommand = (args, extraEnvironment = {}) => {
  const { ANALYTICS_TEST_PG_HOST: ignoredHost, ...environment } = process.env;

  return spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...environment, ...extraEnvironment },
  });
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof RefusedTargetError ? error.message : error);
    process.exitCode = error instanceof RefusedTargetError ? 3 : 1;
  });
}
