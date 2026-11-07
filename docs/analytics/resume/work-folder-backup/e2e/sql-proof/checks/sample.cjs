'use strict';
// The hand-calculated sample of contract section 9. Ages are days before now.
const { createBaseCteReader } = require('../lib/base-ctes.cjs');
const { getFunnel } = require('../lib/metrics-adapter.cjs');

const SAMPLE_PEOPLE = [
  { key: 'A', createdAge: 40, stageNow: 'CONTACTED', moves: [['NEW', 'CONTACTED', 35]] },
  { key: 'B', createdAge: 40, stageNow: 'CONTACTED', moves: [['NEW', 'CONTACTED', 20]] },
  { key: 'C', createdAge: 40, stageNow: 'NOT_INTERESTED', moves: [['NEW', 'NOT_INTERESTED', 30]] },
  { key: 'D', createdAge: 40, stageNow: 'NEW', moves: [] },
  { key: 'E', createdAge: 5, stageNow: 'CONTACTED', moves: [['NEW', 'CONTACTED', 1]] },
  { key: 'F', createdAge: 5, stageNow: 'NEW', moves: [] },
  { key: 'G', createdAge: 40, stageNow: 'ATTENDED', moves: [['NEW', 'ATTENDED', 35]] },
  { key: 'H', createdAge: 100, stageNow: 'CONTACTED', moves: [['NEW', 'CONTACTED', 10]] },
];

const TRACKING_START_AGE = 60;
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

// Contract section 9, verbatim. entered and so-far denominators match the table.
const EXPECTED_TABLE = {
  NEW: { entered: 7, eligible: 5, reachedNext: 2, exited: 1, timedOut: 2, inWindow: 2, soFarNumerator: 4 },
  CONTACTED: { entered: 4, eligible: 3, reachedNext: 1, exited: 0, timedOut: 2, inWindow: 1, soFarNumerator: 1 },
};

const EXPECTED_PERSON_STEPS = {
  A: { NEW: [40, 35], CONTACTED: [35, null] },
  B: { NEW: [40, 20], CONTACTED: [20, null] },
  C: { NEW: [40, null] },
  D: { NEW: [40, null] },
  E: { NEW: [5, 1], CONTACTED: [1, null] },
  F: { NEW: [5, null] },
  G: {
    NEW: [40, 35],
    CONTACTED: [35, 35],
    BEFORE_MEETING: [35, 35],
    SATURDAY_MEETING: [35, 35],
    ATTENDED: [35, null],
  },
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = (sorted.length - 1) / 2;

  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
};

module.exports = {
  title: 'Hand-calculated sample (contract section 9)',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, ageInDays, transitionsOf, runSyncJob, requirement, now }) => {
    const readBaseCtes = createBaseCteReader({ loader, services });

    const workspace = await harness.fixture('M0', 'people A to H', async () => {
      const created = await newWorkspace();
      const { insertPerson, insertStageChange } = created.fixtures;

      created.trackingStart = daysAgo(TRACKING_START_AGE);
      created.vars.set('CRM_ANALYTICS_TRACKING_START_AT', created.trackingStart.toISOString());
      created.people = {};

      for (const person of SAMPLE_PEOPLE) {
        const personId = await insertPerson({
          firstName: person.key,
          stage: person.stageNow,
          createdAt: daysAgo(person.createdAge),
        });

        created.people[person.key] = personId;

        for (const [before, after, age] of person.moves) {
          await insertStageChange({ personId, before, after, happensAt: daysAgo(age) });
        }
      }

      created.keyOf = new Map(Object.entries(created.people).map(([key, id]) => [id, key]));
      await runSyncJob(created.workspaceId);

      return created;
    });

    await harness.check({ id: 'M1', title: 'Real sync job stores the six moves as read, H included', needs: [workspace] }, async (t) => {
      const rows = await transitionsOf(workspace.workspaceId);

      t.equal(
        'transitions',
        rows
          .map((row) => `${workspace.keyOf.get(row.person_id)} ${row.from_stage}>${row.to_stage} ${ageInDays(row.happened_at)}`)
          .sort(),
        ['A NEW>CONTACTED 35', 'B NEW>CONTACTED 20', 'C NEW>NOT_INTERESTED 30', 'E NEW>CONTACTED 1', 'G NEW>ATTENDED 35', 'H NEW>CONTACTED 10'],
      );
    });

    await harness.check({ id: 'M2', title: 'Real CTEs: cohort is A to G, H is outside', needs: [workspace] }, async (t) => {
      const rows = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT person_id, initial_key, initial_rank FROM cohort`,
      });

      t.equal('cohort', rows.map((row) => workspace.keyOf.get(row.person_id)).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
      t.ok('all start at NEW rank 0', rows.every((row) => row.initial_key === 'NEW' && row.initial_rank === 0), rows);
    });

    await harness.check({ id: 'M3', title: 'Real CTEs: person_step has exactly the hand-calculated entries', needs: [workspace] }, async (t) => {
      const rows = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT person_id, stage_key, entered_at, next_at FROM person_step`,
      });
      const actual = {};

      for (const row of rows) {
        const key = workspace.keyOf.get(row.person_id);

        actual[key] ??= {};
        actual[key][row.stage_key] = [ageInDays(row.entered_at), row.next_at === null ? null : ageInDays(row.next_at)];
      }

      t.equal('person_step by person', actual, EXPECTED_PERSON_STEPS);
    });

    await harness.check({ id: 'M4', title: 'Real CTEs: the contract formulas on person_step give the expected table', needs: [workspace] }, async (t) => {
      const steps = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT person_id, stage_key, window_days, entered_at, next_at FROM person_step`,
      });
      const transitions = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT person_id, to_kind, happened_at FROM transition`,
      });
      const windowEnd = (step) => new Date(step.entered_at).getTime() + step.window_days * DAY_MS;

      for (const [stageKey, expected] of Object.entries(EXPECTED_TABLE)) {
        const entered = steps.filter((step) => step.stage_key === stageKey);
        const eligible = entered.filter((step) => windowEnd(step) <= now.getTime());
        const reachedNext = eligible.filter(
          (step) => step.next_at !== null && new Date(step.next_at).getTime() <= windowEnd(step),
        );
        const exited = eligible.filter(
          (step) =>
            !reachedNext.includes(step) &&
            transitions.some(
              (transition) =>
                transition.person_id === step.person_id &&
                transition.to_kind === 'EXIT' &&
                new Date(transition.happened_at).getTime() >= new Date(step.entered_at).getTime() &&
                new Date(transition.happened_at).getTime() <= windowEnd(step),
            ),
        );

        t.equal(stageKey, {
          entered: entered.length,
          eligible: eligible.length,
          reachedNext: reachedNext.length,
          exited: exited.length,
          timedOut: eligible.length - reachedNext.length - exited.length,
          inWindow: entered.length - eligible.length,
          soFarNumerator: entered.filter((step) => step.next_at !== null).length,
        }, expected);
      }
    });

    await harness.check({ id: 'M5', title: 'Real CTEs: NEW stays are 5, 20, 10, 4, 5, so median 5 with 5 completed', needs: [workspace] }, async (t) => {
      const cohort = await readBaseCtes({
        workspaceId: workspace.workspaceId,
        trackingStart: workspace.trackingStart,
        select: `SELECT c.person_id, c.created_at, (SELECT min(t.happened_at) FROM transition t WHERE t.person_id = c.person_id) AS left_at FROM cohort c`,
      });
      const stays = cohort
        .filter((row) => row.left_at !== null)
        .map((row) => Math.round((new Date(row.left_at) - new Date(row.created_at)) / DAY_MS));

      t.equal('stays', [...stays].sort((left, right) => left - right), [4, 5, 5, 10, 20]);
      t.equal('median', median(stays), 5);
    });

    await harness.check(
      {
        id: 'M6',
        title: 'Metrics service: funnel equals the contract table, NEW median 5 with 5 completed stays',
        requires: [requirement('CrmAnalyticsMetricsService')],
        needs: [workspace],
      },
      async (t) => {
        const funnel = await getFunnel({ services, workspaceId: workspace.workspaceId });
        const rowOf = (stageKey) => funnel.rows.find((row) => row.stageKey === stageKey);

        t.equal('cohortSize', funnel.cohortSize, 7);

        for (const [stageKey, expected] of Object.entries(EXPECTED_TABLE)) {
          const row = rowOf(stageKey);

          t.equal(stageKey, row && {
            entered: row.entered,
            eligible: row.eligible,
            reachedNext: row.reachedNext,
            exited: row.exited,
            timedOut: row.timedOut,
            inWindow: row.inWindow,
          }, {
            entered: expected.entered,
            eligible: expected.eligible,
            reachedNext: expected.reachedNext,
            exited: expected.exited,
            timedOut: expected.timedOut,
            inWindow: expected.inWindow,
          });
        }

        t.equal('NEW stepRate', rowOf('NEW')?.stepRate, 2 / 5);
        t.equal('NEW soFarRate', rowOf('NEW')?.soFarRate, 4 / 7);
        t.equal('NEW dropOffRate', rowOf('NEW')?.dropOffRate, 3 / 5);
        t.equal('CONTACTED stepRate', rowOf('CONTACTED')?.stepRate, 1 / 3);
        t.equal('CONTACTED soFarRate', rowOf('CONTACTED')?.soFarRate, 1 / 4);
        t.equal('NEW medianDays', rowOf('NEW')?.medianDays, 5);
        t.equal('NEW completedStays', rowOf('NEW')?.completedStays, 5);
      },
    );

    await harness.check(
      {
        id: 'M7',
        title: 'Metrics service: entered = eligible + inWindow and eligible = reachedNext + timedOut + exited on every row',
        requires: [requirement('CrmAnalyticsMetricsService')],
        needs: [workspace],
      },
      async (t) => {
        const funnel = await getFunnel({ services, workspaceId: workspace.workspaceId });

        for (const row of funnel.rows) {
          t.equal(`${row.stageKey} entered`, row.entered, row.eligible + row.inWindow);

          if (row.windowDays !== null) {
            t.equal(`${row.stageKey} eligible`, row.eligible, row.reachedNext + row.timedOut + row.exited);
          }
        }
      },
    );
  },
};
