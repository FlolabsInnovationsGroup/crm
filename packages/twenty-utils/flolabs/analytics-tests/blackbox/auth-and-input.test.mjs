// Who may call the API and which input it refuses. Written from contract section 7.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ADMIN_EMAIL,
  LoginRefusedError,
  callAnalytics,
  createApiKey,
  getPermissionFlags,
  login,
  postGraphql,
  withLimitedRole,
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

const LIMITED_USER = 'phil.schiler@apple.dev';

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

test('a role without EXPORT_CSV gets FORBIDDEN from every query', async (t) => {
  const outcome = await withLimitedRole(adminToken, LIMITED_USER, async () => {
    const token = await login(LIMITED_USER);
    const flags = await getPermissionFlags(token);

    assert.ok(!flags.includes('EXPORT_CSV'), `the role still has it: ${flags}`);

    for (const queryName of ALL_QUERIES) {
      assertRefusedWithoutData(
        await callAnalytics(queryName, {}, token),
        `${queryName} as ${LIMITED_USER}`,
        ['FORBIDDEN'],
      );
    }
  });

  if (outcome.problem !== undefined) {
    t.skip(`The local CRM has no such user: ${outcome.problem}`);
  }
});

test('an API key is refused, even on a role that could read analytics', async (t) => {
  const apiKey = await createApiKey(adminToken);

  if (apiKey.token === undefined) {
    t.skip(`The seed user cannot make an API key here: ${apiKey.problem}`);

    return;
  }

  try {
    const people = await postGraphql({
      path: '/graphql',
      token: apiKey.token,
      query: 'query { people(first: 1) { edges { node { id } } } }',
    });

    assert.deepEqual(people.body?.errors ?? [], [], 'the key does not work at all');

    for (const queryName of ALL_QUERIES) {
      assertRefusedWithoutData(
        await callAnalytics(queryName, {}, apiKey.token),
        `${queryName} with an API key`,
        ['FORBIDDEN'],
      );
    }
  } finally {
    await apiKey.revoke();
  }
});

// Alone, introspection on /graphql reads the workspace schema, which has no core fields.
// A core field beside it makes the request read the core schema.
const API_SURFACE_QUERY = `query {
  getCrmAnalyticsMeta { payload }
  __schema {
    queryType { fields { name args { name } } }
    mutationType { fields { name } }
    types { name fields { name } inputFields { name type { kind name } } }
  }
}`;

const SECTION_7_QUERIES = {
  getCrmAnalyticsMeta: [],
  getCrmAnalyticsOverview: ['filter'],
  getCrmAnalyticsFunnel: ['filter'],
  getCrmAnalyticsCategories: ['filter', 'groupBy'],
  getCrmAnalyticsTrends: ['filter', 'metric', 'stageKey'],
  getCrmAnalyticsReports: [],
  getCrmAnalyticsReport: ['periodStart', 'periodType'],
};

test('the API is the seven queries of section 7, with no mutation and only two new types', async (t) => {
  const { body } = await postGraphql({
    path: '/graphql',
    token: adminToken,
    query: API_SURFACE_QUERY,
  });
  const schema = body?.data?.__schema;

  if (schema === undefined) {
    t.skip(`Introspection is not available here: ${body?.errors?.[0]?.message}`);

    return;
  }

  const namesAnalytics = ({ name }) => /crm_?analytics/i.test(name);

  assert.deepEqual(
    Object.fromEntries(
      schema.queryType.fields
        .filter(namesAnalytics)
        .map(({ name, args }) => [name, args.map((argument) => argument.name).sort()]),
    ),
    SECTION_7_QUERIES,
  );
  assert.deepEqual(
    (schema.mutationType?.fields ?? []).filter(namesAnalytics),
    [],
    'analytics never writes through the API',
  );

  const analyticsTypes = schema.types.filter(namesAnalytics);

  assert.deepEqual(
    analyticsTypes.map(({ name }) => name).sort(),
    ['CrmAnalyticsFilterInput', 'CrmAnalyticsPayload'],
  );
  assert.deepEqual(
    analyticsTypes
      .find(({ name }) => name === 'CrmAnalyticsPayload')
      .fields.map(({ name }) => name),
    ['payload'],
  );
  assert.deepEqual(
    analyticsTypes
      .find(({ name }) => name === 'CrmAnalyticsFilterInput')
      .inputFields.map(({ name, type }) => `${name}: ${type.kind} ${type.name}`)
      .sort(),
    ['dateFrom', 'dateTo', 'period', 'programKey', 'sourceKey', 'status', 'trackKey'].map(
      (name) => `${name}: SCALAR String`,
    ),
    'every filter field is a nullable string, checked by the server',
  );
});

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
