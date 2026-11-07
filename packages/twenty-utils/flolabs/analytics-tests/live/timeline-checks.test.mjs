// Contract section 9, T1 to T11: do real changes on the running CRM leave the timeline rows
// the sync depends on? The integration layer writes its rows by hand, so this is what proves
// those rows are the real shape. Each check makes its own people and removes them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { openLocalCrm } = require('./lib/local-crm.cjs');

const RESULTS_ROOT = process.env.ANALYTICS_TEST_RESULTS_DIR;
const OBSERVATIONS_FILE =
  RESULTS_ROOT === undefined
    ? undefined
    : path.join(RESULTS_ROOT, 'timeline-observations.json');

const NEW = 'NEW';
const CONTACTED = 'CONTACTED';
const ATTENDED = 'ATTENDED';
const INTERESTED = 'INTERESTED';
const RENAME_FROM = 'ANALYTICS_LIVE_OLD';
const RENAME_TO = 'ANALYTICS_LIVE_NEW';
const MERGE_WINDOW_MINUTES = 11;

// T7, T8, T10 and T11 say "record what happens", so it is kept for a person to read.
const observations = {};
const observe = (check, value) => {
  observations[check] = value;
};

const stagesOf = (rows) => rows.map((row) => row.properties.diff.stage);

let crm;
let stageField;
let setupProblem;

before(async () => {
  crm = await openLocalCrm();

  const { field, problem } = await crm.ensureStageOptions([
    NEW,
    CONTACTED,
    ATTENDED,
    INTERESTED,
  ]);

  stageField = field;
  setupProblem = problem;
});

after(async () => {
  if (OBSERVATIONS_FILE !== undefined) {
    fs.writeFileSync(
      OBSERVATIONS_FILE,
      `${JSON.stringify({ at: new Date().toISOString(), observations }, null, 2)}\n`,
    );
  }

  await crm?.cleanUp();
  await crm?.close();
});

// A check that cannot run here must not read as a pass.
const needsStageField = (t) => {
  if (setupProblem !== undefined) {
    t.skip(setupProblem);

    return false;
  }

  return true;
};

test('stop rule: the Stage field is audit logged, or the funnel has no rows at all', (t) => {
  if (!needsStageField(t)) {
    return;
  }

  assert.equal(stageField.isAuditLogged, true);
  assert.equal(stageField.type, 'SELECT');
});

test('T1 one change by a workspace member: one row of the expected shape, one transition', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);

  const rows = await crm.waitForRowEndingAt(person.id, CONTACTED);

  assert.equal(rows.length, 1);

  const [row] = rows;

  // The exact shape integration/lib/crm-tables.cjs writes by hand.
  assert.deepEqual(row.properties, {
    diff: { stage: { before: NEW, after: CONTACTED } },
  });
  assert.equal(row.targetPersonId, person.id);
  assert.equal(row.linkedRecordId, null);
  assert.notEqual(row.workspaceMemberId, null);
  assert.ok(row.happensAt instanceof Date);

  await crm.runSync();

  const stored = await crm.transitions(person.id);

  assert.deepEqual(await crm.moves(person.id), [`${NEW}>${CONTACTED} timeline`]);
  assert.equal(stored[0].sourceId, row.id);
  assert.equal(stored[0].happenedAt.getTime(), row.happensAt.getTime());
  assert.equal(stored[0].sourceUpdatedAt.getTime(), row.updatedAt.getTime());
});

test('T2 a second change inside 10 minutes updates the same row, and both moves are stored', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);

  const [firstRow] = await crm.waitForRowEndingAt(person.id, CONTACTED);

  await crm.runSync();

  const [firstTransition] = await crm.transitions(person.id);

  await crm.setStage(person.id, ATTENDED);

  const rows = await crm.waitForRowEndingAt(person.id, ATTENDED);

  assert.equal(rows.length, 1, 'the CRM merged in place');
  assert.equal(rows[0].id, firstRow.id);
  assert.deepEqual(rows[0].properties.diff.stage, { before: NEW, after: ATTENDED });
  assert.equal(rows[0].happensAt.getTime(), firstRow.happensAt.getTime(), 'happensAt stays');
  assert.ok(rows[0].updatedAt > firstRow.updatedAt, 'updatedAt moves');

  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [
    `${NEW}>${CONTACTED} timeline`,
    `${CONTACTED}>${ATTENDED} timeline`,
  ]);

  const stored = await crm.transitions(person.id);

  assert.deepEqual(stored[0], firstTransition, 'a stored row never changes');
  assert.equal(
    stored[1].happenedAt.getTime(),
    rows[0].updatedAt.getTime(),
    'a merged move happened when the row was updated',
  );

  await crm.runSync();

  assert.equal((await crm.transitions(person.id)).length, 2, 'a rerun adds nothing');
});

test('T3 there and back, with a sync between: the backward move is appended', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);
  await crm.runSync();
  await crm.setStage(person.id, NEW);
  await crm.waitForRowEndingAt(person.id, NEW);
  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [
    `${NEW}>${CONTACTED} timeline`,
    `${CONTACTED}>${NEW} timeline`,
  ]);
});

test('T3 there and back with no sync between: before equals after, and no count moves', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const contactedBefore = (await crm.analytics('funnel'))?.rows.find(
    ({ stageKey }) => stageKey === CONTACTED,
  )?.entered;
  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);
  await crm.setStage(person.id, NEW);

  const rows = await crm.waitForRowEndingAt(person.id, NEW);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].properties.diff.stage, { before: NEW, after: NEW });

  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [`${NEW}>${NEW} timeline`]);

  const contactedAfter = (await crm.analytics('funnel'))?.rows.find(
    ({ stageKey }) => stageKey === CONTACTED,
  )?.entered;

  assert.equal(contactedAfter, contactedBefore, 'a no-op row counts as nothing reached');
});

test('T4 a change after 11 minutes: a new row and a new transition', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);
  await crm.ageTimelineRows(person.id, MERGE_WINDOW_MINUTES);
  await crm.setStage(person.id, ATTENDED);

  const rows = await crm.waitForRowEndingAt(person.id, ATTENDED);

  assert.deepEqual(stagesOf(rows), [
    { before: NEW, after: CONTACTED },
    { before: CONTACTED, after: ATTENDED },
  ]);

  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [
    `${NEW}>${CONTACTED} timeline`,
    `${CONTACTED}>${ATTENDED} timeline`,
  ]);
});

test('T5 a change through an API key: its own row with no member, not merged into the member row', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);

  const outcome = await crm.withApiKey((apiKeyToken) =>
    crm.patchPersonWithApiKey(apiKeyToken, person.id, { stage: ATTENDED }),
  );

  if (outcome.problem !== undefined) {
    t.skip(`The seed user cannot make an API key here: ${outcome.problem}`);

    return;
  }

  const rows = await crm.waitForRowEndingAt(person.id, ATTENDED);

  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].workspaceMemberId, null);
  assert.equal(rows[1].workspaceMemberId, null);
  assert.deepEqual(rows[1].properties.diff.stage, { before: CONTACTED, after: ATTENDED });

  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [
    `${NEW}>${CONTACTED} timeline`,
    `${CONTACTED}>${ATTENDED} timeline`,
  ]);
});

test('T6 a bulk update: one row per person, and one transition each', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const people = await Promise.all([
    crm.createPerson({ stage: NEW }),
    crm.createPerson({ stage: NEW }),
    crm.createPerson({ stage: NEW }),
  ]);

  await crm.setStageForMany(
    people.map(({ id }) => id),
    CONTACTED,
  );

  for (const person of people) {
    const rows = await crm.waitForRowEndingAt(person.id, CONTACTED);

    assert.deepEqual(stagesOf(rows), [{ before: NEW, after: CONTACTED }]);
  }

  await crm.runSync();

  for (const person of people) {
    assert.deepEqual(await crm.moves(person.id), [`${NEW}>${CONTACTED} timeline`]);
  }
});

const FORM_DEFINITION = {
  version: 1,
  title: 'Analytics live form',
  fields: [
    {
      id: 'email',
      type: 'email',
      label: 'Email',
      required: true,
      choiceDisplay: 'auto',
      mapTo: 'emails.primaryEmail',
      visibleWhenMatch: 'all',
      visibleWhenGroupsMatch: 'any',
      requiredWhenGroupsMatch: 'any',
      width: 'full',
    },
  ],
  theme: {},
  settings: {},
  // The same action the three follow-up forms carry, for example websites-presentations.json.
  actions: [
    {
      id: 'mark_interested',
      whenMatch: 'any',
      type: 'setPersonValues',
      values: [{ mapTo: 'stage', value: INTERESTED }],
    },
  ],
};

test('T7 a published form that sets Stage = INTERESTED reaches the timeline, keeps the furthest stage', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  if (!(await crm.hasFormObjects())) {
    t.skip(
      'The Apple workspace has no form objects. Run packages/twenty-utils/flolabs/setup-forms.mjs on the local CRM.',
    );

    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);
  await crm.runSync();

  const contactedBefore = (await crm.analytics('funnel'))?.rows.find(
    ({ stageKey }) => stageKey === CONTACTED,
  )?.entered;
  const formId = await crm.createPublishedForm(FORM_DEFINITION);

  try {
    await crm.submitPublicForm(formId, { email: person.email });

    const rows = await crm.waitForRowEndingAt(person.id, INTERESTED);
    const formRow = rows.at(-1);

    observe('T7', {
      rows: stagesOf(rows),
      formRowHasMember: formRow.workspaceMemberId !== null,
    });

    assert.equal(formRow.properties.diff.stage.after, INTERESTED);
    assert.equal(
      formRow.workspaceMemberId,
      null,
      'a public form has no member, so it cannot merge into a member row',
    );
    assert.equal((await crm.readPersonStage(person.id)).stage, INTERESTED);

    await crm.runSync();

    assert.deepEqual(await crm.moves(person.id), [
      `${NEW}>${CONTACTED} timeline`,
      `${CONTACTED}>${INTERESTED} timeline`,
    ]);

    const funnel = await crm.analytics('funnel');

    assert.equal(
      funnel?.rows.find(({ stageKey }) => stageKey === CONTACTED)?.entered,
      contactedBefore,
      'furthest stage ever reached is unchanged',
    );

    const overview = await crm.analytics('overview');

    assert.ok(
      overview.stageTotals.find(({ rowKey }) => rowKey === INTERESTED)?.count > 0,
      'the person now counts under Interested',
    );
  } finally {
    await crm.destroyForm(formId);
  }
});

test('T8 an import that changes Stage: recorded, and the move is not lost either way', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: NEW });

  await crm.setStage(person.id, CONTACTED);
  await crm.waitForRowEndingAt(person.id, CONTACTED);
  await crm.ageTimelineRows(person.id, MERGE_WINDOW_MINUTES);
  await crm.runSync();

  await crm.importPeople([{ id: person.id, stage: ATTENDED }]);

  assert.equal((await crm.readPersonStage(person.id)).stage, ATTENDED);

  // No row within this wait is itself the answer contract T8 asks for.
  const rows = await crm
    .waitForStageRow(
      person.id,
      (candidates) => candidates.at(-1)?.properties.diff.stage.after === ATTENDED,
      'the import',
      15_000,
    )
    .catch(() => null);

  observe('T8', {
    importLeavesATimelineRow: rows !== null,
    rows: rows === null ? [] : stagesOf(rows),
  });

  if (rows === null) {
    await crm.backdatePersonUpdate(person.id);
    await crm.runDaily();

    assert.deepEqual(await crm.moves(person.id), [
      `${NEW}>${CONTACTED} timeline`,
      `${CONTACTED}>${ATTENDED} reconcile`,
    ]);
  } else {
    await crm.runSync();

    assert.deepEqual(await crm.moves(person.id), [
      `${NEW}>${CONTACTED} timeline`,
      `${CONTACTED}>${ATTENDED} timeline`,
    ]);
  }
});

test('T9 creating a person with a stage: properties are empty, and the first stage comes from the person', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const person = await crm.createPerson({ stage: CONTACTED });
  const [creationRow] = await crm.waitForAnyRow(person.id);

  assert.deepEqual(creationRow.properties, {});

  await crm.runSync();

  assert.deepEqual(await crm.moves(person.id), [], 'a creation row is no stage change');

  await crm.backdatePersonUpdate(person.id);
  await crm.runDaily();

  assert.deepEqual(await crm.moves(person.id), [], 'and reconcile has nothing to restore');

  await crm.setStage(person.id, ATTENDED);
  await crm.waitForRowEndingAt(person.id, ATTENDED);
  await crm.runSync();

  assert.deepEqual(
    await crm.moves(person.id),
    [`${CONTACTED}>${ATTENDED} timeline`],
    'the later before value holds the first stage',
  );
});

test('T10 renaming a stage option: recorded, and a rerun repeats nothing', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const { field } = await crm.ensureStageOptions([RENAME_FROM]);
  const person = await crm.createPerson({ stage: NEW });

  try {
    await crm.setStage(person.id, RENAME_FROM);

    const [rowBeforeRename] = await crm.waitForRowEndingAt(person.id, RENAME_FROM);

    await crm.runSync();

    await crm.updateStageOptions(
      field.id,
      field.options.map((option) =>
        option.value === RENAME_FROM
          ? { ...option, value: RENAME_TO, label: RENAME_TO }
          : option,
      ),
    );

    const personAfter = await crm.readPersonStage(person.id);
    const [rowAfterRename] = await crm.stageRowsOf(person.id);

    observe('T10', {
      personStageAfterRename: personAfter.stage,
      oldTimelineRowAfter: rowAfterRename.properties.diff.stage,
      movesBeforeDaily: await crm.moves(person.id),
    });

    assert.equal(personAfter.stage, RENAME_TO, 'the CRM rewrites the person');
    assert.deepEqual(
      rowAfterRename.properties,
      rowBeforeRename.properties,
      'the old row keeps the old raw value, which is why an alias is needed',
    );

    await crm.runSync();

    assert.deepEqual(
      await crm.moves(person.id),
      [`${NEW}>${RENAME_FROM} timeline`],
      'a rename leaves no new timeline row for the sync to read',
    );

    await crm.backdatePersonUpdate(person.id);
    await crm.runDaily();

    // Neither value has an alias here, so reconcile sees a real difference. With an alias
    // there is none: integration check C2 proves that on the shape T1 proves here.
    const afterDaily = await crm.moves(person.id);

    observe('T10', { ...observations.T10, movesAfterDaily: afterDaily });
    assert.deepEqual(afterDaily, [
      `${NEW}>${RENAME_FROM} timeline`,
      `${RENAME_FROM}>${RENAME_TO} reconcile`,
    ]);

    await crm.runDaily();

    assert.deepEqual(await crm.moves(person.id), afterDaily, 'a rerun repeats nothing');
  } finally {
    await crm.setStage(person.id, NEW);

    const current = await crm.readStageField();

    await crm.updateStageOptions(
      current.id,
      current.options.filter(
        ({ value }) => value !== RENAME_TO && value !== RENAME_FROM,
      ),
    );
  }
});

test('T11 merging two people: recorded, the total drops by one, and stored moves stay', async (t) => {
  if (!needsStageField(t)) {
    return;
  }

  const kept = await crm.createPerson({ stage: NEW });
  const merged = await crm.createPerson({ stage: NEW });

  await crm.setStage(kept.id, CONTACTED);
  await crm.setStage(merged.id, ATTENDED);
  await crm.waitForRowEndingAt(kept.id, CONTACTED);
  await crm.waitForRowEndingAt(merged.id, ATTENDED);
  await crm.runSync();

  const totalBefore = (await crm.analytics('overview')).figures.totalContacts;
  const result = await crm.mergePeople([kept.id, merged.id]);

  crm.trackPerson(result.id);

  const survivor = result.id;
  const loser = survivor === kept.id ? merged.id : kept.id;
  const overview = await crm.analytics('overview');

  observe('T11', {
    survivorIsFirstId: survivor === kept.id,
    survivorRows: stagesOf(await crm.stageRowsOf(survivor)),
    loserRows: stagesOf(await crm.stageRowsOf(loser)),
    survivorStage: (await crm.readPersonStage(survivor))?.stage,
    loserState: await crm.readPersonStage(loser),
    survivorMoves: await crm.moves(survivor),
    loserMoves: await crm.moves(loser),
  });

  assert.equal(overview.figures.totalContacts, totalBefore - 1, 'one person left of two');
  assert.equal(
    overview.stageTotals
      .filter(({ rowKind }) => rowKind !== 'NESTED')
      .reduce((sum, { count }) => sum + count, 0),
    overview.figures.totalContacts,
    'stage totals still sum to total contacts',
  );

  const storedKept = await crm.moves(kept.id);
  const storedMerged = await crm.moves(merged.id);

  assert.ok(storedKept.includes(`${NEW}>${CONTACTED} timeline`), 'stored moves stay');
  assert.ok(storedMerged.includes(`${NEW}>${ATTENDED} timeline`), 'stored moves stay');

  await crm.runSync();

  const afterFirstSync = [await crm.moves(kept.id), await crm.moves(merged.id)];

  await crm.runSync();

  assert.deepEqual(
    [await crm.moves(kept.id), await crm.moves(merged.id)],
    afterFirstSync,
    'a rerun adds nothing',
  );
});
