'use strict';
// The small workspace every hand calculation in these tests starts from. Ages are days
// before the run started. Tracking start is 45 days ago, so at most 7 reports exist and
// one daily run builds them all.
const TRACKING_START_AGE = 45;
const APPLICATION_FORM = 'Internship Application';
const OTHER_FORM = 'Skills survey';

const BASELINE_PEOPLE = {
  // NEW step: timed out. Past the 14 day limit, so stuck.
  ada: { firstName: 'Ada', lastName: 'Stone', createdAge: 30, stage: 'NEW', positions: ['FINANCE_INTERN'], source: 'LINKEDIN' },
  // NEW step: reached next. CONTACTED step: timed out.
  ben: { firstName: 'Ben', lastName: 'Reed', createdAge: 30, stage: 'CONTACTED', positions: ['AI_AGI_INTERN'], source: 'REFERRAL', moves: [['NEW', 'CONTACTED', 25]] },
  // NEW step: too recent. Counts in two tracks.
  cat: { firstName: 'Cat', lastName: 'Ng', createdAge: 3, stage: 'NEW', positions: ['FINANCE_INTERN', 'AI_AGI_INTERN'], source: 'LINKEDIN' },
  // NEW step: exited inside the window.
  dan: { firstName: 'Dan', lastName: 'Fox', createdAge: 30, stage: 'NOT_INTERESTED', positions: ['MARKETING_INTERN'], source: null, moves: [['NEW', 'NOT_INTERESTED', 20]] },
  // Imported before tracking start, never moved: inactive, not stuck, not in the cohort.
  eve: { firstName: 'Eve', lastName: 'Marsh', createdAge: 200, stage: 'NEW', positions: [], source: null },
  // Unmapped stage and position: Unmapped rows, never a funnel step.
  fay: { firstName: 'Fay', lastName: 'Lowe', createdAge: 30, stage: 'LEGACY_TEST', positions: ['LEGACY_POSITION'], source: 'WEBSITE' },
  // No stage at all, positions column NULL.
  gus: { firstName: 'Gus', lastName: 'Hale', createdAge: 30, stage: null, positions: null, source: null },
  // Soft deleted after moving: leaves every count, keeps its transition.
  // The move's row was written a day after the event, so happensAt and updatedAt differ.
  zed: { firstName: 'Zed', lastName: 'Gone', createdAge: 30, stage: 'CONTACTED', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', moves: [['NEW', 'CONTACTED', 28, 27]], deletedAge: 1 },
};

const everyone = (people) =>
  Object.entries(people).map(([key, person]) => [
    key,
    { firstName: key, lastName: 'Sample', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', ...person },
  ]);

// Chosen so that entered, eligible, reachedNext, exited, timedOut and inWindow of the NEW
// step all differ (16, 13, 7, 2, 4, 3), so a wrongly wired field cannot pass by accident.
// Tracking start is 120 days ago, so the 90 day overall window has eligible people.
const DISTINCT_PEOPLE = Object.fromEntries(
  everyone({
    r1: { createdAge: 40, stage: 'BEFORE_MEETING', moves: [['NEW', 'CONTACTED', 35], ['CONTACTED', 'BEFORE_MEETING', 30]] },
    r2: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    r3: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    r4: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    r5: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    r6: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    r7: { createdAge: 40, stage: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
    x1: { createdAge: 40, stage: 'NOT_INTERESTED', moves: [['NEW', 'NOT_INTERESTED', 30]] },
    x2: { createdAge: 40, stage: 'NOT_INTERESTED', moves: [['NEW', 'NOT_INTERESTED', 30]] },
    // Exit after its window: timed out, not exited.
    late: { createdAge: 40, stage: 'NOT_INTERESTED', moves: [['NEW', 'NOT_INTERESTED', 10]] },
    // Signed inside the overall window, then moved between two raw values of one stage.
    old1: { createdAge: 100, stage: 'SIGNED_NON_PAID', moves: [['NEW', 'SIGNED_PAID', 50], ['SIGNED_PAID', 'SIGNED_NON_PAID', 20]] },
    old2: { createdAge: 100, stage: 'NEW' },
    // Signed after the overall window: reached so far, not reached.
    old3: { createdAge: 100, stage: 'SIGNED_PAID', moves: [['NEW', 'SIGNED_PAID', 5]] },
    w1: { createdAge: 5, stage: 'NEW' },
    w2: { createdAge: 5, stage: 'NEW' },
    w3: { createdAge: 5, stage: 'NEW' },
    imp: { createdAge: 200, stage: 'NEW' },
  }),
);

const insertPeople = async ({ workspace, people, daysAgo }) => {
  for (const [key, person] of Object.entries(people)) {
    const personId = await workspace.fixtures.insertPerson({
      firstName: person.firstName,
      lastName: person.lastName,
      stage: person.stage,
      positions: person.positions,
      source: person.source,
      createdAt: daysAgo(person.createdAge),
      updatedAt: person.updatedAt,
      deletedAt: person.deletedAge === undefined ? null : daysAgo(person.deletedAge),
    });

    workspace.people[key] = personId;
    workspace.keyOf.set(personId, key);

    for (const [before, after, age, updatedAge] of person.moves ?? []) {
      await workspace.fixtures.insertStageChange({
        personId,
        before,
        after,
        happensAt: daysAgo(age),
        updatedAt: updatedAge === undefined ? undefined : daysAgo(updatedAge),
      });
    }
  }
};

const seedBaseline = async ({ createWorkspace, daysAgo, query }, options = {}) => {
  const workspace = await createWorkspace({ withApplication: true, ...options });
  const { insertForm, insertStageChange, insertSubmission, insertTimelineRow } = workspace.fixtures;

  workspace.setTrackingStart(daysAgo(TRACKING_START_AGE));

  await insertPeople({ workspace, people: BASELINE_PEOPLE, daysAgo });

  const { ada, ben, cat, eve } = workspace.people;

  // Timeline rows the sync must leave out.
  workspace.ignoredRows = {
    linked: await insertStageChange({
      personId: ada,
      before: 'NEW',
      after: 'SIGNED_PAID',
      happensAt: daysAgo(7),
      linkedRecordId: '20202020-0000-4000-8000-00000000abcd',
    }),
    noStageDiff: await insertTimelineRow({
      personId: ada,
      properties: { diff: { jobTitle: { before: 'A', after: 'B' } } },
      happensAt: daysAgo(6),
    }),
    noPerson: await insertStageChange({
      personId: null,
      before: 'NEW',
      after: 'SIGNED_PAID',
      happensAt: daysAgo(5),
    }),
    beforeTrackingStart: await insertStageChange({
      personId: eve,
      before: 'CONTACTED',
      after: 'NEW',
      happensAt: daysAgo(60),
    }),
  };

  workspace.forms = {
    application: await insertForm({ name: APPLICATION_FORM }),
    other: await insertForm({ name: OTHER_FORM }),
  };

  workspace.submissions = {
    adaRecent: await insertSubmission({ formId: workspace.forms.application, personId: ada, submittedAt: daysAgo(2) }),
    benPrevious: await insertSubmission({ formId: workspace.forms.application, personId: ben, submittedAt: daysAgo(10) }),
    catOtherForm: await insertSubmission({ formId: workspace.forms.other, personId: cat, submittedAt: daysAgo(1) }),
    benDeleted: await insertSubmission({ formId: workspace.forms.application, personId: ben, submittedAt: daysAgo(1), deletedAt: daysAgo(1) }),
  };

  await query(
    `INSERT INTO ${workspace.table('_application')} (name, "deletedAt") VALUES ('one', NULL), ('two', NULL), ('gone', now())`,
  );

  return workspace;
};

const seedDistinct = async ({ createWorkspace, daysAgo, query }) => {
  const workspace = await createWorkspace({ withApplication: true });
  const { insertForm, insertSubmission } = workspace.fixtures;

  workspace.setTrackingStart(daysAgo(120));

  await insertPeople({ workspace, people: DISTINCT_PEOPLE, daysAgo });

  const formId = await insertForm({ name: APPLICATION_FORM });
  const { people } = workspace;

  // 5 in the last 7 days, 2 in the 7 days before, 1 twelve weeks before a recent bucket.
  for (const [key, age] of [['r1', 1], ['r2', 2], ['r3', 3], ['r4', 4], ['r5', 5], ['r6', 10], ['r7', 11], ['x1', 90]]) {
    await insertSubmission({ formId, personId: people[key], submittedAt: daysAgo(age) });
  }

  await query(
    `INSERT INTO ${workspace.table('_application')} (name)
     SELECT 'imported ' || n FROM generate_series(1, 9) n`,
  );

  return workspace;
};

module.exports = {
  APPLICATION_FORM,
  BASELINE_PEOPLE,
  OTHER_FORM,
  TRACKING_START_AGE,
  insertPeople,
  seedBaseline,
  seedDistinct,
};
