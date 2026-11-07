// What the API answers, whatever data the local CRM holds: every payload matches its
// section 7 type and the section 6 definitions hold on the real numbers. A check that
// has nothing to look at in this workspace skips with the reason, it does not pass.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ADMIN_EMAIL,
  callAnalytics,
  login,
} = require('./lib/api-client.cjs');
const shapes = require('./lib/contract-shapes.cjs');

const DAY_MS = 86_400_000;
const FAR_FUTURE_RANGE = { dateFrom: '2099-01-01', dateTo: '2099-01-31' };
const CLOSE_ENOUGH = 1e-9;
const STALE_AFTER_MINUTES = 60;

const token = await login(ADMIN_EMAIL);
const call = async (queryName, variables = {}) => {
  const result = await callAnalytics(queryName, variables, token);

  assert.deepEqual(
    result.errors,
    [],
    `${queryName} ${JSON.stringify(variables)} returned errors`,
  );

  return result.payload;
};

const meta = await call('meta');

const localDateOf = (timestamp) =>
  new Date(timestamp).toLocaleDateString('en-CA', {
    timeZone: meta.reportingTimeZone,
  });

const addDays = (localDate, days) =>
  new Date(Date.parse(localDate) + days * DAY_MS).toISOString().slice(0, 10);

const assertShape = (shape, value) => {
  const mismatches = shapes.check(shape, value);

  assert.ok(
    mismatches.length === 0,
    `not the contract section 7 type: ${mismatches.join('; ')}`,
  );
};

const assertClose = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < CLOSE_ENOUGH,
    `${label}: expected ${expected}, got ${actual}`,
  );

// Null payloads are legal only while the page cannot show numbers.
const hasNumbers = (t, payload, queryName) => {
  if (payload !== null) {
    return true;
  }

  assert.notEqual(meta.state, 'READY', `${queryName} is null in a READY workspace`);
  t.skip(`${queryName} has no numbers while the workspace state is ${meta.state}`);

  return false;
};

const rankedStages = () =>
  meta.stages
    .filter((stage) => stage.rank !== null)
    .sort((left, right) => left.rank - right.rank);

const sumOf = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0);

const assertFunnelRow = (row, minimumSample, isFinal) => {
  const where = `row ${row.stageKey}`;

  assert.equal(
    row.medianDays === null,
    row.completedStays === 0,
    `${where}: a median exists exactly when a stay was completed`,
  );

  if (row.medianDays !== null) {
    assertClose(
      row.medianDays,
      Math.round(row.medianDays * 10) / 10,
      `${where}: medianDays leaves the server at one decimal`,
    );
  }

  if (isFinal) {
    // No next stage, so the step columns are 0 or null (contract section 6).
    assert.equal(row.reachedNext, 0, `${where} reachedNext`);
    assert.equal(row.timedOut, 0, `${where} timedOut`);
    assert.equal(row.exited, 0, `${where} exited`);
    assert.equal(row.stepRate, null, `${where} stepRate`);
    assert.equal(row.dropOffRate, null, `${where} dropOffRate`);

    return;
  }

  assert.equal(
    row.entered,
    row.eligible + row.inWindow,
    `${where}: entered = eligible + inWindow`,
  );
  assert.equal(
    row.eligible,
    row.reachedNext + row.timedOut + row.exited,
    `${where}: eligible = reachedNext + timedOut + exited`,
  );
  assert.equal(
    row.isUnderMinimum,
    row.eligible < minimumSample,
    `${where}: isUnderMinimum`,
  );

  if (row.eligible === 0) {
    assert.equal(row.stepRate, null, `${where}: stepRate with nobody eligible`);
    assert.equal(row.dropOffRate, null, `${where}: dropOffRate with nobody eligible`);
  } else {
    assertClose(row.stepRate, row.reachedNext / row.eligible, `${where} stepRate`);
    assertClose(
      row.dropOffRate,
      (row.eligible - row.reachedNext) / row.eligible,
      `${where} dropOffRate`,
    );
  }

  if (row.entered === 0) {
    assert.equal(row.soFarRate, null, `${where}: soFarRate with nobody entered`);
  } else {
    const soFarPeople = row.soFarRate * row.entered;

    assertClose(soFarPeople, Math.round(soFarPeople), `${where}: soFarRate is a share of people`);
    assert.ok(
      Math.round(soFarPeople) >= row.reachedNext,
      `${where}: so far counts everyone who reached the next step`,
    );
  }
};

const assertFunnelNumbers = (funnel) => {
  funnel.rows.forEach((row, index) => {
    assertFunnelRow(row, funnel.minimumSample, index === funnel.rows.length - 1);

    if (index > 0) {
      assert.ok(
        row.entered <= funnel.rows[index - 1].entered,
        `${row.stageKey}: reaching a stage counts as reaching every stage before it`,
      );
    }
  });

  assert.equal(
    funnel.rows[0]?.entered,
    funnel.cohortSize,
    'everyone in the cohort entered the first stage',
  );

  const { overall } = funnel;

  assert.ok(overall.reached <= overall.eligible, 'overall reached <= eligible');
  assert.ok(
    overall.eligible <= (funnel.rows[0]?.entered ?? 0),
    'overall eligible people all entered the first stage',
  );
  assert.ok(
    overall.reached <= (funnel.rows.at(-1)?.entered ?? 0),
    'overall reached people all entered the final stage',
  );
  assert.equal(overall.isUnderMinimum, overall.eligible < funnel.minimumSample);

  if (overall.eligible === 0) {
    assert.equal(overall.rate, null, 'overall rate with nobody eligible');
  } else {
    assertClose(overall.rate, overall.reached / overall.eligible, 'overall rate');
  }

  // Section 6: the first step is left out only when another step qualifies.
  const qualifying = funnel.rows
    .slice(0, -1)
    .filter((row) => row.eligible >= funnel.minimumSample);
  const candidates =
    qualifying.length > 1
      ? qualifying.filter((row) => row !== funnel.rows[0])
      : qualifying;

  if (candidates.length === 0) {
    assert.equal(funnel.lowestStepStageKey, null, 'no step has the minimum sample');
  } else {
    const lowest = candidates.find(
      (row) => row.stageKey === funnel.lowestStepStageKey,
    );

    assert.ok(lowest, `lowest step ${funnel.lowestStepStageKey} does not qualify`);
    assert.equal(
      lowest.stepRate,
      Math.min(...candidates.map((row) => row.stepRate)),
      'the lowest step has the lowest rate among those that qualify',
    );
  }
};

// Walks every nested object, so a new nesting cannot escape the unknown-is-null rule.
const assertUnknownIsNull = (value, path = 'payload') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertUnknownIsNull(item, `${path}[${index}]`));

    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  if (value.eligible === 0) {
    for (const key of ['rate', 'stepRate', 'dropOffRate']) {
      if (key in value) {
        assert.equal(value[key], null, `${path}.${key} is 0 or a number with nobody eligible`);
      }
    }
  }

  if (value.overallEligible === 0) {
    assert.equal(value.overallRate, null, `${path}.overallRate with nobody eligible`);
  }

  if (value.entered === 0 && 'soFarRate' in value) {
    assert.equal(value.soFarRate, null, `${path}.soFarRate with nobody entered`);
  }

  if ('isMature' in value) {
    assert.equal(value.isMature, value.eligible === value.entered, `${path}.isMature`);
    assert.ok(value.eligible <= value.entered, `${path}: eligible <= entered`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertUnknownIsNull(child, `${path}.${key}`);
  }
};

test('meta matches its type and its rules', () => {
  assertShape(shapes.META, meta);

  const stages = rankedStages();

  assert.ok(stages.length > 0, 'there is no ranked stage');
  assert.deepEqual(
    stages.map((stage) => stage.rank),
    stages.map((_, index) => index),
    'ranks are contiguous from 0',
  );
  assert.equal(
    meta.stages.filter((stage) => stage.isSuccess).length,
    1,
    'exactly one success stage',
  );
  assert.equal(stages.at(-1).isSuccess, true, 'the last ranked stage is the success stage');
  assert.equal(stages.at(-1).windowDays, null, 'the last ranked stage has no window');
  assert.equal(stages.at(-1).limitDays, null, 'the success stage has no stuck limit');

  for (const stage of meta.stages) {
    assert.equal(
      stage.rank !== null,
      stage.kind === 'MAIN',
      `${stage.stageKey}: only main stages have a rank`,
    );
  }

  const trackKeys = meta.tracks.map((track) => track.key);

  for (const program of meta.programs) {
    assert.ok(
      trackKeys.includes(program.trackKey) || program.trackKey === 'UNMAPPED',
      `program ${program.key} points at unknown track ${program.trackKey}`,
    );
  }
});

test('meta state follows the field statuses and the sync log', (t) => {
  if (meta.state === 'DISABLED') {
    t.skip('analytics is switched off in this workspace');

    return;
  }

  assert.equal(
    meta.state === 'NO_STAGE_FIELD',
    meta.fields.stage !== 'OK',
    `state ${meta.state} with stage field ${meta.fields.stage}`,
  );

  if (meta.state === 'READY') {
    assert.notEqual(meta.sync.lastSuccessfulSyncAt, null, 'READY without a successful sync');
  }

  if (meta.sync.lastSuccessfulSyncAt !== null) {
    const syncAgeMinutes =
      (Date.parse(meta.asOf) - Date.parse(meta.sync.lastSuccessfulSyncAt)) / 60000;

    assert.equal(
      meta.sync.isStale,
      syncAgeMinutes > STALE_AFTER_MINUTES,
      `last sync ${syncAgeMinutes} minutes old, isStale ${meta.sync.isStale}`,
    );
  }
});

test('overview matches its type, and stage totals sum to total contacts', async (t) => {
  const overview = await call('overview');

  if (!hasNumbers(t, overview, 'overview')) {
    return;
  }

  assertShape(shapes.OVERVIEW, overview);

  const { figures, stageTotals, stuck } = overview;
  const topRows = stageTotals.filter((row) => row.rowKind !== 'NESTED');

  assert.equal(
    sumOf(topRows, 'count'),
    figures.totalContacts,
    'top rows of stage totals sum to total contacts',
  );
  assert.equal(overview.importedExcludedByDate, 0, 'no date filter excludes nobody');

  for (const row of topRows) {
    const stage = meta.stages.find(({ stageKey }) => stageKey === row.rowKey);

    assert.equal(
      row.pastLimitCount === null,
      (stage?.limitDays ?? null) === null,
      `${row.rowKey}: past limit is null exactly when the stage has no limit`,
    );
  }

  if (stuck.hasLimits) {
    assert.equal(
      topRows.reduce((sum, row) => sum + (row.pastLimitCount ?? 0), 0),
      figures.stuckPeople,
      'past limit counts sum to the stuck figure',
    );
  }

  for (const nested of stageTotals.filter((row) => row.rowKind === 'NESTED')) {
    const parent = topRows.find((row) => row.rowKey === nested.parentStageKey);

    assert.ok(parent, `nested row ${nested.rowKey} has no parent row`);
    assert.ok(
      nested.count <= parent.count,
      `nested row ${nested.rowKey} is larger than its parent`,
    );
  }

  assert.ok(figures.activePeople <= figures.totalContacts, 'active <= total');
  assert.equal(figures.stuckPeople, stuck.total, 'stuck figure equals the list total');
  assert.ok(stuck.rows.length <= 100, 'stuck list is capped at 100 rows');
  assert.ok(stuck.rows.length <= stuck.total, 'stuck rows <= stuck total');

  assert.equal(
    figures.newApplications === null,
    !meta.fields.hasFormSubmissionObject,
    'new applications are null exactly when there is no submission object',
  );
  assert.equal(
    figures.importedApplications === null,
    !meta.fields.hasApplicationObject,
    'imported applications are null exactly when there is no application object',
  );
  assert.equal(
    figures.signedPeople === null,
    !meta.showSignedFigure,
    'signed people are null exactly when the figure is hidden',
  );
});

test('overview new applications span defaults to the last 7 local days', async (t) => {
  const overview = await call('overview');

  if (!hasNumbers(t, overview, 'overview')) {
    return;
  }

  const { newApplicationsFrom, newApplicationsTo } = overview.figures;

  assert.equal(
    (Date.parse(newApplicationsTo) - Date.parse(newApplicationsFrom)) / DAY_MS,
    6,
    `${newApplicationsFrom} to ${newApplicationsTo} is not 7 days`,
  );
  assert.equal(
    newApplicationsTo.slice(0, 10),
    localDateOf(overview.asOf),
    'the span ends today in the reporting zone',
  );
});

test('stuck rows are sorted by days over the limit and each is past it', async (t) => {
  const overview = await call('overview');

  if (!hasNumbers(t, overview, 'overview')) {
    return;
  }

  const { rows, hasLimits } = overview.stuck;

  if (rows.length === 0) {
    t.skip('nobody is stuck in this workspace');

    return;
  }

  const sortValue = (row) => (hasLimits ? row.daysOverLimit : row.daysInStage);

  rows.forEach((row, index) => {
    const stage = meta.stages.find(({ stageKey }) => stageKey === row.stageKey);

    assert.ok(row.displayName.length > 0, `row ${index} has no name`);
    assert.ok(stage, `row ${index} is in unknown stage ${row.stageKey}`);
    // The limit compares whole days, as the table shows them: 14 days 6 hours is 14.
    assert.equal(
      row.daysInStage,
      Math.floor((Date.parse(overview.asOf) - Date.parse(row.stageEnteredAt)) / DAY_MS),
      `row ${index}: days in stage are whole days since it entered`,
    );

    if (hasLimits) {
      assert.ok(row.daysOverLimit > 0, `row ${index} is not over its limit`);
      assert.equal(
        row.daysOverLimit,
        row.daysInStage - stage.limitDays,
        `row ${index}: days over limit`,
      );
    } else {
      assert.equal(row.daysOverLimit, null, `row ${index}: no limit, so nothing over it`);
    }

    if (index > 0) {
      assert.ok(
        sortValue(row) <= sortValue(rows[index - 1]),
        `row ${index} is out of order`,
      );
    }
  });
});

test('a default filter written out gives the same numbers as an empty one', async (t) => {
  const empty = await call('funnel');

  if (!hasNumbers(t, empty, 'funnel')) {
    return;
  }

  const explicit = await call('funnel', {
    filter: {
      dateFrom: null,
      dateTo: null,
      trackKey: null,
      programKey: null,
      sourceKey: null,
      status: 'ALL',
      period: 'WEEK',
    },
  });

  assert.deepEqual(explicit.rows, empty.rows);
  assert.equal(explicit.cohortSize, empty.cohortSize);
});

test('funnel matches its type and every section 6 identity on real rows', async (t) => {
  const funnel = await call('funnel');

  if (!hasNumbers(t, funnel, 'funnel')) {
    return;
  }

  assertShape(shapes.FUNNEL, funnel);
  assert.deepEqual(
    funnel.rows.map((row) => row.stageKey),
    rankedStages().map((stage) => stage.stageKey),
    'one funnel row per ranked stage, in rank order',
  );
  assert.equal(
    funnel.overall.finalStageKey,
    meta.stages.find((stage) => stage.isSuccess).stageKey,
    'overall conversion ends at the success stage',
  );
  assertFunnelNumbers(funnel);
  assertUnknownIsNull(funnel);

  if (funnel.cohortSize === 0) {
    t.skip('the cohort is empty, so the identities ran on zero rows and proved nothing');
  }
});

test('nobody in range: every rate is null, never 0, and every count is 0', async (t) => {
  const funnel = await call('funnel', { filter: FAR_FUTURE_RANGE });

  if (!hasNumbers(t, funnel, 'funnel')) {
    return;
  }

  assertShape(shapes.FUNNEL, funnel);
  assert.equal(funnel.cohortSize, 0);
  assert.equal(funnel.overall.rate, null);
  assert.equal(funnel.overall.soFarRate, null);
  assert.equal(funnel.overall.eligible, 0);
  assert.equal(funnel.lowestStepStageKey, null);
  assert.ok(funnel.rows.length > 0, 'stages stay listed with nobody in them');

  for (const row of funnel.rows) {
    assert.deepEqual(
      {
        entered: row.entered,
        eligible: row.eligible,
        inWindow: row.inWindow,
        stepRate: row.stepRate,
        soFarRate: row.soFarRate,
        dropOffRate: row.dropOffRate,
        medianDays: row.medianDays,
        completedStays: row.completedStays,
      },
      {
        entered: 0,
        eligible: 0,
        inWindow: 0,
        stepRate: null,
        soFarRate: null,
        dropOffRate: null,
        medianDays: null,
        completedStays: 0,
      },
      `row ${row.stageKey}`,
    );
  }

  const overview = await call('overview', { filter: FAR_FUTURE_RANGE });

  assertShape(shapes.OVERVIEW, overview);
  assert.equal(overview.figures.totalContacts, 0);
  assert.equal(overview.figures.activePeople, 0);
  assert.equal(overview.figures.newApplicationsFrom.slice(0, 10), FAR_FUTURE_RANGE.dateFrom);
  assert.equal(overview.figures.newApplicationsTo.slice(0, 10), FAR_FUTURE_RANGE.dateTo);

  const categories = await call('categories', {
    filter: FAR_FUTURE_RANGE,
    groupBy: 'SOURCE',
  });

  assertShape(shapes.CATEGORIES, categories);
  assert.equal(categories.distinctPeople, 0);
  assertUnknownIsNull(categories);

  const trends = await call('trends', {
    filter: { ...FAR_FUTURE_RANGE, period: 'WEEK' },
    metric: 'OVERALL_CONVERSION',
  });

  assertShape(shapes.TRENDS, trends);
  assertUnknownIsNull(trends);
  assert.deepEqual(
    trends.series.filter((point) => point.value !== null),
    [],
    'a conversion line with nobody mature has no points, it never dips to 0',
  );
});

test('the five status filters split total contacts with nothing left over', async (t) => {
  const everyone = await call('overview');

  if (!hasNumbers(t, everyone, 'overview')) {
    return;
  }

  if (everyone.figures.totalContacts === 0) {
    t.skip('no contacts in this workspace to split');

    return;
  }

  const counts = {};

  for (const status of ['ACTIVE', 'SUCCESS', 'EXITED', 'UNMAPPED', 'NO_STAGE']) {
    const overview = await call('overview', { filter: { status } });

    counts[status] = overview.figures.totalContacts;
  }

  assert.equal(
    Object.values(counts).reduce((sum, value) => sum + value, 0),
    everyone.figures.totalContacts,
    `status counts ${JSON.stringify(counts)}`,
  );
  assert.equal(counts.ACTIVE, everyone.figures.activePeople, 'ACTIVE equals the active figure');

  const totalOfKind = (rowKind) =>
    sumOf(everyone.stageTotals.filter((row) => row.rowKind === rowKind), 'count');
  const successKey = meta.stages.find((stage) => stage.isSuccess).stageKey;

  assert.equal(counts.EXITED, totalOfKind('EXIT'), 'EXITED equals the exit rows');
  assert.equal(counts.UNMAPPED, totalOfKind('UNMAPPED'), 'UNMAPPED equals the unmapped rows');
  assert.equal(counts.NO_STAGE, totalOfKind('NO_STAGE'), 'NO_STAGE equals the no stage row');
  assert.equal(
    counts.SUCCESS,
    everyone.stageTotals.find((row) => row.rowKey === successKey)?.count ?? 0,
    'SUCCESS equals the success stage row',
  );
});

test('a date range over all of tracking keeps everyone tracked and reports the imported', async (t) => {
  const everyone = await call('overview');

  if (!hasNumbers(t, everyone, 'overview')) {
    return;
  }

  const today = localDateOf(everyone.asOf);
  const trackingStartDay = localDateOf(everyone.trackingStartedAt);

  if (trackingStartDay > today) {
    t.skip(`tracking starts on ${trackingStartDay}, after today`);

    return;
  }

  const inRange = await call('overview', {
    filter: { dateFrom: trackingStartDay, dateTo: today },
  });

  assert.equal(
    inRange.figures.totalContacts + inRange.importedExcludedByDate,
    everyone.figures.totalContacts,
    'everyone is either in the range or reported as imported',
  );
  assert.equal(
    sumOf(inRange.stageTotals.filter((row) => row.rowKind !== 'NESTED'), 'count'),
    inRange.figures.totalContacts,
    'stage totals still sum to total contacts under a date filter',
  );
});

test('new applications by day add up to the figure for the same range', async (t) => {
  if (!meta.fields.hasFormSubmissionObject) {
    t.skip('this workspace has no application forms');

    return;
  }

  const today = localDateOf(meta.asOf);
  const dayAfterTrackingStart = addDays(localDateOf(meta.trackingStartedAt), 1);
  const bucketLimitAgo = addDays(today, -59);
  const dateFrom =
    bucketLimitAgo > dayAfterTrackingStart ? bucketLimitAgo : dayAfterTrackingStart;

  if (dateFrom > today) {
    t.skip(`tracking started too recently: ${meta.trackingStartedAt}`);

    return;
  }

  const filter = { dateFrom, dateTo: today, period: 'DAY' };
  const trends = await call('trends', { filter, metric: 'NEW_APPLICATIONS' });

  if (!hasNumbers(t, trends, 'trends')) {
    return;
  }

  const overview = await call('overview', { filter });

  assert.equal(
    trends.series.reduce((sum, point) => sum + (point.value ?? 0), 0),
    overview.figures.newApplications,
    `one source for the number, from ${dateFrom} to ${today}`,
  );
});

for (const groupBy of ['TRACK_PROGRAM', 'SOURCE']) {
  test(`categories by ${groupBy} match their type and their counting rules`, async (t) => {
    const categories = await call('categories', { groupBy });

    if (!hasNumbers(t, categories, 'categories')) {
      return;
    }

    const overview = await call('overview');

    assertShape(shapes.CATEGORIES, categories);
    assert.equal(categories.groupBy, groupBy);
    assert.equal(
      categories.distinctPeople,
      overview.figures.totalContacts,
      'distinctPeople is everyone in scope, for either grouping',
    );
    assertUnknownIsNull(categories);

    for (const row of categories.rows) {
      assert.deepEqual(
        row.stepRates.map((stepRate) => stepRate.stageKey),
        categories.stepStageKeys,
        `row ${row.key} has one step rate per step column`,
      );
      assert.ok(row.activePeople <= row.people, `row ${row.key}: active <= people`);
      assert.ok(row.cohortSize <= row.people, `row ${row.key}: cohort <= people`);
      if (row.key === 'UNMAPPED') {
        assert.equal(row.isUnmapped, true, 'the UNMAPPED row is flagged');
      }

      assert.equal(
        row.newApplications === null,
        !meta.fields.hasFormSubmissionObject,
        `row ${row.key}: newApplications null exactly when there is no submission object`,
      );
    }

    const topRows = categories.rows.filter((row) => row.parentKey === null);
    const topPeople = topRows.reduce((sum, row) => sum + row.people, 0);

    if (groupBy === 'SOURCE') {
      const funnel = await call('funnel');

      assert.equal(categories.peopleInSeveral, 0, 'source is single-valued');
      assert.equal(categories.peopleInSeveralTracks, 0, 'source is single-valued');
      assert.equal(topPeople, categories.distinctPeople, 'source rows add up to everyone');
      assert.equal(
        sumOf(topRows, 'activePeople'),
        overview.figures.activePeople,
        'source rows add up to the active figure',
      );
      assert.equal(
        sumOf(topRows, 'cohortSize'),
        funnel.cohortSize,
        'source rows add up to the cohort',
      );

      for (const row of topRows.filter((candidate) => candidate.isUnmapped)) {
        assert.notEqual(row.key, 'UNMAPPED', 'an unknown source keeps its raw value as its key');
      }

      return;
    }

    assert.ok(
      categories.peopleInSeveralTracks <= categories.peopleInSeveral,
      'someone in several tracks also holds several positions',
    );
    assert.ok(
      topPeople >= categories.distinctPeople,
      'every person sits under at least one track row or NONE',
    );

    for (const row of categories.rows.filter((candidate) => candidate.parentKey !== null)) {
      assert.ok(
        topRows.some((top) => top.key === row.parentKey),
        `program ${row.key} has no track row ${row.parentKey}`,
      );
    }
  });
}

test('a source filter narrows overview to exactly that source row', async (t) => {
  const categories = await call('categories', { groupBy: 'SOURCE' });

  if (!hasNumbers(t, categories, 'categories')) {
    return;
  }

  // An unknown source filters by its raw value like any other.
  const sourceRows = categories.rows.filter(
    (row) => row.key !== 'NONE' && row.people > 0,
  );

  if (sourceRows.length === 0) {
    t.skip('nobody has a source in this workspace');

    return;
  }

  for (const row of sourceRows) {
    const overview = await call('overview', { filter: { sourceKey: row.key } });

    assert.equal(overview.figures.totalContacts, row.people, `source ${row.key}`);
  }
});

test('track and program filters narrow overview to exactly that row', async (t) => {
  const categories = await call('categories', { groupBy: 'TRACK_PROGRAM' });

  if (!hasNumbers(t, categories, 'categories')) {
    return;
  }

  const rows = categories.rows.filter(
    (row) => row.key !== 'NONE' && !row.isUnmapped && row.people > 0,
  );

  if (rows.length === 0) {
    t.skip('nobody has a position in this workspace');

    return;
  }

  for (const row of rows) {
    const filterKey = row.parentKey === null ? 'trackKey' : 'programKey';
    const overview = await call('overview', { filter: { [filterKey]: row.key } });

    assert.equal(overview.figures.totalContacts, row.people, `${filterKey} ${row.key}`);
  }
});

const RATE_METRICS = ['OVERALL_CONVERSION', 'DROP_OFF'];
const COUNT_METRICS = ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE'];
const PERIOD_DEFAULT_BUCKETS = { DAY: 30, WEEK: 12, MONTH: 12 };

const assertTrends = (trends, { metric, period }) => {
  assertShape(shapes.TRENDS, trends);
  assert.equal(trends.metric, metric);
  assert.equal(trends.period, period);
  assertUnknownIsNull(trends);
  assert.ok(trends.series.length <= 60, 'at most 60 buckets');

  const starts = trends.series.map((point) => Date.parse(point.bucketStart));

  assert.deepEqual(
    starts,
    [...starts].sort((left, right) => left - right),
    'buckets run oldest first',
  );

  for (const point of trends.series) {
    for (const value of [point.value, point.previousValue]) {
      if (value === null) {
        continue;
      }

      assert.ok(value >= 0, `${metric} has a negative value`);

      if (RATE_METRICS.includes(metric)) {
        assert.ok(value <= 1, `${metric} is a fraction, got ${value}`);
      }
    }
  }
};

for (const metric of [...COUNT_METRICS, 'MEDIAN_DAYS']) {
  for (const period of ['DAY', 'WEEK', 'MONTH']) {
    test(`trends ${metric} by ${period} match their type and default window`, async (t) => {
      const trends = await call('trends', { filter: { period }, metric });

      if (!hasNumbers(t, trends, 'trends')) {
        return;
      }

      assertTrends(trends, { metric, period });
      assert.ok(
        trends.series.length <= PERIOD_DEFAULT_BUCKETS[period] + 1,
        `${trends.series.length} buckets for the default ${period} window`,
      );

      if (period === 'DAY') {
        assert.deepEqual(trends.cohorts, [], 'cohorts are grouped by week or month only');
      }
    });
  }
}

for (const period of ['WEEK', 'MONTH']) {
  test(`cohort rows by ${period} stay inside the trend window, and each size is its first cell`, async (t) => {
    const trends = await call('trends', { filter: { period }, metric: 'TOTAL_CONTACTS' });

    if (!hasNumbers(t, trends, 'trends')) {
      return;
    }

    if (trends.cohorts.length === 0) {
      t.skip(`no application falls inside the default ${period} window`);

      return;
    }

    const dayOf = (bucketStart) => bucketStart.slice(0, 10);
    const firstBucket = dayOf(trends.series[0].bucketStart);
    const lastBucket = dayOf(trends.series.at(-1).bucketStart);
    const entryStage = rankedStages()[0].stageKey;

    for (const row of trends.cohorts) {
      assert.ok(
        dayOf(row.bucketStart) >= firstBucket && dayOf(row.bucketStart) <= lastBucket,
        `cohort ${row.bucketStart} is outside ${firstBucket} to ${lastBucket}`,
      );
      assert.equal(
        row.cells.find((cell) => cell.stageKey === entryStage)?.entered,
        row.size,
        `cohort ${row.bucketStart}: everyone in it entered the first stage`,
      );
    }
  });
}

for (const metric of RATE_METRICS) {
  for (const period of ['WEEK', 'MONTH']) {
    test(`trends ${metric} by ${period} are fractions that stop until mature`, async (t) => {
      const trends = await call('trends', { filter: { period }, metric });

      if (!hasNumbers(t, trends, 'trends')) {
        return;
      }

      assertTrends(trends, { metric, period });
    });
  }

  test(`trends ${metric} by DAY are refused as DAILY_RATE with no points`, async (t) => {
    const trends = await call('trends', { filter: { period: 'DAY' }, metric });

    if (!hasNumbers(t, trends, 'trends')) {
      return;
    }

    assert.equal(trends.unavailableReason, 'DAILY_RATE');
    assert.deepEqual(trends.series.filter((point) => point.value !== null), []);
  });
}

test('trends STAGE_COUNT echoes the stage and stays within its rules', async (t) => {
  const { stageKey } = rankedStages()[0];
  const trends = await call('trends', {
    filter: { period: 'WEEK' },
    metric: 'STAGE_COUNT',
    stageKey,
  });

  if (!hasNumbers(t, trends, 'trends')) {
    return;
  }

  assertTrends(trends, { metric: 'STAGE_COUNT', period: 'WEEK' });
  assert.equal(trends.stageKey, stageKey);
});

test('trends with a date range bucket inside it, and never above 60 buckets', async (t) => {
  const today = localDateOf(meta.asOf);
  const trackingStartDay = localDateOf(meta.trackingStartedAt);
  const fortnightAgo = addDays(today, -13);
  const dateFrom = fortnightAgo > trackingStartDay ? fortnightAgo : trackingStartDay;
  const inRange = await call('trends', {
    filter: { dateFrom, dateTo: today, period: 'DAY' },
    metric: 'TOTAL_CONTACTS',
  });

  if (!hasNumbers(t, inRange, 'trends')) {
    return;
  }

  assert.equal(
    inRange.series.length,
    (Date.parse(today) - Date.parse(dateFrom)) / DAY_MS + 1,
    `one bucket per day from ${dateFrom} to ${today}`,
  );
  assert.equal(inRange.series[0].bucketStart.slice(0, 10), dateFrom);
  assert.equal(inRange.series.at(-1).bucketStart.slice(0, 10), today);

  const fullYear = await call('trends', {
    filter: { dateFrom: addDays(today, -364), dateTo: today, period: 'DAY' },
    metric: 'TOTAL_CONTACTS',
  });

  assert.ok(fullYear.series.length <= 60, `${fullYear.series.length} buckets`);
});

test('stored daily counts refuse two categories at once with a plain reason', async (t) => {
  const trends = await call('trends', {
    filter: { trackKey: 'ANY_TRACK', sourceKey: 'ANY_SOURCE', period: 'WEEK' },
    metric: 'TOTAL_CONTACTS',
  });

  if (!hasNumbers(t, trends, 'trends')) {
    return;
  }

  assert.equal(trends.unavailableReason, 'SNAPSHOT_FILTER_COMBINATION');
  assert.deepEqual(trends.series.filter((point) => point.value !== null), []);
});

test('trends movement and cohorts follow their rules', async (t) => {
  const trends = await call('trends', {
    filter: { period: 'MONTH' },
    metric: 'TOTAL_CONTACTS',
  });

  if (!hasNumbers(t, trends, 'trends')) {
    return;
  }

  assert.ok(
    trends.movement.from.slice(0, 10) <= trends.movement.to.slice(0, 10),
    'movement range runs forward',
  );

  const overview = await call('overview');

  for (const row of trends.movement.rows) {
    const stageRow = overview.stageTotals.find(
      (candidate) => candidate.rowKey === row.stageKey,
    );

    assert.equal(
      row.countNow,
      stageRow?.count ?? 0,
      `movement countNow for ${row.stageKey} equals its stage total`,
    );
  }
});

test('a report that does not exist is null, with no error', async (t) => {
  const reports = await call('reports');

  if (!hasNumbers(t, reports, 'reports')) {
    return;
  }

  assert.equal(
    await call('report', { periodType: 'WEEK', periodStart: '2000-01-03' }),
    null,
  );
});

test('the report list matches its type, runs newest first and holds finished periods', async (t) => {
  const reports = await call('reports');

  if (!hasNumbers(t, reports, 'reports')) {
    return;
  }

  assertShape(shapes.REPORT_LIST, reports);

  if (reports.length === 0) {
    t.skip('no report has been built in this workspace yet');

    return;
  }

  for (const periodType of ['WEEK', 'MONTH']) {
    const starts = reports
      .filter((report) => report.periodType === periodType)
      .map((report) => report.periodStart);

    assert.deepEqual(
      starts,
      [...starts].sort().reverse(),
      `${periodType} reports run newest first`,
    );
  }

  const today = localDateOf(meta.asOf);

  for (const report of reports) {
    assert.ok(report.periodEnd <= today, `${report.periodStart} is not finished yet`);

    const start = new Date(`${report.periodStart}T00:00:00Z`);

    if (report.periodType === 'WEEK') {
      assert.equal(start.getUTCDay(), 1, `${report.periodStart} is not a Monday`);
      assert.equal(
        (Date.parse(report.periodEnd) - start.getTime()) / DAY_MS,
        7,
        `${report.periodStart} week is not 7 days`,
      );
    } else {
      assert.equal(start.getUTCDate(), 1, `${report.periodStart} is not a month start`);
      assert.equal(
        new Date(`${report.periodEnd}T00:00:00Z`).getUTCDate(),
        1,
        `${report.periodEnd} is not the next month start`,
      );
    }
  }
});

test('a stored report matches its type, holds the funnel rules and is frozen between reads', async (t) => {
  const reports = await call('reports');

  if (!hasNumbers(t, reports, 'reports')) {
    return;
  }

  if (reports.length === 0) {
    t.skip('no report has been built in this workspace yet');

    return;
  }

  const newestByType = ['WEEK', 'MONTH']
    .map((periodType) =>
      reports.find((report) => report.periodType === periodType),
    )
    .filter(Boolean);

  for (const { periodType, periodStart } of newestByType) {
    const report = await call('report', { periodType, periodStart });

    assertShape(shapes.REPORT, report);
    assert.equal(report.periodType, periodType);
    assert.equal(report.periodStart, periodStart);
    assertFunnelNumbers(report.funnel);
    assertUnknownIsNull(report);

    if (periodType === 'WEEK') {
      assert.deepEqual(report.cohorts, [], 'cohorts are filled on monthly reports only');
    }

    assert.deepEqual(
      await call('report', { periodType, periodStart }),
      report,
      'a second read differs',
    );
  }
});
