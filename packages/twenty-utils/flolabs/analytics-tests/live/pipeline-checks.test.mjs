// Contract section 9, P5 and P6 on the real server: the switches and guards that a unit
// test can only read as metadata. Every change here is put back when the check ends.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { openLocalCrm } = require('./lib/local-crm.cjs');

const METRIC_QUERIES = ['overview', 'funnel', 'categories', 'trends', 'reports', 'report'];
const PAST_THE_STALE_LIMIT_MINUTES = 120;

let crm;

before(async () => {
  crm = await openLocalCrm();
  await crm.runSync();
});

after(async () => {
  await crm?.cleanUp();
  await crm?.close();
});

test('P5 off switch on: every read is off, jobs write nothing. Off again: it all comes back', async () => {
  const before = await crm.analytics('overview');

  await crm.setOffSwitch(true);

  try {
    const meta = await crm.analytics('meta');

    assert.equal(meta.state, 'DISABLED');

    for (const queryName of METRIC_QUERIES) {
      assert.equal(await crm.analytics(queryName), null, `${queryName} while off`);
    }

    const logRowsBefore = await crm.syncLogCount();

    await crm.runSync();
    await crm.runDaily();

    assert.equal(await crm.syncLogCount(), logRowsBefore, 'a job while off logs nothing');
  } finally {
    await crm.setOffSwitch(false);
  }

  const logRowsBefore = await crm.syncLogCount();

  await crm.runSync();

  assert.equal(await crm.syncLogCount(), logRowsBefore + 1, 'the next sync runs and logs');
  assert.notEqual((await crm.analytics('meta')).state, 'DISABLED');
  assert.equal(
    (await crm.analytics('overview')).figures.totalContacts,
    before.figures.totalContacts,
    'the numbers are what they were',
  );
});

test('P6 no sync for over an hour: stale, and the numbers stay', async () => {
  await crm.runSync();

  const fresh = await crm.analytics('meta');

  assert.equal(fresh.sync.isStale, false, 'a sync just ran');

  const numbersBefore = await crm.analytics('overview');
  const undoAging = await crm.ageSyncLog(PAST_THE_STALE_LIMIT_MINUTES);

  try {
    const stale = await crm.analytics('meta');

    assert.equal(stale.sync.isStale, true);
    assert.notEqual(stale.sync.lastSuccessfulSyncAt, null);
    assert.ok(
      Date.parse(stale.sync.lastSuccessfulSyncAt) <
        Date.parse(fresh.sync.lastSuccessfulSyncAt),
    );

    const numbersWhileStale = await crm.analytics('overview');

    assert.notEqual(numbersWhileStale, null, 'stale keeps the numbers');
    assert.equal(
      numbersWhileStale.figures.totalContacts,
      numbersBefore.figures.totalContacts,
    );
  } finally {
    await undoAging();
  }

  assert.equal((await crm.analytics('meta')).sync.isStale, false, 'and it recovers');
});
