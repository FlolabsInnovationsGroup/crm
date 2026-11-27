#!/usr/bin/env node
// Copies People and their files from one Twenty CRM to another, through the
// public APIs only. It never writes to the source.
//
//   node migrate.mjs check     read both CRMs and say what would happen
//   node migrate.mjs fields    add the source's custom person fields to the target
//   node migrate.mjs people    copy every person (safe to run again)
//   node migrate.mjs files     download every file attached to a person
//   node migrate.mjs all       fields, people, then files
//
// Settings come from config.json next to this file (see config.example.json),
// or from a path given with --config <file>. Needs Node.js 18 or newer.
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PAGE_SIZE = 200;
const BATCH_SIZE = 50;
const PAUSE_MS = 150;
const MAX_ATTEMPTS = 5;

// Field types that hold plain values and can be copied as they are.
const COPYABLE_TYPES = new Set([
  'TEXT',
  'NUMBER',
  'NUMERIC',
  'BOOLEAN',
  'DATE',
  'DATE_TIME',
  'SELECT',
  'MULTI_SELECT',
  'RATING',
  'EMAILS',
  'PHONES',
  'LINKS',
  'CURRENCY',
  'FULL_NAME',
  'ADDRESS',
  'ARRAY',
  'RAW_JSON',
  'RICH_TEXT',
  'RICH_TEXT_V2',
]);

const command = process.argv[2] ?? 'help';
const configFlag = process.argv.indexOf('--config');
const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(
  configFlag > 0 ? process.argv[configFlag + 1] : join(here, 'config.json'),
);

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const log = (message) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

const readConfig = () => {
  if (!existsSync(configPath)) {
    throw new Error(
      `No settings file at ${configPath}. Copy config.example.json to config.json and fill it in.`,
    );
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  for (const side of ['source', 'target']) {
    if (!config[side]?.url || !config[side]?.apiKey || config[side].apiKey.startsWith('PASTE')) {
      throw new Error(`Fill in ${side}.url and ${side}.apiKey in ${configPath}.`);
    }

    config[side].url = config[side].url.replace(/\/$/, '');
  }

  config.outputFolder = resolve(dirname(configPath), config.outputFolder ?? './migration-output');
  mkdirSync(config.outputFolder, { recursive: true });

  return config;
};

// Retries rate limits, timeouts and server errors; anything else is a real
// error and stops the step.
const request = async (crm, path, { method = 'GET', body } = {}) => {
  for (let attempt = 1; ; attempt++) {
    let response;

    try {
      response = await fetch(`${crm.url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${crm.apiKey}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'follow',
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      await sleep(2_000 * attempt);
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(Number(response.headers.get('retry-after') ?? 0) * 1_000 || 2_000 * attempt);
      continue;
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.errors) {
      const error = new Error(
        `${method} ${path} failed (${response.status}): ${JSON.stringify(json.errors ?? json.messages ?? json).slice(0, 500)}`,
      );

      error.status = response.status;
      throw error;
    }

    await sleep(PAUSE_MS);

    return json;
  }
};

// Signed links carry their own token, so no API key is sent with them.
const download = async (url) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        await sleep(2_000 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      await sleep(2_000 * attempt);
    }
  }
};

const metadata = (crm, query, variables = {}) =>
  request(crm, '/metadata', { method: 'POST', body: { query, variables } }).then(
    (json) => json.data,
  );

// Newer Twenty versions list fields as fieldsList, older ones as a connection.
const getObject = async (crm, nameSingular) => {
  const fieldSelection = 'name type label icon description isCustom isActive isSystem options defaultValue settings';
  let objects;

  try {
    const data = await metadata(
      crm,
      `query { objects(paging: { first: 1000 }) { edges { node { id nameSingular fieldsList { ${fieldSelection} } } } } }`,
    );

    objects = data.objects.edges.map(({ node }) => ({ ...node, fields: node.fieldsList }));
  } catch {
    const data = await metadata(
      crm,
      `query { objects(paging: { first: 1000 }) { edges { node { id nameSingular fields(paging: { first: 1000 }) { edges { node { ${fieldSelection} } } } } } } }`,
    );

    objects = data.objects.edges.map(({ node }) => ({
      ...node,
      fields: node.fields.edges.map((edge) => edge.node),
    }));
  }

  const object = objects.find((candidate) => candidate.nameSingular === nameSingular);

  if (!object) {
    throw new Error(`${crm.url} has no "${nameSingular}" object.`);
  }

  return object;
};

const isCopyable = (field) =>
  field.isActive !== false && !field.isSystem && COPYABLE_TYPES.has(field.type);

// Pages through a REST list until the end, handing each page to onPage.
const forEachPage = async (crm, plural, onPage, { filter, startAfter } = {}) => {
  let cursor = startAfter;

  for (;;) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), depth: '0' });

    if (filter) {
      query.set('filter', filter);
    }

    if (cursor) {
      query.set('starting_after', cursor);
    }

    const json = await request(crm, `/rest/${plural}?${query}`);
    const records = Object.values(json.data ?? {})[0] ?? [];

    await onPage(records, json.pageInfo?.endCursor);

    if (!json.pageInfo?.hasNextPage || !json.pageInfo?.endCursor) {
      return;
    }

    cursor = json.pageInfo.endCursor;
  }
};

const statePath = (config) => join(config.outputFolder, 'state.json');

const readState = (config) =>
  existsSync(statePath(config)) ? JSON.parse(readFileSync(statePath(config), 'utf8')) : {};

const writeState = (config, state) =>
  writeFileSync(statePath(config), JSON.stringify(state, null, 2));

const primaryEmailOf = (person) => person.emails?.primaryEmail?.trim().toLowerCase() || null;

const check = async (config) => {
  const [sourcePerson, targetPerson] = await Promise.all([
    getObject(config.source, 'person'),
    getObject(config.target, 'person'),
  ]);
  const targetNames = new Set(targetPerson.fields.map((field) => field.name));
  const missing = sourcePerson.fields.filter(
    (field) => isCopyable(field) && field.isCustom && !targetNames.has(field.name),
  );
  const people = await request(config.source, '/rest/people?limit=1&depth=0');
  const targetPeople = await request(config.target, '/rest/people?limit=1&depth=0');

  log(`Source: ${people.totalCount ?? '?'} people. Target: ${targetPeople.totalCount ?? '?'} people.`);
  log(
    missing.length === 0
      ? 'Every custom person field already exists in the target.'
      : `Custom fields the "fields" step will add to the target: ${missing.map((field) => field.name).join(', ')}`,
  );
  log('Both CRMs answered. Nothing was changed.');
};

const fields = async (config) => {
  const [sourcePerson, targetPerson] = await Promise.all([
    getObject(config.source, 'person'),
    getObject(config.target, 'person'),
  ]);
  const targetNames = new Set(targetPerson.fields.map((field) => field.name));

  for (const field of sourcePerson.fields) {
    if (!isCopyable(field) || !field.isCustom || targetNames.has(field.name)) {
      continue;
    }

    try {
      await metadata(
        config.target,
        'mutation ($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id } }',
        {
          input: {
            field: {
              objectMetadataId: targetPerson.id,
              name: field.name,
              label: field.label,
              type: field.type === 'RICH_TEXT_V2' ? 'RICH_TEXT' : field.type,
              icon: field.icon ?? undefined,
              description: field.description ?? undefined,
              options: field.options ?? undefined,
              defaultValue: field.defaultValue ?? undefined,
              settings: field.settings ?? undefined,
            },
          },
        },
      );
      log(`+ field ${field.name}`);
    } catch (error) {
      log(`! could not add field ${field.name}: ${error.message}`);
    }
  }

  log('Fields done.');
};

const people = async (config) => {
  const [sourcePerson, targetPerson] = await Promise.all([
    getObject(config.source, 'person'),
    getObject(config.target, 'person'),
  ]);
  const targetFields = new Map(targetPerson.fields.map((field) => [field.name, field]));
  const copiedFields = sourcePerson.fields
    .filter((field) => isCopyable(field) && isCopyable(targetFields.get(field.name) ?? {}))
    .map((field) => field.name);
  const skippedFields = sourcePerson.fields
    .filter((field) => isCopyable(field) && !copiedFields.includes(field.name))
    .map((field) => field.name);

  if (skippedFields.length > 0) {
    log(`Not copied (missing in the target, run "fields" first): ${skippedFields.join(', ')}`);
  }

  log('Reading the people already in the target, to update them instead of duplicating...');
  const targetIdByEmail = new Map();

  await forEachPage(config.target, 'people', async (records) => {
    for (const record of records) {
      const email = primaryEmailOf(record);

      if (email) {
        targetIdByEmail.set(email, record.id);
      }
    }
  });
  log(`${targetIdByEmail.size} people with an email in the target.`);

  const state = readState(config);
  state.people ??= { cursor: null, created: 0, updated: 0, failed: 0 };
  const failures = [];

  const toPayload = (person) =>
    Object.fromEntries(
      copiedFields
        .filter((name) => person[name] !== undefined)
        .map((name) => [name, person[name]]),
    );

  const writeOne = async (person) => {
    const email = primaryEmailOf(person);
    const existingId = email ? targetIdByEmail.get(email) : undefined;

    try {
      if (existingId) {
        await request(config.target, `/rest/people/${existingId}`, {
          method: 'PATCH',
          body: toPayload(person),
        });
        state.people.updated++;
      } else {
        await request(config.target, '/rest/people', {
          method: 'POST',
          body: { id: person.id, ...toPayload(person) },
        });
        state.people.created++;

        if (email) {
          targetIdByEmail.set(email, person.id);
        }
      }
    } catch (error) {
      // Already copied on an earlier run with the same id.
      if (error.status === 409 || /duplicate|already exists/i.test(error.message)) {
        await request(config.target, `/rest/people/${person.id}`, {
          method: 'PATCH',
          body: toPayload(person),
        })
          .then(() => state.people.updated++)
          .catch((patchError) => {
            state.people.failed++;
            failures.push({ id: person.id, email, error: patchError.message });
          });

        return;
      }

      state.people.failed++;
      failures.push({ id: person.id, email, error: error.message });
    }
  };

  await forEachPage(
    config.source,
    'people',
    async (records, endCursor) => {
      const fresh = records.filter((person) => {
        const email = primaryEmailOf(person);

        return !(email && targetIdByEmail.has(email));
      });
      const known = records.filter((person) => !fresh.includes(person));

      for (let index = 0; index < fresh.length; index += BATCH_SIZE) {
        const batch = fresh.slice(index, index + BATCH_SIZE);

        try {
          await request(config.target, '/rest/batch/people', {
            method: 'POST',
            body: batch.map((person) => ({ id: person.id, ...toPayload(person) })),
          });
          state.people.created += batch.length;
          batch.forEach((person) => {
            const email = primaryEmailOf(person);

            if (email) {
              targetIdByEmail.set(email, person.id);
            }
          });
        } catch {
          // One bad record fails the whole batch, so retry them one by one.
          for (const person of batch) {
            await writeOne(person);
          }
        }
      }

      // People already in the target are updated in batches where the target
      // supports upsert, otherwise one by one.
      for (let index = 0; index < known.length; index += BATCH_SIZE) {
        const batch = known.slice(index, index + BATCH_SIZE);

        try {
          await request(config.target, '/rest/batch/people?upsert=true', {
            method: 'POST',
            body: batch.map((person) => ({
              ...toPayload(person),
              id: targetIdByEmail.get(primaryEmailOf(person)),
            })),
          });
          state.people.updated += batch.length;
        } catch {
          for (const person of batch) {
            await writeOne(person);
          }
        }
      }

      state.people.cursor = endCursor;
      writeState(config, state);
      log(
        `people: ${state.people.created} created, ${state.people.updated} updated, ${state.people.failed} failed`,
      );
    },
    { startAfter: state.people.cursor ?? undefined },
  );

  if (failures.length > 0) {
    const failuresPath = join(config.outputFolder, 'people-failures.json');

    writeFileSync(failuresPath, JSON.stringify(failures, null, 2));
    log(`Some people failed. Details: ${failuresPath}`);
  }

  log('People done.');
};

// Files differ most between Twenty versions, so they are downloaded with a
// list that ties each one to its person, rather than uploaded blindly.
const files = async (config) => {
  const attachment = await getObject(config.source, 'attachment');
  const personKey = attachment.fields.some((field) => field.name === 'targetPerson')
    ? 'targetPersonId'
    : 'personId';
  const folder = join(config.outputFolder, 'files');
  const indexPath = join(config.outputFolder, 'files.csv');
  const state = readState(config);
  state.files ??= { cursor: null, downloaded: 0, failed: 0 };
  mkdirSync(folder, { recursive: true });

  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, 'personId,attachmentId,fileName,savedAs,error\n');
  }

  const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

  await forEachPage(
    config.source,
    'attachments',
    async (records, endCursor) => {
      const rows = [];

      for (const record of records) {
        const personId = record[personKey];

        if (!personId) {
          continue;
        }

        const stored = Array.isArray(record.file) ? record.file[0] : null;
        const fileName = record.name ?? stored?.label ?? record.id;
        // The API signs file links itself; a link built by hand would be refused.
        const url = stored?.url ?? (record.fullPath?.startsWith('http') ? record.fullPath : null);
        const safeName = `${record.id}-${String(fileName).replace(/[^\w.-]+/g, '_')}`.slice(0, 180);
        const personFolder = join(folder, personId);
        const savedAs = join(personFolder, safeName);

        if (existsSync(savedAs)) {
          continue;
        }

        try {
          if (!url) {
            throw new Error('the API gave no download link for this file');
          }

          const response = await download(url);

          if (!response.ok || !response.body) {
            throw new Error(`download failed (${response.status})`);
          }

          mkdirSync(personFolder, { recursive: true });
          await pipeline(Readable.fromWeb(response.body), createWriteStream(savedAs));
          state.files.downloaded++;
          rows.push([personId, record.id, fileName, savedAs, ''].map(csv).join(','));
        } catch (error) {
          state.files.failed++;
          rows.push([personId, record.id, fileName, '', error.message].map(csv).join(','));
        }
      }

      if (rows.length > 0) {
        writeFileSync(indexPath, `${rows.join('\n')}\n`, { flag: 'a' });
      }

      state.files.cursor = endCursor;
      writeState(config, state);
      log(`files: ${state.files.downloaded} downloaded, ${state.files.failed} failed`);
    },
    { startAfter: state.files.cursor ?? undefined },
  );

  log(`Files done. They are in ${folder}, one folder per person id, listed in ${indexPath}.`);
};

const steps = { check, fields, people, files };

const main = async () => {
  if (command === 'help' || !(command in steps || command === 'all')) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n').replaceAll('// ', ''));

    return;
  }

  const config = readConfig();

  if (command === 'all') {
    for (const step of ['check', 'fields', 'people', 'files']) {
      log(`--- ${step} ---`);
      await steps[step](config);
    }

    return;
  }

  await steps[command](config);
};

main().catch((error) => {
  console.error(`\nStopped: ${error.message}`);
  console.error('Fix the cause and run the same command again; it continues where it stopped.');
  process.exit(1);
});
