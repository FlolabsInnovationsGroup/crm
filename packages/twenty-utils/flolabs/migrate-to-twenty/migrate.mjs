#!/usr/bin/env node
// Copies People and their files from one Twenty CRM to another, through the
// public APIs only. It never writes to the source.
//
//   node migrate.mjs check            read both CRMs and say what would happen
//   node migrate.mjs fields           add the source's missing person fields to the target
//   node migrate.mjs people --limit 20   copy only 20 people, as a trial
//   node migrate.mjs people           copy every person (safe to run again)
//   node migrate.mjs files            download every file attached to a person
//   node migrate.mjs all              fields, people, then files
//
// Settings come from config.json next to this file (see config.example.json),
// or from a path given with --config <file>. Needs Node.js 18 or newer.
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
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

const argument = (name) => {
  const index = process.argv.indexOf(name);

  return index > 0 ? process.argv[index + 1] : undefined;
};

const command = process.argv[2] ?? 'help';
const here = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(argument('--config') ?? join(here, 'config.json'));
const limit = Number(argument('--limit') ?? 0) || 0;

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

    // Keys must not travel unencrypted.
    if (!/^https:\/\//.test(config[side].url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${config[side].url}/`)) {
      throw new Error(`${side}.url must start with https://`);
    }
  }

  config.onExisting ??= 'fill-empty';

  if (!['fill-empty', 'overwrite'].includes(config.onExisting)) {
    throw new Error('onExisting must be "fill-empty" or "overwrite".');
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
  const fieldSelection = 'name type label icon description isActive isSystem options defaultValue settings';
  let objects;

  try {
    const data = await metadata(
      crm,
      `query { objects(paging: { first: 1000 }) { edges { node { id nameSingular fieldsList { ${fieldSelection} } } } } }`,
    );

    objects = data.objects.edges.map(({ node }) => ({ ...node, fields: node.fieldsList }));
  } catch (error) {
    if (!/fieldsList/.test(error.message)) {
      throw error;
    }

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
  Boolean(field) && field.isActive !== false && !field.isSystem && COPYABLE_TYPES.has(field.type);

// Pages through a REST list until the end, handing each page to onPage.
// onPage returns false to stop early.
const forEachPage = async (crm, plural, onPage, { startAfter } = {}) => {
  let cursor = startAfter;

  for (;;) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), depth: '0' });

    if (cursor) {
      query.set('starting_after', cursor);
    }

    const json = await request(crm, `/rest/${plural}?${query}`);
    const records = Object.values(json.data ?? {})[0] ?? [];

    if ((await onPage(records, json.pageInfo?.endCursor)) === false) {
      return;
    }

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

// Spreadsheet apps run cells that start with these as formulas.
const csv = (value) => {
  const text = String(value ?? '');

  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

const appendCsv = (path, header, row) => {
  if (!existsSync(path)) {
    writeFileSync(path, `${header}\n`);
  }

  appendFileSync(path, `${row.map(csv).join(',')}\n`);
};

const primaryEmailOf = (person) => person.emails?.primaryEmail?.trim().toLowerCase() || null;

const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.values(value).every(isEmptyValue);
  }

  return false;
};

// The fields both CRMs define with the same type, and the select values the
// target accepts for each.
const getFieldPlan = (sourcePerson, targetPerson) => {
  const targetFields = new Map(targetPerson.fields.map((field) => [field.name, field]));
  const copied = [];
  const skipped = [];

  for (const field of sourcePerson.fields.filter(isCopyable)) {
    const target = targetFields.get(field.name);

    if (!isCopyable(target)) {
      skipped.push(`${field.name} (missing in the target)`);
    } else if (target.type !== field.type) {
      skipped.push(`${field.name} (${field.type} here, ${target.type} in the target)`);
    } else {
      copied.push({
        name: field.name,
        type: field.type,
        allowedValues: ['SELECT', 'MULTI_SELECT'].includes(field.type)
          ? new Set((target.options ?? []).map((option) => option.value))
          : null,
      });
    }
  }

  return { copied, skipped };
};

const check = async (config) => {
  const [sourcePerson, targetPerson] = await Promise.all([
    getObject(config.source, 'person'),
    getObject(config.target, 'person'),
  ]);
  const targetNames = new Set(targetPerson.fields.map((field) => field.name));
  const missing = sourcePerson.fields.filter(
    (field) => isCopyable(field) && !targetNames.has(field.name),
  );
  const { skipped } = getFieldPlan(sourcePerson, targetPerson);
  const people = await request(config.source, '/rest/people?limit=1&depth=0');
  const targetPeople = await request(config.target, '/rest/people?limit=1&depth=0');

  log(`Source: ${people.totalCount ?? '?'} people. Target: ${targetPeople.totalCount ?? '?'} people.`);
  log(
    missing.length === 0
      ? 'Every person field already exists in the target.'
      : `Fields the "fields" step will add to the target: ${missing.map((field) => field.name).join(', ')}`,
  );

  const mismatched = skipped.filter((entry) => !entry.endsWith('(missing in the target)'));

  if (mismatched.length > 0) {
    log(`Fields with a different type in the target, which will not be copied: ${mismatched.join(', ')}`);
  }

  log(
    config.onExisting === 'overwrite'
      ? 'People already in the target: FloLabs values replace theirs (empty FloLabs values never do).'
      : 'People already in the target: only their empty fields are filled; nothing of theirs is replaced.',
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
    if (!isCopyable(field) || targetNames.has(field.name)) {
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
              type: field.type,
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
  const { copied, skipped } = getFieldPlan(sourcePerson, targetPerson);
  const droppedValues = new Map();

  if (skipped.length > 0) {
    log(`Not copied: ${skipped.join(', ')}`);
  }

  const cleanValue = ({ name, type, allowedValues }, value) => {
    if (!allowedValues || isEmptyValue(value)) {
      return value;
    }

    const keep = (option) => {
      if (allowedValues.has(option)) {
        return true;
      }

      droppedValues.set(`${name}=${option}`, (droppedValues.get(`${name}=${option}`) ?? 0) + 1);

      return false;
    };

    return type === 'SELECT' ? (keep(value) ? value : null) : value.filter(keep);
  };

  const toCreatePayload = (person) =>
    Object.fromEntries(
      copied
        .map((field) => [field.name, cleanValue(field, person[field.name])])
        .filter(([, value]) => value !== undefined),
    );

  // Never blanks anything in the target, and keeps their emails, adding ours
  // as extra addresses.
  const toUpdatePayload = (person, existing) => {
    const payload = {};

    for (const field of copied) {
      const value = cleanValue(field, person[field.name]);

      if (isEmptyValue(value)) {
        continue;
      }

      if (field.type === 'EMAILS') {
        const known = new Set(
          [existing[field.name]?.primaryEmail, ...(existing[field.name]?.additionalEmails ?? [])]
            .filter(Boolean)
            .map((email) => email.toLowerCase()),
        );
        const extra = [value.primaryEmail, ...(value.additionalEmails ?? [])].filter(
          (email) => email && !known.has(email.toLowerCase()),
        );

        if (extra.length > 0) {
          payload[field.name] = {
            ...existing[field.name],
            additionalEmails: [...(existing[field.name]?.additionalEmails ?? []), ...extra],
          };
        }

        continue;
      }

      if (config.onExisting === 'overwrite' || isEmptyValue(existing[field.name])) {
        payload[field.name] = value;
      }
    }

    return payload;
  };

  log('Reading the people already in the target, to update them instead of duplicating...');
  const targetByEmail = new Map();

  await forEachPage(config.target, 'people', async (records) => {
    for (const record of records) {
      const email = primaryEmailOf(record);

      if (email) {
        targetByEmail.set(email, {
          ...Object.fromEntries(copied.map(({ name }) => [name, record[name]])),
          id: record.id,
        });
      }
    }
  });
  log(`${targetByEmail.size} people with an email in the target.`);

  const state = readState(config);
  state.people ??= { cursor: null, created: 0, updated: 0, unchanged: 0, failed: 0 };
  state.people.unchanged ??= 0;
  const mapPath = join(config.outputFolder, 'people-map.csv');
  const failuresPath = join(config.outputFolder, 'people-failures.csv');
  let seen = 0;

  const recordMap = (person, targetId) =>
    appendCsv(mapPath, 'sourceId,targetId,email', [person.id, targetId, primaryEmailOf(person)]);

  const recordFailure = (person, error) => {
    state.people.failed++;
    appendCsv(failuresPath, 'sourceId,email,error', [person.id, primaryEmailOf(person), error.message]);
  };

  const remember = (person, payload, targetId) => {
    const email = primaryEmailOf(person);

    if (email) {
      targetByEmail.set(email, { ...payload, id: targetId });
    }

    recordMap(person, targetId);
  };

  const updateOne = async (person, existing) => {
    const payload = toUpdatePayload(person, existing);

    if (Object.keys(payload).length === 0) {
      state.people.unchanged++;
      recordMap(person, existing.id);

      return;
    }

    try {
      await request(config.target, `/rest/people/${existing.id}`, { method: 'PATCH', body: payload });
      state.people.updated++;
      recordMap(person, existing.id);
    } catch (error) {
      recordFailure(person, error);
    }
  };

  const createOne = async (person, payload) => {
    try {
      await request(config.target, '/rest/people', {
        method: 'POST',
        body: { id: person.id, ...payload },
      });
      state.people.created++;
      remember(person, payload, person.id);
    } catch (error) {
      // Created on an earlier, interrupted run under the same id.
      if (error.status === 409 || /duplicate|already exists|unique/i.test(error.message)) {
        try {
          await request(config.target, `/rest/people/${person.id}`, {
            method: 'PATCH',
            body: toUpdatePayload(person, {}),
          });
          state.people.updated++;
          remember(person, payload, person.id);
        } catch (patchError) {
          recordFailure(person, patchError);
        }

        return;
      }

      recordFailure(person, error);
    }
  };

  await forEachPage(
    config.source,
    'people',
    async (records, endCursor) => {
      const page = limit > 0 ? records.slice(0, Math.max(0, limit - seen)) : records;
      const known = page.filter((person) => targetByEmail.has(primaryEmailOf(person)));
      const fresh = page.filter((person) => !known.includes(person));

      seen += page.length;

      for (let index = 0; index < fresh.length; index += BATCH_SIZE) {
        const batch = fresh
          .slice(index, index + BATCH_SIZE)
          .map((person) => ({ person, payload: toCreatePayload(person) }));

        try {
          await request(config.target, '/rest/batch/people', {
            method: 'POST',
            body: batch.map(({ person, payload }) => ({ id: person.id, ...payload })),
          });
          state.people.created += batch.length;
          batch.forEach(({ person, payload }) => remember(person, payload, person.id));
        } catch {
          // One bad record fails the whole batch, so retry them one by one.
          for (const { person, payload } of batch) {
            await createOne(person, payload);
          }
        }
      }

      for (const person of known) {
        await updateOne(person, targetByEmail.get(primaryEmailOf(person)));
      }

      // A trial run does not move the bookmark, so the full run starts over.
      if (endCursor && limit === 0) {
        state.people.cursor = endCursor;
      }

      writeState(config, state);
      log(
        `people: ${state.people.created} created, ${state.people.updated} updated, ${state.people.unchanged} already complete, ${state.people.failed} failed`,
      );

      return limit === 0 || seen < limit;
    },
    { startAfter: limit > 0 ? undefined : (state.people.cursor ?? undefined) },
  );

  if (droppedValues.size > 0) {
    log(
      `Select values your CRM does not have, left empty: ${[...droppedValues]
        .map(([key, count]) => `${key} (${count})`)
        .join(', ')}`,
    );
  }

  if (state.people.failed > 0) {
    log(`Some people failed. Details: ${failuresPath}`);
  }

  log(`People done. Which FloLabs id became which id in your CRM: ${mapPath}`);
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
  const header = 'personId,attachmentId,fileName,savedAs,error';
  const state = readState(config);
  state.files ??= { cursor: null, downloaded: 0, failed: 0 };
  mkdirSync(folder, { recursive: true });

  await forEachPage(
    config.source,
    'attachments',
    async (records, endCursor) => {
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
          // Written under another name first, so a cut download is retried.
          await pipeline(Readable.fromWeb(response.body), createWriteStream(`${savedAs}.part`));
          renameSync(`${savedAs}.part`, savedAs);
          state.files.downloaded++;
          appendCsv(indexPath, header, [personId, record.id, fileName, savedAs, '']);
        } catch (error) {
          state.files.failed++;
          appendCsv(indexPath, header, [personId, record.id, fileName, '', error.message]);
        }
      }

      if (endCursor) {
        state.files.cursor = endCursor;
      }

      writeState(config, state);
      log(`files: ${state.files.downloaded} downloaded, ${state.files.failed} failed`);
    },
    { startAfter: state.files.cursor ?? undefined },
  );

  log(`Files done. They are in ${folder}, one folder per FloLabs person id, listed in ${indexPath}.`);
};

const steps = { check, fields, people, files };

const main = async () => {
  if (!(command in steps || command === 'all')) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 14)
        .map((line) => line.replace(/^\/\/ ?/, ''))
        .join('\n'),
    );

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
