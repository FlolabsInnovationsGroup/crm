// Who may call the API and which input it refuses. Written from contract section 7.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ADMIN_EMAIL,
  LoginRefusedError,
  callAnalytics,
  getPermissionFlags,
  login,
} = require('./lib/api-client.cjs');

const ALL_QUERIES = [
  'meta',
  'overview',
  'funnel',
  'categories',
  'trends',
  'reports',
  'report',
];

// A full dev seed gives Phil the Guest role and Scott an impersonate-only role, neither
// with EXPORT_CSV. A light seed makes them members, so the flag is read, not assumed.
const LIMITED_USER_CANDIDATES = [
  'phil.schiler@apple.dev',
  'scott.forstall@apple.dev',
];

const adminToken = await login(ADMIN_EMAIL);

const assertRefusedWithoutData = (result, queryName, codes) => {
  assert.ok(
    codes.includes(result.code),
    `${queryName}: expected an error with code ${codes.join(' or ')}, got status ${result.status}, code ${result.code}, message ${result.message}`,
  );
  assert.equal(result.payload, null, `${queryName}: a refused call returned data`);
};

test('valid login: the seed user gets a signed token that the API accepts', async () => {
  const token = await login(ADMIN_EMAIL);

  assert.equal(token.split('.').length, 3, 'the token is not a JWT');

  const flags = await getPermissionFlags(token);

  assert.ok(
    flags.includes('EXPORT_CSV'),
    `the seed user lacks EXPORT_CSV, has: ${flags.join(', ')}`,
  );

  const meta = await callAnalytics('meta', {}, token);

  assert.deepEqual(meta.errors, []);
  assert.notEqual(meta.payload, null, 'meta is never null for an allowed user');
});

test('login with a wrong password is refused', async () => {
  await assert.rejects(
    () => login(ADMIN_EMAIL, 'not-the-password'),
    LoginRefusedError,
  );
});

for (const queryName of ALL_QUERIES) {
  test(`${queryName}: a request with no token is refused`, async () => {
    const result = await callAnalytics(queryName, {}, undefined);

    assertRefusedWithoutData(result, queryName, ['UNAUTHENTICATED', 'FORBIDDEN']);
  });

  test(`${queryName}: a request with a made-up token is refused`, async () => {
    const result = await callAnalytics(
      queryName,
      {},
      'aaaaaaaa.bbbbbbbb.cccccccc',
    );

    assertRefusedWithoutData(result, queryName, ['UNAUTHENTICATED', 'FORBIDDEN']);
  });
}

const findUserWithoutExportFlag = async () => {
  for (const email of LIMITED_USER_CANDIDATES) {
    let token;

    try {
      token = await login(email);
    } catch (error) {
      if (error instanceof LoginRefusedError) {
        continue;
      }

      throw error;
    }

    const flags = await getPermissionFlags(token);

    if (!flags.includes('EXPORT_CSV')) {
      return { email, token };
    }
  }

  return null;
};

const limitedUser = await findUserWithoutExportFlag();

for (const queryName of ALL_QUERIES) {
  test(`${queryName}: a role without EXPORT_CSV gets FORBIDDEN`, async (t) => {
    if (limitedUser === null) {
      t.skip(
        `No seed user without EXPORT_CSV among ${LIMITED_USER_CANDIDATES.join(', ')}. Use the full dev seed, not --light.`,
      );

      return;
    }

    const result = await callAnalytics(queryName, {}, limitedUser.token);

    assertRefusedWithoutData(
      result,
      `${queryName} as ${limitedUser.email}`,
      ['FORBIDDEN'],
    );
  });
}

const TOO_LONG = 'x'.repeat(201);

const BAD_INPUTS = [
  ['dateFrom is not a date', 'overview', { filter: { dateFrom: 'not-a-date' } }],
  ['dateFrom has a month 13', 'overview', { filter: { dateFrom: '2026-13-01' } }],
  ['dateFrom is February 30', 'funnel', { filter: { dateFrom: '2026-02-30' } }],
  ['dateTo uses slashes', 'overview', { filter: { dateTo: '2026/01/01' } }],
  ['dateTo holds SQL', 'funnel', { filter: { dateTo: "2026-01-01' OR '1'='1" } }],
  ['status is unknown', 'overview', { filter: { status: 'BOGUS' } }],
  ['status has the wrong case', 'funnel', { filter: { status: 'all' } }],
  ['period is unknown', 'trends', { filter: { period: 'YEAR' } }],
  ['trackKey is over 200 characters', 'overview', { filter: { trackKey: TOO_LONG } }],
  ['programKey is over 200 characters', 'funnel', { filter: { programKey: TOO_LONG } }],
  ['sourceKey is over 200 characters', 'categories', { filter: { sourceKey: TOO_LONG } }],
  ['groupBy is unknown', 'categories', { groupBy: 'NOPE' }],
  ['metric is unknown', 'trends', { metric: 'NOPE' }],
  ['stageKey is over 200 characters', 'trends', { metric: 'STAGE_COUNT', stageKey: TOO_LONG }],
  ['report periodType is DAY', 'report', { periodType: 'DAY' }],
  ['report periodStart is not a date', 'report', { periodStart: 'yesterday' }],
];

for (const [description, queryName, variables] of BAD_INPUTS) {
  test(`bad input is rejected: ${description}`, async () => {
    const result = await callAnalytics(queryName, variables, adminToken);

    assertRefusedWithoutData(result, `${queryName} with ${description}`, [
      'BAD_USER_INPUT',
    ]);
  });
}

test('good input at the 200 character limit is accepted', async () => {
  const result = await callAnalytics(
    'overview',
    { filter: { trackKey: 'x'.repeat(200) } },
    adminToken,
  );

  assert.deepEqual(result.errors, []);
});

for (const [settingName, value] of [
  ['trackKey', "x' OR '1'='1"],
  ['programKey', "x'; DROP SCHEMA analytics CASCADE; --"],
  ['sourceKey', 'x" OR "1"="1'],
]) {
  test(`${settingName} holding SQL reaches the query as a value and matches nobody`, async (t) => {
    const result = await callAnalytics(
      'overview',
      { filter: { [settingName]: value } },
      adminToken,
    );

    assert.deepEqual(result.errors, []);

    if (result.payload === null) {
      t.skip('overview has no numbers in this workspace state');

      return;
    }

    assert.equal(result.payload.figures.totalContacts, 0);

    const meta = await callAnalytics('meta', {}, adminToken);

    assert.notEqual(
      meta.payload.state,
      'NEVER_SYNCED',
      'the analytics schema is gone after a filter value',
    );
  });
}
