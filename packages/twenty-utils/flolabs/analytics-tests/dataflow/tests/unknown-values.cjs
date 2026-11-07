'use strict';
// A value the mapping does not know, or a person too new to judge, must arrive at its own
// honest place: an Unmapped row, or inWindow. Never a funnel step, never a failure count.
const { seedBaseline } = require('../lib/seed.cjs');

const rowOf = (rows, field, key) => rows.find((row) => row[field] === key);
const stage = (rows, key) => rowOf(rows, 'stageKey', key);
const totalsRow = (overview, key) => rowOf(overview.stageTotals, 'rowKey', key);
const category = (categories, parentKey, key) =>
  categories.rows.find((row) => row.parentKey === parentKey && row.key === key);
const failureCounts = ({ eligible, reachedNext, timedOut, exited }) => ({ eligible, reachedNext, timedOut, exited });
const NO_FAILURE = { eligible: 0, reachedNext: 0, timedOut: 0, exited: 0 };

module.exports = {
  title: 'Unknown values and too-recent people',
  run: async ({ context, createScope }) => {
    const { fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const { daysAgo, page, query } = context;

    const unknown = await fixture('people with values nothing maps', async () => {
      const workspace = await context.createWorkspace({ extraStageValues: ['OLD_STAGE_A', 'OLD_STAGE_B'] });
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.setTrackingStart(daysAgo(45));

      const people = {
        neverMapped: await insertPerson({ stage: 'OLD_STAGE_A', positions: ['LEGACY_POSITION'], source: 'UNIVERSITY', createdAt: daysAgo(30) }),
        secondValue: await insertPerson({ stage: 'OLD_STAGE_B', createdAt: daysAgo(30) }),
        movedToUnknown: await insertPerson({ stage: 'OLD_STAGE_A', createdAt: daysAgo(30) }),
        cameFromUnknown: await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(30) }),
        stageWasNull: await insertPerson({ stage: 'NEW', createdAt: daysAgo(30) }),
        noOp: await insertPerson({ stage: 'NEW', createdAt: daysAgo(30) }),
      };

      await insertStageChange({ personId: people.movedToUnknown, before: 'NEW', after: 'OLD_STAGE_A', happensAt: daysAgo(25) });
      await insertStageChange({ personId: people.cameFromUnknown, before: 'OLD_STAGE_B', after: 'CONTACTED', happensAt: daysAgo(25) });
      await insertStageChange({ personId: people.stageWasNull, before: null, after: 'NEW', happensAt: daysAgo(25) });
      await insertStageChange({ personId: people.noOp, before: 'NEW', after: 'NEW', happensAt: daysAgo(25) });

      await context.runSync(workspace);
      await context.runDaily(workspace);

      return {
        funnel: await page.funnel(workspace),
        overview: await page.overview(workspace),
        people,
        track: await page.categories(workspace, 'TRACK_PROGRAM'),
        workspace,
      };
    });

    const needs = [unknown];

    await test('UNKNOWN-01 an unmapped stage reaches its own Unmapped row, raw value as the label, one row per value', (t) => {
      t.equal('row', totalsRow(unknown.overview, 'UNMAPPED:OLD_STAGE_A'), {
        rowKey: 'UNMAPPED:OLD_STAGE_A',
        label: 'OLD_STAGE_A',
        rowKind: 'UNMAPPED',
        parentStageKey: null,
        count: 2,
        pastLimitCount: null,
      });
      t.equal('second value, second row', totalsRow(unknown.overview, 'UNMAPPED:OLD_STAGE_B').count, 1);

      const topRows = unknown.overview.stageTotals.filter(({ rowKind }) => rowKind !== 'NESTED');

      t.equal('rows still sum to total contacts', topRows.reduce((sum, { count }) => sum + count, 0), unknown.overview.figures.totalContacts);
    }, { needs });

    await test('UNKNOWN-02 an unmapped stage never reaches a funnel step or the active count', (t) => {
      const { funnel, overview } = unknown;

      // movedToUnknown, cameFromUnknown, stageWasNull and noOp. neverMapped and secondValue stay out.
      t.equal('cohort', funnel.cohortSize, 4);
      t.equal('reported apart', funnel.cohortExcludedUnmapped, 2);
      t.equal('NEW holds only people with a mapped stage', stage(funnel.rows, 'NEW').entered, 4);
      t.equal('active leaves unmapped people out', overview.figures.activePeople, 3);
    }, { needs });

    await test('UNKNOWN-03 moving to an unmapped stage is a step out of NEW, not progress', (t) => {
      const { funnel } = unknown;

      // cameFromUnknown reached CONTACTED and so counts at NEW. movedToUnknown does not.
      t.equal('reached next', stage(funnel.rows, 'NEW').reachedNext, 1);
      t.equal('entered CONTACTED', stage(funnel.rows, 'CONTACTED').entered, 1);
    }, { needs });

    await test('UNKNOWN-04 raw unknown values are stored as they are, so a later mapping can claim them', async (t) => {
      const rows = await query(
        `SELECT from_stage, to_stage FROM analytics.stage_transition WHERE workspace_id = $1 ORDER BY person_id`,
        [unknown.workspace.workspaceId],
      );

      t.ok('to', rows.some(({ to_stage: to }) => to === 'OLD_STAGE_A'), rows);
      t.ok('from', rows.some(({ from_stage: from }) => from === 'OLD_STAGE_B'), rows);
      t.ok('a null before is stored as null', rows.some(({ from_stage: from, to_stage: to }) => from === null && to === 'NEW'), rows);

      const snapshots = await query(
        `SELECT person_count FROM analytics.daily_snapshot WHERE workspace_id = $1 AND dimension = 'all' AND stage = 'OLD_STAGE_A'`,
        [unknown.workspace.workspaceId],
      );

      t.equal('snapshot keeps the raw stage', snapshots.map(({ person_count: count }) => count), [2]);
    }, { needs });

    await test('UNKNOWN-05 the Unmapped status filter finds them and only them', async (t) => {
      const filtered = await page.overview(unknown.workspace, { status: 'UNMAPPED' });

      t.equal('three people', filtered.figures.totalContacts, 3);
      t.equal('none active', filtered.figures.activePeople, 0);
    }, { needs });

    await test('UNKNOWN-06 a no-op move A to A is no move: the clock runs on and an imported person stays inactive', async (t) => {
      const noOpRow = unknown.overview.stuck.rows.find(({ personId }) => personId === unknown.people.noOp);

      t.equal('stage clock still runs from creation', noOpRow?.daysInStage, 30);

      const workspace = await context.createWorkspace();
      const personId = await workspace.fixtures.insertPerson({ stage: 'NEW', createdAt: daysAgo(200) });

      workspace.setTrackingStart(daysAgo(45));
      await workspace.fixtures.insertStageChange({ personId, before: 'NEW', after: 'NEW', happensAt: daysAgo(25) });
      await context.runSync(workspace);

      t.equal('still inactive', (await page.overview(workspace)).figures.inactivePeople, 1);
    }, { needs });

    await test('UNKNOWN-07 an unknown position reaches track UNMAPPED, flagged, raw in the position snapshot', async (t) => {
      const track = category(unknown.track, null, 'UNMAPPED');
      const program = category(unknown.track, 'UNMAPPED', 'LEGACY_POSITION');
      const snapshot = async (dimension, key) =>
        (await query(
          `SELECT person_count FROM analytics.daily_snapshot WHERE workspace_id = $1 AND dimension = $2 AND dimension_key = $3`,
          [unknown.workspace.workspaceId, dimension, key],
        )).map(({ person_count: count }) => count);

      t.equal('track row', [track.label, track.isUnmapped, track.people], ['Unmapped', true, 1]);
      t.equal('program row', [program.label, program.isUnmapped, program.people], ['LEGACY_POSITION', true, 1]);
      t.equal('track snapshot', await snapshot('track', 'UNMAPPED'), [1]);
      t.equal('position snapshot', await snapshot('position', 'LEGACY_POSITION'), [1]);

      const filtered = await page.overview(unknown.workspace, { trackKey: 'UNMAPPED' });

      t.equal('the filter reaches it', filtered.figures.totalContacts, 1);

      const meta = await page.meta(unknown.workspace);

      t.equal('the filter offers it', rowOf(meta.programs, 'key', 'LEGACY_POSITION').trackKey, 'UNMAPPED');
    }, { needs });

    await test('UNKNOWN-08 no stage and no value reach No stage and NONE, never a funnel step', async (t) => {
      const workspace = await context.createWorkspace();

      await workspace.fixtures.insertPerson({ stage: null, positions: [], source: null, createdAt: daysAgo(30) });
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const overview = await page.overview(workspace);
      const funnel = await page.funnel(workspace);
      const track = await page.categories(workspace, 'TRACK_PROGRAM');
      const source = await page.categories(workspace, 'SOURCE');
      const snapshot = await query(
        `SELECT dimension, dimension_key, stage FROM analytics.daily_snapshot WHERE workspace_id = $1 ORDER BY dimension`,
        [workspace.workspaceId],
      );

      t.equal('row', [totalsRow(overview, 'NO_STAGE').label, totalsRow(overview, 'NO_STAGE').count], ['No stage', 1]);
      t.equal('no step', funnel.cohortSize, 0);
      t.equal('not reported as unmapped', funnel.cohortExcludedUnmapped, 0);
      t.equal('position', [category(track, null, 'NONE').label, category(track, null, 'NONE').people], ['No position', 1]);
      t.equal('source', [category(source, null, 'NONE').label, category(source, null, 'NONE').people], ['No source', 1]);
      t.equal('snapshot keys', snapshot.map(({ dimension, dimension_key: key, stage: value }) => `${dimension}|${key}|${value}`), [
        'all||', 'position|NONE|', 'source|NONE|', 'track|NONE|',
      ]);
    }, { needs });

    await test("UNKNOWN-09 an empty TEXT stage is no stage, not an unmapped value called ''", async (t) => {
      const workspace = await context.createWorkspace({ personFields: 'TEXT' });

      await query(
        `INSERT INTO ${workspace.table('person')} (stage, "applicantSource", "createdAt", "updatedAt")
         VALUES ('', '', $1, $1), ('NEW', 'Typed source', $1, $1), ('typed by hand', '', $1, $1)`,
        [daysAgo(30)],
      );
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const overview = await page.overview(workspace);
      const sources = await page.categories(workspace, 'SOURCE');
      const stored = await query(
        `SELECT dimension_key, sum(person_count)::int AS total FROM analytics.daily_snapshot
         WHERE workspace_id = $1 AND dimension = 'source' GROUP BY 1 ORDER BY 1`,
        [workspace.workspaceId],
      );

      t.equal('an empty source is no source', category(sources, null, 'NONE').people, 2);
      t.equal('a TEXT field lists no options, so typed text is not unmapped', category(sources, null, 'Typed source').isUnmapped, false);
      t.equal('stored the same way', stored, [{ dimension_key: 'NONE', total: 2 }, { dimension_key: 'Typed source', total: 1 }]);

      t.equal('no stage', totalsRow(overview, 'NO_STAGE').count, 1);
      t.equal("no row called ''", totalsRow(overview, 'UNMAPPED:'), undefined);
      t.equal('free text is unmapped', totalsRow(overview, 'UNMAPPED:typed by hand').count, 1);
      t.equal('mapped still maps', totalsRow(overview, 'NEW').count, 1);
    }, { needs });

    // ---- too recent
    const recent = await fixture('people still inside the window', async () => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.setTrackingStart(daysAgo(45));

      await insertPerson({ stage: 'NEW', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', createdAt: daysAgo(3) });

      const exited = await insertPerson({ stage: 'NOT_INTERESTED', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', createdAt: daysAgo(3) });
      const reached = await insertPerson({ stage: 'CONTACTED', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', createdAt: daysAgo(3) });

      await insertStageChange({ personId: exited, before: 'NEW', after: 'NOT_INTERESTED', happensAt: daysAgo(1) });
      await insertStageChange({ personId: reached, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(1) });
      await context.runSync(workspace);

      return {
        funnel: await page.funnel(workspace),
        track: await page.categories(workspace, 'TRACK_PROGRAM'),
        trends: await page.trends(workspace, 'DROP_OFF'),
        workspace,
      };
    });

    await test('UNKNOWN-10 too recent reaches inWindow and never a failure count, even after an exit or a move', (t) => {
      const row = stage(recent.funnel.rows, 'NEW');

      t.equal('entered', row.entered, 3);
      t.equal('in window', row.inWindow, 3);
      t.equal('no failure', failureCounts(row), NO_FAILURE);
    }, { needs: [recent] });

    await test('UNKNOWN-11 too recent has no rate, never 0%: only the so-far form', (t) => {
      const row = stage(recent.funnel.rows, 'NEW');

      t.equal('step rate', row.stepRate, null);
      t.equal('drop-off rate', row.dropOffRate, null);
      t.equal('so far', row.soFarRate, 1 / 3);
      t.equal('overall rate', recent.funnel.overall.rate, null);
      t.equal('overall eligible', recent.funnel.overall.eligible, 0);
    }, { needs: [recent] });

    await test('UNKNOWN-12 too recent stays unknown in categories, cohorts and the rate line', (t) => {
      const rate = stage(category(recent.track, null, 'BUSINESS').stepRates, 'NEW');
      const [cohort] = recent.trends.cohorts;
      const point = recent.trends.series.find(({ size }) => size > 0);

      t.equal('category', [rate.eligible, rate.rate, rate.soFarRate], [0, null, 1 / 3]);
      t.equal('cohort cell', [stage(cohort.cells, 'NEW').isMature, stage(cohort.cells, 'NEW').rate, stage(cohort.cells, 'NEW').soFarRate], [false, null, 1 / 3]);
      t.equal('line stops, never dips to 0', [point.value, point.size], [null, 3]);
    }, { needs: [recent] });

    await test('UNKNOWN-13 the edge of the window: one hour either side of 14 days', async (t) => {
      const workspace = await context.createWorkspace();
      const { insertPerson } = workspace.fixtures;
      const hour = 3_600_000;
      const fourteenDaysAgo = Date.now() - 14 * 86_400_000;

      workspace.setTrackingStart(daysAgo(45));
      await insertPerson({ stage: 'NEW', createdAt: new Date(fourteenDaysAgo - hour) });
      await insertPerson({ stage: 'NEW', createdAt: new Date(fourteenDaysAgo + hour) });
      await context.runSync(workspace);

      const row = stage((await page.funnel(workspace)).rows, 'NEW');

      t.equal('past it', [row.eligible, row.timedOut], [1, 1]);
      t.equal('not yet', row.inWindow, 1);
    }, { needs: [recent] });

    await test('UNKNOWN-16 the stuck limit compares whole days: 14 days and 6 hours is not over 14 until day 15, while the funnel window compares exact times', async (t) => {
      const workspace = await context.createWorkspace();
      const { insertPerson } = workspace.fixtures;
      const hour = 3_600_000;
      const aged = (days, hours) => new Date(Date.now() - days * 86_400_000 - hours * hour);

      workspace.setTrackingStart(daysAgo(45));
      await insertPerson({ firstName: 'UnderLimit', stage: 'NEW', createdAt: aged(13, 12) });
      await insertPerson({ firstName: 'PartDay', stage: 'NEW', createdAt: aged(14, 6) });
      await insertPerson({ firstName: 'LastHours', stage: 'NEW', createdAt: aged(14, 22) });

      const dayFifteen = await insertPerson({ firstName: 'DayFifteen', stage: 'NEW', createdAt: aged(15, 2) });
      const overPerson = await insertPerson({ firstName: 'OverLimit', stage: 'NEW', createdAt: aged(15, 12) });

      await context.runSync(workspace);

      const overview = await page.overview(workspace);
      const { figures, stuck } = overview;
      const row = stage((await page.funnel(workspace)).rows, 'NEW');

      t.equal('only day 15 on is stuck', [figures.stuckPeople, stuck.total], [2, 2]);
      t.equal('those two', stuck.rows.map(({ personId }) => personId).sort(), [dayFifteen, overPerson].sort());
      t.equal('whole days over', stuck.rows.map(({ daysInStage, daysOverLimit }) => [daysInStage, daysOverLimit]), [[15, 1], [15, 1]]);
      t.equal('the stage row agrees', totalsRow(overview, 'NEW').pastLimitCount, 2);
      t.equal('the same part days are past the exact funnel window', [row.eligible, row.timedOut, row.inWindow], [4, 4, 1]);
    }, { needs });

    await test('UNKNOWN-17 an unknown source keeps its raw value as the key, flagged, with no shared UNMAPPED row, and a filter finds it by that value', async (t) => {
      const { workspace } = unknown;
      const field = workspace.flatMaps.flatFieldMetadataMaps.byUniversalIdentifier['person-applicantSource-uid'];
      const { options } = field;

      field.options = options.filter(({ value }) => value !== 'UNIVERSITY');

      try {
        const sources = await page.categories(workspace, 'SOURCE');
        const row = category(sources, null, 'UNIVERSITY');

        t.equal('row', [row?.label, row?.isUnmapped, row?.people], ['UNIVERSITY', true, 1]);
        t.equal('no shared key', category(sources, null, 'UNMAPPED'), undefined);
        t.equal('nothing else is flagged', sources.rows.filter(({ isUnmapped }) => isUnmapped).map(({ key }) => key), ['UNIVERSITY']);
        t.equal('the filter uses the raw value', (await page.overview(workspace, { sourceKey: 'UNIVERSITY' })).figures.totalContacts, 1);
        t.equal('and on stored counts', (await page.trends(workspace, 'TOTAL_CONTACTS', { filter: { sourceKey: 'UNIVERSITY' } })).series.at(-1).value, 1);
        t.equal('the old shared key finds nobody', (await page.overview(workspace, { sourceKey: 'UNMAPPED' })).figures.totalContacts, 0);
      } finally {
        field.options = options;
      }

      const stored = await query(
        `SELECT DISTINCT dimension_key FROM analytics.daily_snapshot WHERE workspace_id = $1 AND dimension = 'source' ORDER BY 1`,
        [workspace.workspaceId],
      );

      t.equal('stored raw too', stored.map(({ dimension_key: key }) => key), ['NONE', 'UNIVERSITY']);
    }, { needs });

    await test('UNKNOWN-14 too recent people are not stuck either', async (t) => {
      const { figures, stuck } = await page.overview(recent.workspace);

      t.equal('none stuck', [figures.stuckPeople, stuck.total], [0, 0]);
      t.equal('all active but the exited one', figures.activePeople, 2);
    }, { needs: [recent] });

    await test('UNKNOWN-15 the baseline agrees: cat is in inWindow, fay is reported, neither is a failure', async (t) => {
      const workspace = await seedBaseline(context);

      await context.runSync(workspace);

      const funnel = await page.funnel(workspace);
      const row = stage(funnel.rows, 'NEW');

      t.equal('cat', row.inWindow, 1);
      t.equal('ada is the only time-out', row.timedOut, 1);
      t.equal('fay', funnel.cohortExcludedUnmapped, 1);
    }, { needs });
  },
};
