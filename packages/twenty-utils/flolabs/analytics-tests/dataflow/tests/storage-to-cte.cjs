'use strict';
// Edges into and between the CTEs. Every CTE is read out of a statement the real service
// just ran, so what is tested is the code's own SQL with its own parameters.
const { toIso } = require('../lib/sinks.cjs');
const { seedBaseline, seedDistinct } = require('../lib/seed.cjs');
const { createTapReader, toDate } = require('../lib/taps.cjs');

const DAY_MS = 86_400_000;

module.exports = {
  title: 'Storage and relations to CTEs',
  run: async ({ context, createScope }) => {
    const { edge, fixture } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const prepare = async (workspace) => {
      const { collect, tapOf } = createTapReader(context);
      const { page } = context;

      await context.runSync(workspace);
      await context.runDaily(workspace);

      const moveFilter = { dateFrom: toDate(context.daysAgo(29)), dateTo: toDate(context.daysAgo(24)) };

      return {
        workspace,
        overview: tapOf(await collect(() => page.overview(workspace))),
        funnel: tapOf(await collect(() => page.funnel(workspace))),
        track: tapOf(await collect(() => page.categories(workspace, 'TRACK_PROGRAM'))),
        source: tapOf(await collect(() => page.categories(workspace, 'SOURCE'))),
        trends: tapOf(await collect(() => page.trends(workspace, 'TOTAL_CONTACTS', { filter: moveFilter }))),
        sourceTrend: tapOf(await collect(() => page.trends(workspace, 'TOTAL_CONTACTS', { filter: { sourceKey: 'LINKEDIN' } }))),
        keyed: (rows) => Object.fromEntries(rows.map((row) => [workspace.keyOf.get(row.person_id) ?? row.person_id, row])),
      };
    };

    const small = await fixture('baseline workspace with its statements', async () =>
      prepare(await seedBaseline(context)),
    );
    const distinct = await fixture('distinct-number workspace with its statements', async () =>
      prepare(await seedDistinct(context)),
    );

    const needs = [small, distinct];
    const check = (from, to, work, options = {}) => edge(from, to, work, { needs, ...options });
    const days = (date) => Math.round((context.now.getTime() - new Date(date).getTime()) / DAY_MS);

    // ---- mapping constant
    const config = () => context.loader.real('src/modules/analytics/constants/crm-analytics-config.constant').CRM_ANALYTICS_CONFIG;

    await check('config.stages', 'cte.stage_map', async (t) => {
      const rows = await small.overview('stage_map', 'SELECT * FROM stage_map');
      const expected = config().stages.flatMap((stage) =>
        stage.rawValues.map(({ rawValue }) => ({
          raw_stage: rawValue,
          stage_key: stage.stageKey,
          rank: stage.rank,
          kind: stage.kind,
          limit_days: stage.limitDays,
        })),
      );

      t.equal('one row per raw value, as configured', rows, expected);
      t.ok('both signed values share a stage', rows.filter(({ stage_key: key }) => key === 'SIGNED').length === 2, rows);
    });

    await check('config.stages', 'cte.funnel_stage', async (t) => {
      const rows = await small.overview('funnel_stage', 'SELECT * FROM funnel_stage ORDER BY rank');
      const expected = config().stages
        .filter((stage) => stage.rank !== null)
        .map(({ stageKey, rank, windowDays }) => ({ stage_key: stageKey, rank, window_days: windowDays }))
        .sort((first, second) => first.rank - second.rank);

      t.equal('ranked stages only', rows, expected);
      t.equal('the last has no window', rows.at(-1).window_days, null);
    });

    await check('config.tracks', 'cte.position_map', async (t) => {
      const rows = await small.overview('position_map', 'SELECT * FROM position_map');

      t.equal(
        'one row per position',
        rows,
        config().tracks.flatMap(({ trackKey, positions }) =>
          positions.map((position) => ({ raw_position: position, track_key: trackKey })),
        ),
      );
      t.equal('39 positions', rows.length, 39);
    });

    // ---- crm_person and scope
    const crmPerson = () => small.overview('crm_person', 'SELECT * FROM crm_person');

    await check('facade.personRelation.person_id', 'cte.crm_person', async (t) => {
      t.equal('the seven live people', Object.keys(small.keyed(await crmPerson())).sort(), ['ada', 'ben', 'cat', 'dan', 'eve', 'fay', 'gus']);
    });

    await check('facade.personRelation.raw_stage', 'cte.crm_person', async (t) => {
      t.equal('fay', small.keyed(await crmPerson()).fay.raw_stage, 'LEGACY_TEST');
    });

    await check('facade.personRelation.positions', 'cte.crm_person', async (t) => {
      t.equal('cat', small.keyed(await crmPerson()).cat.positions, ['FINANCE_INTERN', 'AI_AGI_INTERN']);
    });

    await check('facade.personRelation.source', 'cte.crm_person', async (t) => {
      t.equal('ben', small.keyed(await crmPerson()).ben.source, 'REFERRAL');
    });

    await check('facade.personRelation.created_at', 'cte.crm_person', async (t) => {
      t.equal('eve', days(small.keyed(await crmPerson()).eve.created_at), 200);
    });

    const scope = async () => small.keyed(await small.overview('scope', 'SELECT * FROM scope'));

    await check('cte.crm_person', 'cte.scope', async (t) => {
      const rows = await scope();

      t.equal('no filter keeps everyone', Object.keys(rows).length, 7);
      t.equal('values pass through', rows.cat.positions, ['FINANCE_INTERN', 'AI_AGI_INTERN']);
    });

    await check('cte.stage_map', 'cte.scope', async (t) => {
      const rows = await scope();
      const mapped = ({ current_key: key, current_rank: rank, current_kind: kind }) => [key, rank, kind];

      t.equal('ranked stage', mapped(rows.ben), ['CONTACTED', 1, 'MAIN']);
      t.equal('exit stage', mapped(rows.dan), ['NOT_INTERESTED', null, 'EXIT']);
      t.equal('unmapped', mapped(rows.fay), [null, null, null]);
      t.equal('no stage', mapped(rows.gus), [null, null, null]);
    });

    const totalWith = async (filter) => (await context.page.overview(small.workspace, filter)).figures.totalContacts;

    await check('api.filter.status', 'cte.scope', async (t) => {
      t.equal('ACTIVE', await totalWith({ status: 'ACTIVE' }), 4);
      t.equal('EXITED', await totalWith({ status: 'EXITED' }), 1);
      t.equal('UNMAPPED', await totalWith({ status: 'UNMAPPED' }), 1);
      t.equal('NO_STAGE', await totalWith({ status: 'NO_STAGE' }), 1);
      t.equal('SUCCESS', await totalWith({ status: 'SUCCESS' }), 0);
    });

    await check('api.filter.trackKey', 'cte.scope', async (t) => {
      t.equal('BUSINESS: ada, cat, dan', await totalWith({ trackKey: 'BUSINESS' }), 3);
      t.equal('UNMAPPED: fay', await totalWith({ trackKey: 'UNMAPPED' }), 1);
      t.equal('NONE: eve, gus', await totalWith({ trackKey: 'NONE' }), 2);
    });

    await check('api.filter.programKey', 'cte.scope', async (t) => {
      t.equal('AI_AGI_INTERN: ben, cat', await totalWith({ programKey: 'AI_AGI_INTERN' }), 2);
      t.equal('NONE: eve, gus', await totalWith({ programKey: 'NONE' }), 2);
    });

    await check('api.filter.sourceKey', 'cte.scope', async (t) => {
      t.equal('LINKEDIN: ada, cat', await totalWith({ sourceKey: 'LINKEDIN' }), 2);
      t.equal('NONE: dan, eve, gus', await totalWith({ sourceKey: 'NONE' }), 3);
    });

    await check('api.filter.dateRange', 'cte.scope', async (t) => {
      const overview = await context.page.overview(small.workspace, {
        dateFrom: toDate(context.daysAgo(31)),
        dateTo: toDate(context.daysAgo(29)),
      });

      t.equal('created in range: ada, ben, dan, fay, gus', overview.figures.totalContacts, 5);
      t.equal('the imported person is reported, not silently lost', overview.importedExcludedByDate, 1);
    });

    // ---- transition
    const transition = () => small.funnel('transition', 'SELECT * FROM transition');

    await check('analytics.stage_transition.person_id', 'cte.transition', async (t) => {
      t.equal('ben, dan and the deleted zed', Object.keys(small.keyed(await transition())).sort(), ['ben', 'dan', 'zed']);
    });

    await check('analytics.stage_transition.from_stage', 'cte.transition', async (t) => {
      const { ben } = small.keyed(await transition());

      t.equal('from', [ben.from_key, ben.from_rank], ['NEW', 0]);
    });

    await check('analytics.stage_transition.to_stage', 'cte.transition', async (t) => {
      const { ben, dan } = small.keyed(await transition());

      t.equal('ranked', [ben.to_key, ben.to_rank, ben.to_kind], ['CONTACTED', 1, 'MAIN']);
      t.equal('exit', [dan.to_key, dan.to_rank, dan.to_kind], ['NOT_INTERESTED', null, 'EXIT']);
    });

    await check('analytics.stage_transition.happened_at', 'cte.transition', async (t) => {
      t.equal('same instant', toIso(small.keyed(await transition()).ben.happened_at), toIso(context.daysAgo(25)));
    });

    await check('analytics.stage_transition.origin', 'cte.transition', async (t) => {
      t.equal('timeline', small.keyed(await transition()).ben.origin, 'timeline');
    });

    await check('analytics.stage_transition.workspace_id', 'cte.transition', async (t) => {
      const [{ total }] = await context.query('SELECT count(*)::int AS total FROM analytics.stage_transition');
      const rows = await transition();

      t.ok('other workspaces hold rows', total > rows.length, { total });
      t.equal('none reach this read', rows.length, 3);
    });

    await check('cte.stage_map', 'cte.transition', async (t) => {
      const rows = await distinct.funnel('transition', 'SELECT * FROM transition');
      const signed = rows.filter((row) => distinct.workspace.keyOf.get(row.person_id) === 'old3');

      t.equal('a raw value becomes its stage key at read time', signed.map(({ to_key: key, to_rank: rank }) => [key, rank]), [['SIGNED', 7]]);

      const [stored] = await context.query(
        `SELECT to_stage FROM analytics.stage_transition WHERE person_id = $1`,
        [distinct.workspace.people.old3],
      );

      t.equal('storage keeps the raw value', stored.to_stage, 'SIGNED_PAID');
    });

    await check('settings.trackingStart', 'cte.transition', async (t) => {
      const later = context.daysAgo(22).toISOString();
      const rows = await small.funnel('transition', 'SELECT * FROM transition', (parameters) => {
        parameters[1] = later;

        return parameters;
      });

      t.equal('rows before the start are ignored', Object.keys(small.keyed(rows)), ['dan']);
    });

    await check('cte.transition', 'cte.first_move', async (t) => {
      const { r1, ben } = {
        ...distinct.keyed(await distinct.funnel('first_move', 'SELECT * FROM first_move')),
        ...small.keyed(await small.funnel('first_move', 'SELECT * FROM first_move')),
      };

      t.equal('the earliest of two moves', [r1.from_key, r1.from_rank], ['NEW', 0]);
      t.equal('one move', [ben.from_key, ben.from_rank], ['NEW', 0]);
    });

    // ---- cohort
    const cohort = async () => small.keyed(await small.funnel('cohort', 'SELECT * FROM cohort'));

    await check('cte.scope', 'cte.cohort', async (t) => {
      t.equal('application date', days((await cohort()).cat.created_at), 3);
    }, { field: 'created_at' });

    await check('cte.scope', 'cte.cohort', async (t) => {
      const rows = await cohort();

      t.equal('no move: current stage', [rows.ada.initial_key, rows.ada.initial_rank], ['NEW', 0]);
      t.equal('no move, unmapped: no rank', [rows.fay.initial_key, rows.fay.initial_rank], [null, null]);
    }, { field: 'current_key, current_rank' });

    await check('cte.first_move', 'cte.cohort', async (t) => {
      const rows = await cohort();

      t.equal('moved: stage before the first move, not the current one', [rows.ben.initial_key, rows.ben.initial_rank], ['NEW', 0]);
    });

    await check('settings.trackingStart', 'cte.cohort', async (t) => {
      const rows = await cohort();

      t.equal('imported eve stays out', rows.eve, undefined);
      t.equal('the rest are in', Object.keys(rows).sort(), ['ada', 'ben', 'cat', 'dan', 'fay', 'gus']);
    });

    await check('api.filter.dateRange', 'cte.cohort', async (t) => {
      const funnel = await context.page.funnel(small.workspace, { dateFrom: toDate(context.daysAgo(5)) });

      t.equal('only cat applied in range', funnel.cohortSize, 1);
    });

    // ---- arrival and person_step
    const arrival = () => small.funnel('arrival', 'SELECT * FROM arrival');
    const arrivalsOf = (rows, key) =>
      rows
        .filter((row) => small.workspace.keyOf.get(row.person_id) === key)
        .map((row) => [row.rank, days(row.arrived_at)])
        .sort((first, second) => first[0] - second[0]);

    await check('cte.cohort', 'cte.arrival', async (t) => {
      const rows = await arrival();

      t.equal('initial stage at the application date', arrivalsOf(rows, 'ada'), [[0, 30]]);
      t.equal('no rank, no arrival', arrivalsOf(rows, 'fay'), []);
    });

    await check('cte.transition', 'cte.arrival', async (t) => {
      const rows = await arrival();

      t.equal('ranked move arrives', arrivalsOf(rows, 'ben'), [[0, 30], [1, 25]]);
      t.equal('exit move has no rank', arrivalsOf(rows, 'dan'), [[0, 30]]);
    });

    const personStep = () => small.funnel('person_step', 'SELECT * FROM person_step');

    await check('cte.arrival', 'cte.person_step', async (t) => {
      const rows = (await personStep())
        .filter((row) => small.workspace.keyOf.get(row.person_id) === 'ben')
        .map((row) => [row.stage_key, days(row.entered_at), row.next_at === null ? null : days(row.next_at)])
        .sort();

      t.equal('entered and next per step', rows, [['CONTACTED', 25, null], ['NEW', 30, 25]]);
    });

    await check('cte.funnel_stage', 'cte.person_step', async (t) => {
      const rows = await distinct.funnel('person_step', 'SELECT * FROM person_step');
      const old1 = rows
        .filter((row) => distinct.workspace.keyOf.get(row.person_id) === 'old1')
        .map((row) => [row.rank, row.window_days])
        .sort((first, second) => first[0] - second[0]);

      t.equal(
        'a skipper counts at every rank up to the furthest, with each window',
        old1,
        [[0, 14], [1, 14], [2, 14], [3, 14], [4, 14], [5, 14], [6, 14], [7, null]],
      );
    });

    // ---- funnel CTEs
    await check('cte.cohort', 'cte.funnel_group', async (t) => {
      const rows = await small.funnel('funnel_group', 'SELECT * FROM funnel_group');

      t.equal('whole cohort under one key', rows.map(({ group_key: key }) => key).every((key) => key === ''), true);
      t.equal('six people', rows.length, 6);
    });

    await check('cte.category_member', 'cte.funnel_group', async (t) => {
      const rows = await small.track(
        'funnel_group',
        `SELECT g.group_key, count(*)::int AS total FROM funnel_group g GROUP BY 1`,
      );
      const totals = Object.fromEntries(rows.map(({ group_key: key, total }) => [key, total]));

      t.equal('track row', totals['/BUSINESS'], 3);
      t.equal('program row', totals['BUSINESS/FINANCE_INTERN'], 2);
    });

    const stepRow = () => small.funnel('step_row', 'SELECT * FROM step_row');

    await check('cte.person_step', 'cte.step_row', async (t) => {
      const row = (await stepRow()).find(
        ({ person_id: id, stage_key: key }) => id === small.workspace.people.ben && key === 'NEW',
      );

      t.equal('window end is entered plus 14 days', days(row.window_end), 16);
      t.equal('next carried', days(row.next_at), 25);
    });

    await check('cte.funnel_group', 'cte.step_row', async (t) => {
      const rows = await small.track(
        'step_row',
        `SELECT DISTINCT r.group_key FROM step_row r WHERE r.person_id = '${small.workspace.people.cat}'`,
      );

      t.equal(
        'one person, every group of theirs',
        rows.map(({ group_key: key }) => key).sort(),
        ['/AI_SOFTWARE', '/BUSINESS', 'AI_SOFTWARE/AI_AGI_INTERN', 'BUSINESS/FINANCE_INTERN'],
      );
    });

    const stepExit = () => distinct.funnel('step_exit', `SELECT * FROM step_exit WHERE stage_key = 'NEW'`);

    await check('cte.step_row', 'cte.step_exit', async (t) => {
      const keys = Object.keys(distinct.keyed(await stepExit()));

      t.equal('exit after the window end does not count', keys.includes('late'), false);
    });

    await check('cte.transition', 'cte.step_exit', async (t) => {
      t.equal('EXIT moves inside the window', Object.keys(distinct.keyed(await stepExit())).sort(), ['x1', 'x2']);
    });

    const stepTotal = () => distinct.funnel('step_total', `SELECT * FROM step_total WHERE stage_key = 'NEW'`);

    await check('cte.step_row', 'cte.step_total', async (t) => {
      const [row] = await stepTotal();

      t.equal('entered', row.entered, 16);
      t.equal('eligible', row.eligible, 13);
      t.equal('reached next', row.reached_next, 7);
      t.equal('reached so far', row.reached_so_far, 9);
    });

    await check('cte.step_exit', 'cte.step_total', async (t) => {
      t.equal('exited', (await stepTotal())[0].exited, 2);
    });

    const overallRow = () => distinct.funnel('overall_row', 'SELECT * FROM overall_row');

    await check('cte.person_step', 'cte.overall_row', async (t) => {
      const rows = await overallRow();
      const successAges = rows.filter((row) => row.success_at !== null).map((row) => days(row.success_at)).sort((a, b) => a - b);

      t.equal('entry rank people only', rows.length, 16);
      t.equal('success dates of old3 and old1', successAges, [5, 50]);
    });

    await check('config.overallWindowDays', 'cte.overall_row', async (t) => {
      const ends = (await overallRow()).map((row) => days(row.window_end));

      t.equal('created 100 days ago, 90 day window', ends.filter((age) => age === 10).length, 3);
      t.equal('created 40 days ago, still open', ends.filter((age) => age === -50).length, 10);
    });

    await check('cte.overall_row', 'cte.overall_total', async (t) => {
      const [row] = await distinct.funnel('overall_total', 'SELECT * FROM overall_total');

      t.equal('entered', row.entered, 16);
      t.equal('eligible', row.eligible, 3);
      t.equal('reached inside the window', row.reached, 1);
      t.equal('reached at all', row.reached_so_far, 2);
    });

    // ---- stay CTEs
    const eventsOf = (rows, tap, key) =>
      rows.filter((row) => tap.workspace.keyOf.get(row.person_id) === key);

    await check('cte.cohort', 'cte.stay_event', async (t) => {
      const events = eventsOf(await small.funnel('stay_event', 'SELECT * FROM stay_event'), small, 'ada');

      t.equal('created-at row in the initial stage', events.map((row) => [row.stage_key, days(row.happened_at), row.event_order]), [['NEW', 30, 0]]);
    });

    await check('cte.transition', 'cte.stay_event', async (t) => {
      const events = eventsOf(await small.funnel('stay_event', 'SELECT * FROM stay_event'), small, 'ben');

      t.ok('the move is an event', events.some((row) => row.stage_key === 'CONTACTED' && days(row.happened_at) === 25 && row.origin === 'timeline'), events);
    });

    await check('cte.stay_event', 'cte.ordered_event', async (t) => {
      const events = eventsOf(await small.funnel('ordered_event', 'SELECT * FROM ordered_event ORDER BY event_number'), small, 'ben');

      t.equal('ordered, with the stage before', events.map((row) => [Number(row.event_number), row.stage_key, row.previous_key]), [[1, 'NEW', null], [2, 'CONTACTED', 'NEW']]);
    });

    await check('cte.ordered_event', 'cte.kept_event', async (t) => {
      const events = eventsOf(await distinct.funnel('kept_event', 'SELECT * FROM kept_event'), distinct, 'old1');

      t.equal(
        'a move between two raw values of one stage is dropped',
        events.map((row) => [row.stage_key, days(row.happened_at)]).sort((first, second) => second[1] - first[1]),
        [['NEW', 100], ['SIGNED', 50]],
      );
    });

    await check('cte.kept_event', 'cte.stay', async (t) => {
      const stays = eventsOf(await small.funnel('stay', 'SELECT * FROM stay ORDER BY started_at'), small, 'ben');

      t.equal(
        'a stay runs to the next kept row',
        stays.map((row) => [row.stage_key, days(row.started_at), row.ended_at === null ? null : days(row.ended_at)]),
        [['NEW', 30, 25], ['CONTACTED', 25, null]],
      );
    });

    await check('cte.stay', 'cte.completed_stay', async (t) => {
      const rows = await small.funnel('completed_stay', 'SELECT stage_key, stay_days FROM completed_stay ORDER BY stay_days');

      t.equal('open stays left out; days, not milliseconds', rows.map((row) => [row.stage_key, Math.round(row.stay_days)]), [['NEW', 5], ['NEW', 10]]);
    });

    // ---- stage clock CTEs
    const clock = async (cteName) => small.keyed(await small.overview(cteName, `SELECT * FROM ${cteName}`));

    await check('cte.transition', 'cte.latest_entry', async (t) => {
      t.equal('entered the current stage', days((await clock('latest_entry')).ben.happened_at), 25);
    });

    await check('cte.scope', 'cte.latest_entry', async (t) => {
      const rows = await clock('latest_entry');

      t.equal('dan moved to his current stage too', Object.keys(rows).sort(), ['ben', 'dan']);
      t.equal('zed left the scope', rows.zed, undefined);
    });

    await check('cte.transition', 'cte.moved_person', async (t) => {
      t.equal('anyone with a move', Object.keys(await clock('moved_person')).sort(), ['ben', 'dan', 'zed']);
    });

    await check('cte.scope', 'cte.stage_clock', async (t) => {
      t.equal('active people only', Object.keys(await clock('stage_clock')).sort(), ['ada', 'ben', 'cat', 'eve']);
    });

    await check('cte.latest_entry', 'cte.stage_clock', async (t) => {
      const rows = await clock('stage_clock');

      t.equal('from the move', days(rows.ben.stage_entered_at), 25);
      t.equal('no move: from creation', days(rows.ada.stage_entered_at), 30);
      t.equal('timeline is exact', rows.ben.is_lower_bound, false);
    });

    await check('cte.moved_person', 'cte.stage_clock', async (t) => {
      const rows = await clock('stage_clock');

      t.equal('imported and unmoved', rows.eve.is_inactive, true);
      t.equal('imported people have no known entry', rows.eve.stage_entered_at, null);
      t.equal('moved', rows.ben.is_inactive, false);
    });

    await check('cte.stage_map', 'cte.stage_clock', async (t) => {
      t.equal('limit', (await clock('stage_clock')).ada.limit_days, 14);
    });

    await check('cte.stage_clock', 'cte.stage_age', async (t) => {
      const rows = await clock('stage_age');

      t.equal('whole days', rows.ada.days_in_stage, 30);
      t.equal('from the move', rows.ben.days_in_stage, 25);
    });

    // ---- categories
    const personPosition = () => small.track('person_position', 'SELECT * FROM person_position');
    const positionsOf = (rows, key) =>
      rows
        .filter((row) => small.workspace.keyOf.get(row.person_id) === key)
        .map((row) => [row.position_key, row.track_key])
        .sort();

    await check('cte.scope', 'cte.person_position', async (t) => {
      const rows = await personPosition();

      t.equal('one row per position', positionsOf(rows, 'cat'), [['AI_AGI_INTERN', 'AI_SOFTWARE'], ['FINANCE_INTERN', 'BUSINESS']]);
      t.equal('none for no position', positionsOf(rows, 'gus'), []);
    });

    await check('cte.position_map', 'cte.person_position', async (t) => {
      t.equal('unknown position', positionsOf(await personPosition(), 'fay'), [['LEGACY_POSITION', 'UNMAPPED']]);
    });

    await check('cte.person_position', 'cte.category_member', async (t) => {
      const rows = await small.track('category_member', 'SELECT * FROM category_member');
      const ada = rows
        .filter((row) => small.workspace.keyOf.get(row.person_id) === 'ada')
        .map((row) => [row.category_key, row.parent_key])
        .sort();

      t.equal('a program row and a track row', ada, [['BUSINESS', null], ['FINANCE_INTERN', 'BUSINESS']]);
    });

    await check('cte.scope', 'cte.category_member', async (t) => {
      const sourceRows = await small.source('category_member', 'SELECT * FROM category_member');
      const trackRows = await small.track('category_member', 'SELECT * FROM category_member');
      const of = (rows, key) => rows.filter((row) => small.workspace.keyOf.get(row.person_id) === key).map((row) => row.category_key);

      t.equal('source by value', of(sourceRows, 'ben'), ['REFERRAL']);
      t.equal('no source is NONE', of(sourceRows, 'dan'), ['NONE']);
      t.equal('no position is NONE', of(trackRows, 'eve'), ['NONE']);
    });

    // ---- other CTEs
    const submission = () => small.overview('submission', 'SELECT * FROM submission');

    await check('facade.submissionRelation.person_id', 'cte.submission', async (t) => {
      t.equal('ada and ben', Object.keys(small.keyed(await submission())).sort(), ['ada', 'ben']);
    });

    await check('facade.submissionRelation.submitted_at', 'cte.submission', async (t) => {
      t.equal('same instant', toIso(small.keyed(await submission()).ada.submitted_at), toIso(context.daysAgo(2)));
    });

    const periodMove = () => small.trends('period_move', 'SELECT * FROM period_move');

    await check('cte.transition', 'cte.period_move', async (t) => {
      t.equal('moves in the range', (await periodMove()).map((row) => [row.from_key, row.to_key]), [['NEW', 'CONTACTED']]);
    });

    await check('cte.scope', 'cte.period_move', async (t) => {
      const [{ total }] = await small.trends('transition', `SELECT count(*)::int AS total FROM transition WHERE person_id = '${small.workspace.people.zed}'`);

      t.equal("zed's move is in the range", total, 1);
      t.equal("but zed left the scope, so only ben's counts", (await periodMove()).length, 1);
    });

    await check('cte.period_move', 'cte.entered_total', async (t) => {
      t.equal('per to stage', (await small.trends('entered_total', 'SELECT stage_key, moved::int AS moved FROM entered_total')), [{ stage_key: 'CONTACTED', moved: 1 }]);
    });

    await check('cte.period_move', 'cte.left_total', async (t) => {
      t.equal('per from stage', (await small.trends('left_total', 'SELECT stage_key, moved::int AS moved FROM left_total')), [{ stage_key: 'NEW', moved: 1 }]);
    });

    await check('cte.scope', 'cte.current_total', async (t) => {
      const rows = await small.trends('current_total', 'SELECT stage_key, people::int AS people FROM current_total ORDER BY stage_key');

      t.equal('people per mapped stage now, whatever the date range', rows, [
        { stage_key: 'CONTACTED', people: 1 },
        { stage_key: 'NEW', people: 3 },
        { stage_key: 'NOT_INTERESTED', people: 1 },
      ]);
    });

    await check('analytics.daily_snapshot.snapshot_date', 'cte.snapshot_day', async (t) => {
      const rows = await small.trends('snapshot_day', 'SELECT snapshot_date::text AS day FROM snapshot_day');

      t.equal(
        'a date filter ending before today finds no snapshot',
        rows,
        [],
      );

      const open = await small.sourceTrend('snapshot_day', 'SELECT snapshot_date::text AS day FROM snapshot_day');

      t.equal('today', open.map(({ day }) => day), [toDate(context.now)]);
    });

    await check('cte.snapshot_day', 'cte.bucket_day', async (t) => {
      const rows = await small.sourceTrend('bucket_day', 'SELECT bucket_start::text AS bucket, snapshot_date::text AS day FROM bucket_day');

      t.equal('one bucket with its last snapshot', rows.length, 1);
      t.equal('the snapshot', rows[0]?.day, toDate(context.now));
    });

    const matchingRow = () => small.sourceTrend('matching_row', 'SELECT * FROM matching_row');

    await check('analytics.daily_snapshot.person_count', 'cte.matching_row', async (t) => {
      t.equal('counts', (await matchingRow()).map(({ person_count: count }) => count), [2]);
    });

    await check('analytics.daily_snapshot.dimension', 'cte.matching_row', async (t) => {
      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.daily_snapshot WHERE workspace_id = $1 AND dimension_key = 'LINKEDIN'`,
        [small.workspace.workspaceId],
      );

      t.equal('only the source row', total, (await matchingRow()).length);
    });

    await check('analytics.daily_snapshot.dimension_key', 'cte.matching_row', async (t) => {
      const trends = await context.page.trends(small.workspace, 'TOTAL_CONTACTS', { filter: { sourceKey: 'REFERRAL' } });

      t.equal('another key, another count', trends.series.at(-1).value, 1);
    });

    await check('analytics.daily_snapshot.stage', 'cte.matching_row', async (t) => {
      const trends = await context.page.trends(small.workspace, 'STAGE_COUNT', { stageKey: 'NOT_INTERESTED' });

      t.equal('raw stage mapped at read time', trends.series.at(-1).value, 1);
    });

    await check('analytics.daily_snapshot.workspace_id', 'cte.matching_row', async (t) => {
      const [{ total }] = await context.query(
        `SELECT sum(person_count)::int AS total FROM analytics.daily_snapshot WHERE dimension = 'source' AND dimension_key = 'LINKEDIN'`,
      );

      t.ok('other workspaces hold LINKEDIN rows', total > 2, { total });
      t.equal('this read sees only its own', (await matchingRow()).reduce((sum, { person_count: count }) => sum + count, 0), 2);
    });

    await check('cte.transition', 'cte.mapped_mover', async (t) => {
      t.equal('anyone with a mapped stage', Object.keys(small.keyed(await small.funnel('mapped_mover', 'SELECT * FROM mapped_mover'))).sort(), ['ben', 'dan', 'zed']);
    });
  },
};
