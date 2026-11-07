// One check per use case: the product's own answer against a value worked out by hand from
// seed-data.mjs. expected.mjs covers every number; these say what each case is for, and a
// wrong hand value here shows up as a disagreement with expected.mjs too.
import { FIXED_NOW, TRACKING_START } from './seed-data.mjs';

const NEW_ROW_BY_HAND = { entered: 55, eligible: 52, reachedNext: 29, exited: 3, timedOut: 20, inWindow: 3 };
const CONTACTED_ROW_BY_HAND = { entered: 40, eligible: 32, reachedNext: 13, exited: 1, timedOut: 18, inWindow: 8 };

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object?.[key]]));
const STEP_COUNTS = ['entered', 'eligible', 'reachedNext', 'exited', 'timedOut', 'inWindow'];

const describeRows = (rows) =>
  rows.map(({ from_stage: from, to_stage: to, origin }) => `${from}>${to} ${origin}`);

// Each entry: use case IDs, what it proves, and the assertions.
export const USE_CASE_CHECKS = [
  [['UC-01'], 'Every main stage has its hand-counted people', async (t, { overview }) => {
    for (const [stageKey, count] of Object.entries({ NEW: 12, CONTACTED: 23, BEFORE_MEETING: 9, SATURDAY_MEETING: 1, ATTENDED: 1, SECOND_MEETING: 1, AGREEMENT_SENT: 1, SIGNED: 5 })) {
      t.equal(`${stageKey} total`, overview.stageTotals[stageKey]?.count, count);
    }
  }],
  [['UC-02'], 'Every exit stage has its hand-counted people', async (t, { overview }) => {
    for (const [stageKey, count] of Object.entries({ NO_ANSWER: 2, NOT_INTERESTED: 3, REJECTED_BY_US: 1 })) {
      t.equal(`${stageKey} total`, overview.stageTotals[stageKey]?.count, count);
    }
  }],
  [['UC-03'], 'P023 was reset to Interested: funnel unchanged, active, not stuck', async (t, { overview, stepsOf, stuckOf }) => {
    t.equal('furthest stage kept', stepsOf('P023'), 'RRRRT');
    t.equal('INTERESTED total', overview.stageTotals.INTERESTED?.count, 2);
    t.equal('never stuck', stuckOf('P023'), undefined);
  }],
  [['UC-04'], 'Created at Interested: out of the cohort until a ranked stage', async (t, { stepsOf, enteredAge, funnel }) => {
    t.equal('P024 not in the cohort', stepsOf('P024'), '');
    t.equal('P025 enters New at the move', enteredAge('P025', 'NEW'), 30);
    t.equal('P024 is mapped, so not excluded as unmapped', funnel.cohortExcludedUnmapped, 2);
  }],
  [['UC-05'], 'P026 on a reminder nests under Contacted', async (t, { overview }) => {
    t.equal('Contacted total includes it', overview.stageTotals.CONTACTED?.count, 23);
    t.equal('nested reminder row', overview.stageTotals['CONTACTED/CONTACTED_REMINDER']?.count, 1);
    t.equal('nested plain row', overview.stageTotals['CONTACTED/CONTACTED']?.count, 22);
  }],
  [['UC-06'], 'A reminder restarts neither the clock nor the stay', async (t, { stuckOf, funnelOf }) => {
    t.equal('P026 clock from Contacted, not the reminder', stuckOf('P026')?.daysInStage, 30);

    const onlyP027 = await funnelOf({ programKey: 'QUALITY_ASSURANCE_INTERN' });

    t.equal('P027 one Contacted stay of 10 days', pick(onlyP027.rows.CONTACTED, ['medianDays', 'completedStays']), { medianDays: 10, completedStays: 1 });
  }],
  [['UC-07'], 'P028 renamed with an alias: no reconcile row', async (t, { transitionsOf, overview }) => {
    t.equal('only the timeline row', describeRows(transitionsOf('P028')), ['NEW>PRE_MEETING timeline']);
    t.equal('reads as Before meeting', overview.stageTotals['BEFORE_MEETING/BEFORE_MEETING']?.count, 9);
  }],
  [['UC-08'], 'Unmapped raw values have their own rows and no funnel step', async (t, { overview, stepsOf, overviewOf }) => {
    t.equal('LEGACY_TEST row', overview.stageTotals['UNMAPPED/LEGACY_TEST']?.count, 2);
    t.equal('LEGACY_OLD row', overview.stageTotals['UNMAPPED/LEGACY_OLD']?.count, 1);
    t.equal('P032 stays in the cohort from New', stepsOf('P032'), 'T');

    const unmapped = await overviewOf({ status: 'UNMAPPED' });

    t.equal('not active', [unmapped.figures.totalContacts, unmapped.figures.activePeople], [3, 0]);
  }],
  [['UC-09'], 'P029 and P030 are excluded as unmapped', async (t, { funnel, stepsOf }) => {
    t.equal('cohortExcludedUnmapped', funnel.cohortExcludedUnmapped, 2);
    t.equal('not in the cohort', [stepsOf('P029'), stepsOf('P030')], ['', '']);
  }],
  [['UC-10'], 'P031 enters the funnel at the move', async (t, { stepsOf, enteredAge }) => {
    t.equal('steps', stepsOf('P031'), 'RT');
    t.equal('entered New at the move', enteredAge('P031', 'NEW'), 30);
  }],
  [['UC-11'], 'P033 has no stage', async (t, { overview, stepsOf, overviewOf }) => {
    t.equal('No stage row', overview.stageTotals.NO_STAGE?.count, 1);
    t.equal('not in the cohort', stepsOf('P033'), '');

    const noStage = await overviewOf({ status: 'NO_STAGE' });

    t.equal('counted, not active', [noStage.figures.totalContacts, noStage.figures.activePeople], [1, 0]);
  }],
  [['UC-12'], 'P034 enters the funnel at the assignment', async (t, { stepsOf, enteredAge }) => {
    t.equal('steps', stepsOf('P034'), 'T');
    t.equal('entered New at the assignment', enteredAge('P034', 'NEW'), 30);
  }],
  [['UC-13'], 'Signed Paid and Non paid are one success', async (t, { overview, funnel }) => {
    t.equal('SIGNED total', overview.stageTotals.SIGNED?.count, 5);
    t.equal('nested', [overview.stageTotals['SIGNED/SIGNED_PAID']?.count, overview.stageTotals['SIGNED/SIGNED_NON_PAID']?.count], [3, 2]);
    t.equal('final stage row entered', funnel.rows.SIGNED?.entered, 5);
    t.equal('overall counts both raw values', funnel.overall.reached, 3);
  }],
  [['UC-14'], 'Stage totals add up to total contacts', async (t, { overview }) => {
    const topRows = Object.values(overview.stageTotals).filter((row) => row.rowKind !== 'NESTED');

    t.equal('total contacts by hand', overview.figures.totalContacts, 65);
    t.equal('top rows sum', topRows.reduce((sum, row) => sum + row.count, 0), 65);
  }],

  [['UC-15'], 'P001 steps inside the window', async (t, { stepsOf, transitionsOf }) => {
    t.equal('steps', stepsOf('P001'), 'RT');
    t.equal('one row', describeRows(transitionsOf('P001')), ['NEW>CONTACTED timeline']);
  }],
  [['UC-16'], 'P002 is late: timed out at New, entered Contacted', async (t, { stepsOf, enteredAge }) => {
    t.equal('steps', stepsOf('P002'), 'TT');
    t.equal('entered Contacted', enteredAge('P002', 'CONTACTED'), 20);
  }],
  [['UC-17'], 'Skips count as reached and have no stay', async (t, { stepsOf, funnelOf }) => {
    t.equal('P007', stepsOf('P007'), 'RRRRT');
    t.equal('P010', stepsOf('P010'), 'TRRRRRRF');

    const sample = await funnelOf({ sourceKey: 'UNIVERSITY' });

    t.equal('no Contacted stay in the sample', pick(sample.rows.CONTACTED, ['medianDays', 'completedStays']), { medianDays: null, completedStays: 0 });
    t.equal('no stay at the skipped Before meeting', sample.rows.BEFORE_MEETING?.completedStays, 0);
  }],
  [['UC-18'], 'P019 moved back', async (t, { stepsOf, stuckOf, transitionsOf }) => {
    t.equal('furthest kept', stepsOf('P019'), 'RRRRT');
    t.equal('clock from the latest arrival', stuckOf('P019')?.daysInStage, 45);
    t.equal('rows', describeRows(transitionsOf('P019')), ['NEW>CONTACTED timeline', 'CONTACTED>ATTENDED timeline', 'ATTENDED>CONTACTED timeline']);
  }],
  [['UC-19'], 'Exits inside the window', async (t, { stepsOf }) => {
    t.equal('P003 at New', stepsOf('P003'), 'E');
    t.equal('P021 at Contacted', stepsOf('P021'), 'RE');
    t.equal('P015 at Before meeting', stepsOf('P015'), 'RRE');
  }],
  [['UC-20'], 'P020 exits after the window', async (t, { stepsOf }) => {
    t.equal('timed out', stepsOf('P020'), 'T');
  }],
  [['UC-21'], 'P004 never moved', async (t, { stepsOf, transitionsOf }) => {
    t.equal('timed out', stepsOf('P004'), 'T');
    t.equal('no row', transitionsOf('P004').length, 0);
  }],
  [['UC-22'], 'P049: merged before any sync', async (t, { transitionsOf, stepsOf, ageOf }) => {
    const rows = transitionsOf('P049');

    t.equal('one row', describeRows(rows), ['NEW>BEFORE_MEETING timeline']);
    t.equal('dated by the first change', ageOf(rows[0]?.happened_at), '20d40m');
    t.equal('Contacted counts as skipped', stepsOf('P049'), 'RRT');
  }],
  [['UC-23'], 'P050: seen, then merged forward', async (t, { transitionsOf, stepsOf, ageOf }) => {
    const rows = transitionsOf('P050');

    t.equal('two rows', describeRows(rows), ['NEW>CONTACTED timeline', 'CONTACTED>BEFORE_MEETING timeline']);
    t.equal('second dated by the merge', ageOf(rows[1]?.happened_at), '20d27m');
    t.equal('steps', stepsOf('P050'), 'RRT');
  }],
  [['UC-24'], 'P051: a no-op is stored and ignored', async (t, { transitionsOf, stepsOf, stuckOf }) => {
    t.equal('stored', describeRows(transitionsOf('P051')), ['NEW>NEW timeline']);
    t.equal('steps', stepsOf('P051'), 'T');
    t.equal('clock runs from creation', stuckOf('P051')?.daysInStage, 30);
  }],
  [['UC-25'], 'P052: seen, then merged back', async (t, { transitionsOf, stepsOf, overviewOf, personIdOf }) => {
    t.equal('backward move appended', describeRows(transitionsOf('P052')), ['NEW>CONTACTED timeline', 'CONTACTED>NEW timeline']);
    t.equal('steps', stepsOf('P052'), 'RT');

    const { stuck } = await overviewOf({});

    t.equal('clock runs from the merge', Math.floor(stuck.rows[personIdOf('P052')]?.daysInStage ?? -1), 20);
  }],
  [['UC-26'], 'Reconcile rows count for reached and movement, not durations', async (t, { transitionsOf, stepsOf, funnelOf, trendsOf }) => {
    t.equal('P045 flagged row', describeRows(transitionsOf('P045')).at(-1), 'CONTACTED>BEFORE_MEETING reconcile');
    t.equal('reached counts it', stepsOf('P045'), 'RTT');

    const onlyP045 = await funnelOf({ programKey: 'PROMPT_ENGINEER_INTERN' });

    t.equal('Contacted stay excluded', onlyP045.rows.CONTACTED?.completedStays, 0);

    const { movement } = await trendsOf('NEW_APPLICATIONS', null, { period: 'WEEK' });

    t.equal('this week: P047 and P048 entered Before meeting', movement.rows.BEFORE_MEETING?.enteredInPeriod, 2);
  }],
  [['UC-27'], 'P047 is skipped while recent, then reconciled', async (t, { observed, transitionsOf, ageOf }) => {
    t.equal('no reconcile row after the daily it was too recent for', describeRows(observed.afterStep.secondDaily.byPerson.P047 ?? []), ['NEW>CONTACTED timeline']);

    const rows = transitionsOf('P047');

    t.equal('reconciled by the next daily', describeRows(rows).at(-1), 'CONTACTED>BEFORE_MEETING reconcile');
    t.equal('dated by that run', ageOf(rows.at(-1)?.happened_at), '0d1m');
  }],
  [['UC-28'], 'P046 changed with no transition', async (t, { transitionsOf, stepsOf, stuckOf }) => {
    t.equal('no row', transitionsOf('P046').length, 0);
    t.equal('current stage is its initial stage', stepsOf('P046'), 'RT');
    t.equal('clock from creation', stuckOf('P046')?.daysInStage, 40);
  }],
  [['UC-29'], 'P022 exit counts at New only', async (t, { stepsOf }) => {
    t.equal('steps', stepsOf('P022'), 'ET');
  }],
  [['UC-30'], 'Ignored timeline rows stay out', async (t, { query, workspaceId, ignoredRowIds, transitionsOf }) => {
    const [{ count }] = await query(`SELECT count(*)::int AS count FROM analytics.stage_transition WHERE workspace_id = $1 AND source_id = ANY($2::uuid[])`, [workspaceId, ignoredRowIds]);

    t.equal('none stored', count, 0);
    t.equal('P004 has none', transitionsOf('P004').length, 0);
    t.equal('P041 before tracking start', transitionsOf('P041').length, 0);
  }],
  [['UC-31'], 'P001 row also changed the email: only the stage is copied', async (t, { transitionsOf, query }) => {
    t.equal('read', describeRows(transitionsOf('P001')), ['NEW>CONTACTED timeline']);

    const columns = await query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'stage_transition'`);

    t.equal('no column for anything else', columns.map((row) => row.column_name).sort(), ['from_stage', 'happened_at', 'id', 'origin', 'person_id', 'source_id', 'source_updated_at', 'to_stage', 'workspace_id']);
  }],
  [['UC-32'], 'Rerunning adds nothing', async (t, { observed }) => {
    const { thirdDaily, rerunDaily } = observed.afterStep;

    t.equal('transitions', rerunDaily.transitionCount, thirdDaily.transitionCount);
    t.equal('snapshot rows', rerunDaily.snapshotCount, thirdDaily.snapshotCount);
    t.equal('reports', rerunDaily.reportCount, thirdDaily.reportCount);
  }],
  [['UC-33'], 'P054 is read by the next sync through the overlap', async (t, { observed }) => {
    t.equal('not there before it arrived', observed.afterStep.lateRowSync.byPerson.P054, undefined);
    t.equal('read', describeRows(observed.afterStep.overlapSync.byPerson.P054 ?? []), ['NEW>CONTACTED timeline']);
  }],
  [['UC-34'], 'P055 is older than the overlap', async (t, { observed }) => {
    t.equal('missed by the sync', observed.afterStep.overlapSync.byPerson.P055, undefined);
    t.equal('read by the daily', describeRows(observed.afterStep.secondDaily.byPerson.P055 ?? []), ['NEW>CONTACTED timeline']);
  }],
  [['UC-35'], 'P056 is read although a newer reconcile row exists', async (t, { observed }) => {
    t.equal('the daily wrote a reconcile row', describeRows(observed.afterStep.secondDaily.byPerson.P048 ?? []).at(-1), 'CONTACTED>BEFORE_MEETING reconcile');
    t.equal('not there before it arrived', observed.afterStep.secondDaily.byPerson.P056, undefined);
    t.equal('read by the next sync', describeRows(observed.afterStep.cursorSync.byPerson.P056 ?? []), ['NEW>CONTACTED timeline']);
  }],

  [['UC-36'], 'Too recent is reported apart', async (t, { stepsOf, funnel, funnelOf }) => {
    t.equal('P005', stepsOf('P005'), 'WW');
    t.equal('P006', stepsOf('P006'), 'W');
    t.equal('New in window', funnel.rows.NEW?.inWindow, 3);

    const sample = await funnelOf({ sourceKey: 'UNIVERSITY' });

    t.equal('not in the rate', sample.rows.NEW?.stepRate, 2 / 5);
    t.equal('in so far', sample.rows.NEW?.soFarRate, 4 / 7);
  }],
  [['UC-37'], 'P014 is too recent for overall', async (t, { funnelOf }) => {
    const { overall } = await funnelOf({ programKey: 'MACHINE_LEARNING_ENGINEERING_INTERN' });

    t.equal('overall', pick(overall, ['eligible', 'reached', 'rate', 'soFarRate']), { eligible: 0, reached: 0, rate: null, soFarRate: 1 });
  }],
  [['UC-38'], 'P009 and P015 are old enough for all', async (t, { funnelOf }) => {
    const success = (await funnelOf({ programKey: 'COMPUTER_VISION_ENGINEERING_INTERN' })).overall;
    const noSuccess = (await funnelOf({ programKey: 'FRONT_END_DEVELOPER_INTERN' })).overall;

    t.equal('P009', pick(success, ['eligible', 'reached', 'rate']), { eligible: 1, reached: 1, rate: 1 });
    t.equal('P015', pick(noSuccess, ['eligible', 'reached', 'rate']), { eligible: 1, reached: 0, rate: 0 });
  }],
  [['UC-39'], 'Stuck people, by hand', async (t, { overview, stuckOf }) => {
    t.equal('stuck total', overview.stuck.total, 33);
    t.equal('figure', overview.figures.stuckPeople, 33);
    t.equal('P038 one day over', stuckOf('P038')?.daysOverLimit, 1);
    t.equal('pastLimitCount on New', overview.stageTotals.NEW?.pastLimitCount, 9);
  }],
  [['UC-40'], 'P037 is exactly at both limits', async (t, { stuckOf, stepsOf }) => {
    t.equal('not stuck', stuckOf('P037'), undefined);
    t.equal('eligible, timed out', stepsOf('P037'), 'T');
  }],
  [['UC-41'], 'P040 and P041 are inactive', async (t, { overview, stuckOf }) => {
    t.equal('inactive', overview.figures.inactivePeople, 2);
    t.equal('not listed', [stuckOf('P040'), stuckOf('P041')], [undefined, undefined]);
  }],
  [['UC-42'], 'P008 moved on the timeline', async (t, { stepsOf, transitionsOf, trendsOf }) => {
    t.equal('not in the cohort', stepsOf('P008'), '');
    t.equal('row stored', describeRows(transitionsOf('P008')), ['NEW>CONTACTED timeline']);

    const { movement } = await trendsOf('NEW_APPLICATIONS', null, { period: 'WEEK', sourceKey: 'UNIVERSITY', dateFrom: '2026-11-08', dateTo: '2026-11-08' });

    t.equal('in movement on the day it moved', movement.rows.CONTACTED?.enteredInPeriod, 1);
  }],
  [['UC-43'], 'P043 reads "at least"', async (t, { stuckOf }) => {
    t.equal('lower bound', pick(stuckOf('P043'), ['daysInStage', 'daysOverLimit', 'isLowerBound']), { daysInStage: 20, daysOverLimit: 6, isLowerBound: true });
  }],
  [['UC-44'], 'P044 has no known clock', async (t, { overview, stuckOf }) => {
    t.equal('not stuck', stuckOf('P044'), undefined);
    t.equal('not inactive either', overview.figures.inactivePeople, 2);
  }],
  [['UC-45'], 'Exactly at tracking start', async (t, { stepsOf, transitionsOf }) => {
    t.equal('P039 is in the cohort', stepsOf('P039'), 'T');
    t.equal('P043 row at tracking start is read', describeRows(transitionsOf('P043'))[0], 'NEW>CONTACTED timeline');
  }],
  [['UC-46'], 'One second before tracking start', async (t, { stepsOf, overviewOf }) => {
    t.equal('P040 is not in the cohort', stepsOf('P040'), '');

    const firstDay = await overviewOf({ dateFrom: '2026-08-10', dateTo: '2026-08-10' });

    t.equal('only P039 counts on that date', firstDay.figures.totalContacts, 1);
  }],
  [['UC-47'], 'Late night in Asia/Karachi', async (t, { zone }) => {
    t.equal('created: UTC Nov 3 has P038 and P057', zone.utcCreatedNov3, 2);
    t.equal('created: local Nov 3 has P038 only', zone.localCreatedNov3, 1);
    t.equal('created: local Nov 4 has P037 and P057', zone.localCreatedNov4, 2);
    t.equal('moved: UTC Nov 10', zone.utcMovedNov10, 1);
    t.equal('moved: local Nov 10', zone.localMovedNov10, 0);
    t.equal('moved: local Nov 11', zone.localMovedNov11, 1);
    t.equal('volume in the local span', [zone.localNewApplications, zone.localNewApplicationsPrevious], [8, 1]);
  }],
  [['UC-48'], 'P035 moves exactly at the end of the window', async (t, { stepsOf }) => {
    t.equal('reached', stepsOf('P035'), 'RT');
  }],
  [['UC-49'], 'P036 exits exactly at the end of the window', async (t, { stepsOf }) => {
    t.equal('exited', stepsOf('P036'), 'E');
  }],
  [['UC-50'], 'Overall conversion, by hand', async (t, { funnel }) => {
    t.equal('overall', pick(funnel.overall, ['finalStageKey', 'windowDays', 'eligible', 'reached', 'rate', 'soFarRate']), {
      finalStageKey: 'SIGNED',
      windowDays: 90,
      eligible: 7,
      reached: 3,
      rate: 3 / 7,
      soFarRate: 5 / 55,
    });
  }],
  [['UC-51'], 'No limit on success, exit or OTHER', async (t, { stuckOf, overview }) => {
    t.equal('P009, P020, P023 are not listed', [stuckOf('P009'), stuckOf('P020'), stuckOf('P023')], [undefined, undefined, undefined]);
    t.equal('no pastLimitCount', [overview.stageTotals.SIGNED?.pastLimitCount, overview.stageTotals.NO_ANSWER?.pastLimitCount, overview.stageTotals.INTERESTED?.pastLimitCount], [null, null, null]);
  }],
  [['UC-52'], 'P042 is imported at an exit', async (t, { overview }) => {
    t.equal('inactive stays 2', overview.figures.inactivePeople, 2);
  }],
  [['UC-53'], 'Stuck list order and live names', async (t, { rawOverview, keyOfPerson }) => {
    const { rows } = rawOverview.stuck;

    t.equal('longest over the limit first', keyOfPerson(rows[0]?.personId), 'P039');
    t.equal('name read from the person', rows[0]?.displayName, 'Zzsentinel P039');
    t.ok('never increases', rows.every((row, index) => index === 0 || rows[index - 1].daysOverLimit >= row.daysOverLimit));
    t.equal('all rows returned under the cap', rows.length, 33);
  }],

  [['UC-54'], 'One position, one row of each kind', async (t, { track }) => {
    t.equal('SOFTWARE program people', track.rows['AI_SOFTWARE/SOFTWARE_DEVELOPMENT_INTERN']?.people, 53);
    t.equal('AI track people', track.rows['TOP/AI_SOFTWARE']?.people, 59);
  }],
  [['UC-55'], 'P058 has two positions in one track', async (t, { track }) => {
    t.equal('once in the track', track.rows['TOP/BUSINESS']?.people, 1);
    t.equal('once per program', [track.rows['BUSINESS/FINANCE_INTERN']?.people, track.rows['BUSINESS/MARKETING_INTERN']?.people], [1, 1]);
    t.equal('in several', track.peopleInSeveral, 3);
  }],
  [['UC-56'], 'P059 and P060 cross tracks', async (t, { track }) => {
    t.equal('Robotics', track.rows['TOP/ROBOTICS']?.people, 1);
    t.equal('in several tracks', track.peopleInSeveralTracks, 2);
    t.equal('distinct people', track.distinctPeople, 65);
  }],
  [['UC-57'], 'P062 and P063 have no position', async (t, { track, overviewOf }) => {
    t.equal('NONE track row', track.rows['TOP/NONE']?.people, 2);

    const none = await overviewOf({ trackKey: 'NONE' });

    t.equal('the filter finds them', none.figures.totalContacts, 2);
  }],
  [['UC-58'], 'P060 and P061 have an unmapped position', async (t, { track }) => {
    t.equal('UNMAPPED track row', pick(track.rows['TOP/UNMAPPED'], ['people', 'isUnmapped']), { people: 2, isUnmapped: true });
    t.equal('raw program row', pick(track.rows['UNMAPPED/LEGACY_POSITION'], ['people', 'isUnmapped']), { people: 2, isUnmapped: true });
  }],
  [['UC-59'], 'Every track is present', async (t, { track }) => {
    for (const [trackKey, people] of Object.entries({ AI_SOFTWARE: 59, ROBOTICS: 1, BUSINESS: 1, DESIGN_COMMUNICATION: 2, EMERGING_SCIENCES: 1 })) {
      t.equal(trackKey, track.rows[`TOP/${trackKey}`]?.people, people);
    }
  }],
  [['UC-60'], 'FINANCE_INTERN is below the minimum', async (t, { funnelOf }) => {
    const funnel = await funnelOf({ programKey: 'FINANCE_INTERN' });

    t.equal('New step eligible', funnel.rows.NEW?.eligible, 1);
    t.equal('marked', funnel.rows.NEW?.isUnderMinimum, true);
  }],
  [['UC-61'], 'SOFTWARE_DEVELOPMENT_INTERN is above the minimum at New', async (t, { funnelOf, track }) => {
    const funnel = await funnelOf({ programKey: 'SOFTWARE_DEVELOPMENT_INTERN' });

    t.equal('New step eligible', funnel.rows.NEW?.eligible, 41);
    t.equal('not marked', funnel.rows.NEW?.isUnderMinimum, false);
    t.equal('Contacted under it', [funnel.rows.CONTACTED?.eligible, funnel.rows.CONTACTED?.isUnderMinimum], [22, true]);
    t.equal('category row agrees', track.rows['AI_SOFTWARE/SOFTWARE_DEVELOPMENT_INTERN']?.stepRates?.NEW?.eligible, 41);
  }],
  [['UC-62'], 'Lowest step rule', async (t, { funnel, funnelOf, withMinimumSample }) => {
    t.equal('all people: first step excluded because Contacted qualifies', funnel.lowestStepStageKey, 'CONTACTED');
    t.equal('main rows by hand', [pick(funnel.rows.NEW, STEP_COUNTS), pick(funnel.rows.CONTACTED, STEP_COUNTS)], [NEW_ROW_BY_HAND, CONTACTED_ROW_BY_HAND]);
    t.equal('only the first step qualifies', (await funnelOf({ programKey: 'SOFTWARE_DEVELOPMENT_INTERN' })).lowestStepStageKey, 'NEW');
    t.equal('none qualifies', (await funnelOf({ programKey: 'FINANCE_INTERN' })).lowestStepStageKey, null);

    for (const [minimumSample, lowest] of [[1, 'ATTENDED'], [3, 'CONTACTED'], [5, 'NEW'], [6, null]]) {
      const sample = await withMinimumSample(minimumSample, () => funnelOf({ sourceKey: 'UNIVERSITY' }));

      t.equal(`sample with minimum ${minimumSample}`, sample.lowestStepStageKey, lowest);
    }
  }],
  [['UC-63'], 'Known sources', async (t, { source }) => {
    for (const [sourceKey, people] of Object.entries({ UNIVERSITY: 8, LINKEDIN: 17, REFERRAL: 16, WEBSITE: 18 })) {
      t.equal(sourceKey, source.rows[`TOP/${sourceKey}`]?.people, people);
    }
  }],
  [['UC-64'], 'P061 has an unknown source', async (t, { source }) => {
    t.equal('UNMAPPED row', pick(source.rows['TOP/UNMAPPED'], ['people', 'isUnmapped']), { people: 1, isUnmapped: true });
  }],
  [['UC-65'], 'No source, and rows add up', async (t, { source }) => {
    t.equal('NONE row', source.rows['TOP/NONE']?.people, 5);
    t.equal('sum', Object.values(source.rows).reduce((sum, row) => sum + row.people, 0), source.distinctPeople);
    t.equal('nobody in several', [source.peopleInSeveral, source.peopleInSeveralTracks], [0, 0]);
  }],

  [['UC-66', 'UC-68'], 'New applications, by hand', async (t, { overview }) => {
    t.equal('current', overview.figures.newApplications, 6);
    t.equal('previous', overview.figures.newApplicationsPrevious, 3);
    t.equal('span', [overview.figures.newApplicationsFrom, overview.figures.newApplicationsTo], ['2026-11-12', '2026-11-18']);
  }],
  [['UC-67'], 'S07 is another form: the only submission on P058', async (t, { overviewOf }) => {
    const finance = await overviewOf({ programKey: 'FINANCE_INTERN' });

    t.equal('not counted', finance.figures.newApplications, 0);
  }],
  [['UC-69'], 'P005 submitted twice', async (t, { overviewOf, categoriesOf }) => {
    const { figures } = await overviewOf({ sourceKey: 'UNIVERSITY' });

    t.equal('S01, S02, S03 and S05 this span', figures.newApplications, 4);

    const sources = await categoriesOf('SOURCE', {});

    t.equal('University row', sources.rows['TOP/UNIVERSITY']?.newApplications, 4);
    t.equal('still eight people', sources.rows['TOP/UNIVERSITY']?.people, 8);
  }],
  [['UC-70'], 'S08 is soft deleted', async (t, { overviewOf }) => {
    const robotics = await overviewOf({ trackKey: 'ROBOTICS' });

    t.equal('P059 has only that one', robotics.figures.newApplications, 0);
  }],
  [['UC-71'], 'S09 belongs to a soft-deleted person', async (t, { overview, overviewOf }) => {
    t.equal('not with no person filter', overview.figures.newApplications, 6);
    t.equal('not with one', (await overviewOf({ trackKey: 'AI_SOFTWARE' })).figures.newApplications, 5);
  }],
  [['UC-121'], 'S14 has no linked person', async (t, { overview, source, overviewOf }) => {
    t.equal('in the headline', overview.figures.newApplications, 6);
    t.equal('in no source row', Object.values(source.rows).reduce((sum, row) => sum + row.newApplications, 0), 5);
    t.equal('out once a person filter joins', (await overviewOf({ status: 'ALL', sourceKey: 'NONE' })).figures.newApplications, 1);
  }],
  [['UC-72'], 'Imported Applications total', async (t, { overview }) => {
    t.equal('two live rows', overview.figures.importedApplications, 2);
  }],
  [['UC-73'], 'S11 is an imported person', async (t, { overviewOf }) => {
    const noSource = await overviewOf({ sourceKey: 'NONE' });

    t.equal('counted', noSource.figures.newApplications, 1);
  }],

  [['UC-74'], 'P064 is soft deleted', async (t, { overview, transitionsOf, keyOfPerson, rawOverview }) => {
    t.equal('total excludes it', overview.figures.totalContacts, 65);
    t.equal('its row stays', describeRows(transitionsOf('P064')), ['NEW>CONTACTED timeline']);
    t.ok('not listed', !rawOverview.stuck.rows.some((row) => keyOfPerson(row.personId) === 'P064'));
  }],
  [['UC-75'], 'P065 is back', async (t, { transitionsOf, stuckOf, trendsOf }) => {
    t.equal('no new transition', describeRows(transitionsOf('P065')), ['NEW>CONTACTED timeline']);
    t.equal('counted again', stuckOf('P065')?.daysOverLimit, 16);

    const { series } = await trendsOf('TOTAL_CONTACTS', null, { period: 'DAY' });

    t.equal('dip while deleted, then back', [series['2026-10-29']?.value, series['2026-11-17']?.value, series['2026-11-18']?.value], [60, 63, 64]);
  }],

  [['UC-76', 'UC-77', 'UC-78'], 'Personal data scan', async (t, { leaks }) => {
    t.equal('sentinels in analytics tables', leaks.tables, []);
    t.equal('emails and answers in page payloads', leaks.payloadEmailsAndAnswers, []);
    t.equal('names in page payloads outside stuck rows', leaks.payloadNames, []);
    t.ok('the scan can see: the CRM tables do hold the sentinels', leaks.crmHasSentinels);
  }],

  [['UC-79'], 'Stage field missing', async (t, { others }) => {
    const { meta, logs, transitionCount } = others.noStageField;

    t.equal('state', meta.state, 'NO_STAGE_FIELD');
    t.equal('field', meta.fields.stage, 'MISSING');
    t.equal('log rows', logs.map((row) => [row.job_name, row.status, row.details?.reason]), [['sync', 'skipped', 'NO_STAGE_FIELD'], ['daily', 'skipped', 'NO_STAGE_FIELD']]);
    t.equal('nothing stored', transitionCount, 0);
  }],
  [['UC-80'], 'Stage field of a wrong type', async (t, { others }) => {
    t.equal('state', others.wrongStageType.meta.state, 'NO_STAGE_FIELD');
    t.equal('fields', pick(others.wrongStageType.meta.fields, ['stage', 'positionsAppliedFor', 'applicantSource']), { stage: 'WRONG_TYPE', positionsAppliedFor: 'WRONG_TYPE', applicantSource: 'WRONG_TYPE' });
  }],
  [['UC-81'], 'TEXT stage and source', async (t, { others }) => {
    const { meta, overview, funnel } = others.textFields;

    t.equal('fields', pick(meta.fields, ['stage', 'positionsAppliedFor', 'applicantSource']), { stage: 'OK', positionsAppliedFor: 'MISSING', applicantSource: 'OK' });
    t.equal('state', meta.state, 'READY');
    t.equal('NEW read', overview.stageTotals.NEW?.count, 1);
    t.equal('free text unmapped', overview.stageTotals['UNMAPPED/NOT_A_STAGE']?.count, 1);
    t.equal('cohort', [funnel.cohortSize, funnel.cohortExcludedUnmapped], [1, 1]);
  }],
  [['UC-82'], 'Positions and source fields missing', async (t, { others }) => {
    const { meta, track, source, funnel, logs } = others.noPositionOrSourceField;

    t.equal('fields', pick(meta.fields, ['stage', 'positionsAppliedFor', 'applicantSource']), { stage: 'OK', positionsAppliedFor: 'MISSING', applicantSource: 'MISSING' });
    t.equal('funnel works', funnel.rows.NEW?.entered, 1);
    t.equal('only NONE', [track.rows['TOP/NONE']?.people, source.rows['TOP/NONE']?.people], [1, 1]);
    t.equal('consistency holds', logs.at(-1)?.details?.consistency, 'OK');
  }],
  [['UC-83', 'UC-89'], 'Form and Applications objects missing', async (t, { others }) => {
    const { meta, overview, track, newApplicationsTrend } = others.noForms;

    t.equal('fields', pick(meta.fields, ['hasFormSubmissionObject', 'hasApplicationObject']), { hasFormSubmissionObject: false, hasApplicationObject: false });
    t.equal('figures are null, not 0', pick(overview.figures, ['newApplications', 'newApplicationsPrevious', 'importedApplications']), { newApplications: null, newApplicationsPrevious: null, importedApplications: null });
    t.equal('category null', track.rows['TOP/AI_SOFTWARE']?.newApplications, null);
    t.equal('trend unavailable', newApplicationsTrend.unavailableReason, 'NO_SUBMISSION_OBJECT');
  }],
  [['UC-84'], 'Form objects half built', async (t, { others }) => {
    const { meta, overview } = others.halfBuiltForms;

    t.equal('field', meta.fields.hasFormSubmissionObject, false);
    t.equal('figure', overview.figures.newApplications, null);
    t.equal('state', meta.state, 'READY');
  }],
  [['UC-85'], 'Second workspace stays apart', async (t, { others, overview, leaks, observed }) => {
    t.equal('its total', others.second.overview.figures.totalContacts, 3);
    t.equal('main total', overview.figures.totalContacts, 65);
    t.equal('its signed person', others.second.overview.stageTotals.SIGNED?.count, 1);
    t.equal('its sentinels are nowhere in main payloads', leaks.secondInMainPayloads, []);
    t.equal('its newer row did not move the main cursor', (observed.afterStep.overlapSync.byPerson.P054 ?? []).length, 1);
  }],
  [['UC-86'], 'No people at all', async (t, { others }) => {
    const { overview, funnel, logs, meta } = others.noPeople;

    t.equal('total', overview.figures.totalContacts, 0);
    t.equal('funnel', [funnel.cohortSize, funnel.overall.rate, funnel.rows.NEW?.stepRate, funnel.lowestStepStageKey], [0, null, null, null]);
    t.equal('consistency', logs.at(-1)?.details?.consistency, 'NOT_RUN');
    t.equal('state', meta.state, 'READY');
  }],
  [['UC-87'], 'Off switch', async (t, { offSwitch }) => {
    t.equal('no log row', offSwitch.logRowsAdded, 0);
    t.equal('page', offSwitch.metaState, 'DISABLED');
    t.equal('payloads', [offSwitch.overview, offSwitch.funnel, offSwitch.reports], [null, null, null]);
    t.equal('back on', [offSwitch.metaStateAfter, offSwitch.logRowsAddedAfter], ['READY', 1]);
  }],
  [['UC-88'], 'Before any job', async (t, { observed }) => {
    t.equal('state', observed.beforeAnyJob.state, 'NEVER_SYNCED');
    t.equal('sync state', pick(observed.beforeAnyJob.sync, ['lastSuccessfulSyncAt', 'lastAttemptStatus', 'isStale']), { lastSuccessfulSyncAt: null, lastAttemptStatus: null, isStale: false });
    t.equal('reading created no storage', observed.beforeAnyJob.hasStorageAfterReads, false);
    t.equal('reads did not throw', observed.beforeAnyJob.readError, null);
  }],

  [['UC-90'], 'Status filter', async (t, { overviewOf }) => {
    for (const [status, total] of Object.entries({ ALL: 65, ACTIVE: 50, SUCCESS: 5, EXITED: 6, UNMAPPED: 3, NO_STAGE: 1 })) {
      t.equal(status, (await overviewOf({ status })).figures.totalContacts, total);
    }
  }],
  [['UC-91'], 'Track filter', async (t, { overviewOf, funnelOf }) => {
    t.equal('ROBOTICS people', (await overviewOf({ trackKey: 'ROBOTICS' })).figures.totalContacts, 1);
    t.equal('ROBOTICS cohort', (await funnelOf({ trackKey: 'ROBOTICS' })).cohortSize, 1);
  }],
  [['UC-92'], 'Program filter', async (t, { overviewOf }) => {
    t.equal('FINANCE_INTERN people', (await overviewOf({ programKey: 'FINANCE_INTERN' })).figures.totalContacts, 1);
  }],
  [['UC-93'], 'Source filter', async (t, { overviewOf }) => {
    t.equal('REFERRAL people', (await overviewOf({ sourceKey: 'REFERRAL' })).figures.totalContacts, 16);
    t.equal('NONE people', (await overviewOf({ sourceKey: 'NONE' })).figures.totalContacts, 5);
  }],
  [['UC-94'], 'Date filter on current state', async (t, { overviewOf }) => {
    const september = await overviewOf({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });

    t.equal('created in September', september.figures.totalContacts, 10);
    t.equal('imported reported apart', september.importedExcludedByDate, 6);
  }],
  [['UC-95'], 'Date filter bases', async (t, { overviewOf, funnelOf, trendsOf }) => {
    const filter = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };

    t.equal('cohort by application date', (await funnelOf(filter)).cohortSize, 10);

    const { figures } = await overviewOf(filter);

    t.equal('volume by submission', [figures.newApplications, figures.newApplicationsPrevious], [1, 1]);

    const { movement } = await trendsOf('NEW_APPLICATIONS', null, { ...filter, period: 'MONTH' });

    t.equal('movement by event date: into Contacted in September', movement.rows.CONTACTED?.enteredInPeriod, 6);
  }],

  [['UC-96'], 'Snapshot rows, by hand', async (t, { snapshotOn }) => {
    const rows = snapshotOn('2026-11-18');
    const total = (dimension, key) =>
      Object.entries(rows)
        .filter(([rowKey]) => rowKey.startsWith(`${dimension}|${key}|`))
        .reduce((sum, [, count]) => sum + count, 0);

    t.equal('no stage is empty', rows['all||'], 1);
    t.equal('track NONE', total('track', 'NONE'), 2);
    t.equal('track UNMAPPED', total('track', 'UNMAPPED'), 2);
    t.equal('position raw', total('position', 'LEGACY_POSITION'), 2);
    t.equal('source NONE', total('source', 'NONE'), 5);
    t.equal('source raw', total('source', 'LEGACY_SOURCE'), 1);
  }],
  [['UC-97'], 'The first snapshot of a date stands', async (t, { snapshotOn, logRow }) => {
    const rows = snapshotOn('2026-11-18');
    const allTotal = Object.entries(rows)
      .filter(([rowKey]) => rowKey.startsWith('all|'))
      .reduce((sum, [, count]) => sum + count, 0);

    t.equal('consistency on the first run', logRow('thirdDaily')?.details?.consistency, 'OK');
    t.equal('consistency on the rerun', logRow('rerunDaily')?.details?.consistency, 'NOT_RUN');
    t.equal('rerun status', logRow('rerunDaily')?.status, 'ok');
    t.equal('P066 did not join the stored date', allTotal, 64);
    t.ok('nor did its new key', !Object.keys(rows).some((rowKey) => rowKey.includes('PODCAST')));
  }],
  [['UC-98'], 'Snapshot date in the reporting zone', async (t, { zone }) => {
    t.equal('20:00 UTC is the next day in Asia/Karachi', zone.secondWorkspaceSnapshotDates.at(-1), '2026-11-19');
  }],

  [['UC-99'], 'Snapshot metrics, by hand', async (t, { trendsOf }) => {
    const week = (await trendsOf('TOTAL_CONTACTS', null, { period: 'WEEK' })).series;
    const month = (await trendsOf('TOTAL_CONTACTS', null, { period: 'MONTH' })).series;

    t.equal('a week with a snapshot', week['2026-10-26']?.value, 60);
    t.equal('a week without one is null, not 0', week['2026-11-09']?.value, null);
    t.equal('the last snapshot of the current week', week['2026-11-16']?.value, 64);
    t.equal('months', [month['2026-10-01']?.value, month['2026-11-01']?.value], [60, 64]);
  }],
  [['UC-100'], 'New applications by week, by hand', async (t, { trendsOf }) => {
    const { series } = await trendsOf('NEW_APPLICATIONS', null, { period: 'WEEK' });

    t.equal('current week', pick(series['2026-11-16'], ['value', 'isPartial']), { value: 2, isPartial: true });
    t.equal('week before', pick(series['2026-11-09'], ['value', 'isPartial']), { value: 6, isPartial: false });
    t.equal('an empty week is 0', series['2026-10-19']?.value, 0);
    t.equal('a bucket twelve weeks back holds S12 as previous', series['2026-11-02']?.previousValue, 1);
  }],
  [['UC-101'], 'Rate metrics', async (t, { trendsOf }) => {
    const daily = await trendsOf('OVERALL_CONVERSION', null, { period: 'DAY' });
    const { series } = await trendsOf('OVERALL_CONVERSION', null, { period: 'WEEK', dateFrom: '2026-08-10', dateTo: '2026-08-23' });

    t.equal('not offered daily', daily.unavailableReason, 'DAILY_RATE');
    t.equal('first week is mature: P009, P010 and P011 of five people', series['2026-08-10']?.value, 3 / 5);
    t.equal('second week is not: P014 is at 89 days', series['2026-08-17']?.value, null);
  }],
  [['UC-102'], 'Median days by the end of the stay', async (t, { trendsOf }) => {
    const { series } = await trendsOf('MEDIAN_DAYS', 'NEW', { period: 'MONTH' });

    t.equal('November: eight New stays ended, the middle two are P054 and P056', series['2026-11-01']?.value, (18 + 1310 / 1440 + 18 + 1320 / 1440) / 2);
    t.ok('no stay ended: null, not 0', series['2026-07-01'] === undefined || series['2026-07-01'].value === null);
  }],
  [['UC-103'], 'Cohort table', async (t, { trendsOf }) => {
    const { cohorts } = await trendsOf('NEW_APPLICATIONS', null, { period: 'MONTH' });
    const august = cohorts['2026-08-01'];
    const november = cohorts['2026-11-01'];

    t.equal('August size', august?.size, 8);
    t.equal('August New cell is mature', pick(august?.cells?.NEW, ['entered', 'eligible', 'isMature']), { entered: 8, eligible: 8, isMature: true });
    t.equal('November New cell is not', pick(november?.cells?.NEW, ['entered', 'eligible', 'isMature']), { entered: 6, eligible: 3, isMature: false });
  }],
  [['UC-104'], 'Movement this week, by hand', async (t, { trendsOf }) => {
    const { movement } = await trendsOf('NEW_APPLICATIONS', null, { period: 'WEEK' });

    t.equal('from', movement.from, '2026-11-16');
    t.equal('New', pick(movement.rows.NEW, ['enteredInPeriod', 'leftInPeriod', 'countNow']), { enteredInPeriod: 0, leftInPeriod: 5, countNow: 12 });
    t.equal('Contacted', pick(movement.rows.CONTACTED, ['enteredInPeriod', 'leftInPeriod', 'countNow']), { enteredInPeriod: 5, leftInPeriod: 2, countNow: 23 });
    t.equal('Before meeting', pick(movement.rows.BEFORE_MEETING, ['enteredInPeriod', 'leftInPeriod', 'countNow']), { enteredInPeriod: 2, leftInPeriod: 0, countNow: 9 });
  }],
  [['UC-105'], 'Two category filters', async (t, { trendsOf }) => {
    const { unavailableReason } = await trendsOf('TOTAL_CONTACTS', null, { period: 'WEEK', trackKey: 'ROBOTICS', sourceKey: 'WEBSITE' });

    t.equal('unavailable', unavailableReason, 'SNAPSHOT_FILTER_COMBINATION');
  }],
  [['UC-106'], 'Median days exclusions', async (t, { funnelOf }) => {
    const sample = await funnelOf({ sourceKey: 'UNIVERSITY' });

    t.equal('contract: New median 5 with 5 completed stays', pick(sample.rows.NEW, ['medianDays', 'completedStays']), { medianDays: 5, completedStays: 5 });

    const onlyP045 = await funnelOf({ programKey: 'PROMPT_ENGINEER_INTERN' });

    t.equal('P045 keeps its New stay', pick(onlyP045.rows.NEW, ['medianDays', 'completedStays']), { medianDays: 5, completedStays: 1 });
    t.equal('the stay ended by a reconcile row is out', pick(onlyP045.rows.CONTACTED, ['medianDays', 'completedStays']), { medianDays: null, completedStays: 0 });
    t.equal('the open stay is out', onlyP045.rows.BEFORE_MEETING?.completedStays, 0);
  }],

  [['UC-107'], 'Report periods', async (t, { observed, reportKeys }) => {
    t.equal('first run: the 8 oldest', observed.afterStep.firstDaily.reportKeys.sort(), [
      'MONTH:2026-09-01', 'WEEK:2026-08-17', 'WEEK:2026-08-24', 'WEEK:2026-08-31', 'WEEK:2026-09-07', 'WEEK:2026-09-14', 'WEEK:2026-09-21', 'WEEK:2026-09-28',
    ]);
    t.equal('second run catches up', observed.afterStep.secondDaily.reportKeys.length, 15);
    t.equal('nothing unfinished', reportKeys.filter((key) => key >= 'WEEK:2026-11-16'), []);
    t.equal('nothing before the first full period', reportKeys.filter((key) => key === 'WEEK:2026-08-10' || key === 'MONTH:2026-08-01'), []);
  }],
  [['UC-108'], 'Reports stay frozen', async (t, { observed, readReportRows }) => {
    const now = await readReportRows();

    for (const [key, row] of Object.entries(observed.afterStep.firstDaily.reportRows)) {
      t.equal(`${key} unchanged`, now[key], row);
    }
  }],
  [['UC-109', 'UC-111'], 'Week of 2026-11-09, by hand', async (t, { reportOf }) => {
    const report = await reportOf('WEEK', '2026-11-09');

    t.equal('new applications', [report.newApplications, report.newApplicationsPrevious], [6, 1]);
    t.equal('comparison', pick(report.comparisons.NEW_APPLICATIONS, ['current', 'previous', 'isSignificant']), { current: 6, previous: 1, isSignificant: false });
    t.equal('no cohort table on a weekly', report.cohorts, {});
  }],
  [['UC-110'], 'Month of 2026-10, by hand', async (t, { reportOf }) => {
    const report = await reportOf('MONTH', '2026-10-01');

    t.equal('new applications', [report.newApplications, report.newApplicationsPrevious], [0, 1]);
    t.ok('has a cohort table', Object.keys(report.cohorts).length > 0);
  }],

  [['UC-112'], 'Sync state', async (t, { meta, syncState }) => {
    t.equal('main is ready', meta.state, 'READY');
    t.equal('main is fresh', pick(meta.sync, ['isStale', 'lastAttemptStatus', 'restoredInLastReconciliation']), { isStale: false, lastAttemptStatus: 'OK', restoredInLastReconciliation: 0 });
    t.equal('main times', pick(meta.sync, ['lastSuccessfulSyncAt', 'lastAttemptAt', 'lastReconciliationAt']), { lastSuccessfulSyncAt: FIXED_NOW, lastAttemptAt: FIXED_NOW, lastReconciliationAt: FIXED_NOW });
    t.equal('over 60 minutes: stale', syncState.isStaleAfterAnHour, true);
    t.equal('a daily success does not clear it', syncState.isStaleAfterDaily, true);
    t.equal('a young running row is ignored', syncState.statusWithYoungRunningRow, 'OK');
    t.equal('an old running row reads as failed', syncState.statusWithOldRunningRow, 'FAILED');
  }],
  [['UC-122'], 'Meta lists what the filters offer', async (t, { meta, rawOverview }) => {
    const stage = (stageKey) => meta.stages.find((candidate) => candidate.stageKey === stageKey);
    const base = { asOf: FIXED_NOW, trackingStartedAt: TRACKING_START, reportingTimeZone: 'UTC', minimumSample: 30 };

    t.equal('meta base', pick(meta, Object.keys(base)), base);
    t.equal('overview base', pick(rawOverview, Object.keys(base)), base);
    t.equal('stage definitions', meta.stages.length, 12);
    t.equal('a main stage', pick(stage('NEW'), ['kind', 'rank', 'limitDays', 'windowDays', 'isSuccess']), { kind: 'MAIN', rank: 0, limitDays: 14, windowDays: 14, isSuccess: false });
    t.equal('the last ranked stage', pick(stage('SIGNED'), ['kind', 'rank', 'limitDays', 'windowDays', 'isSuccess']), { kind: 'MAIN', rank: 7, limitDays: null, windowDays: null, isSuccess: true });
    t.equal('an exit', pick(stage('NO_ANSWER'), ['kind', 'rank', 'limitDays', 'windowDays']), { kind: 'EXIT', rank: null, limitDays: null, windowDays: null });
    t.equal('tracks', meta.tracks.length, 5);
    t.equal('every program plus the unmapped option', meta.programs.length, 40);
    t.equal('the unmapped option', pick(meta.programs.find((program) => program.key === 'LEGACY_POSITION'), ['trackKey']), { trackKey: 'UNMAPPED' });
    t.equal('sources are the field options', meta.sources.map((source) => source.key).sort(), ['LINKEDIN', 'REFERRAL', 'UNIVERSITY', 'WEBSITE']);
    t.equal('fields', pick(meta.fields, ['stage', 'isStageAuditLogged', 'positionsAppliedFor', 'applicantSource', 'hasFormSubmissionObject', 'hasApplicationObject']), { stage: 'OK', isStageAuditLogged: true, positionsAppliedFor: 'OK', applicantSource: 'OK', hasFormSubmissionObject: true, hasApplicationObject: true });
  }],
  [['UC-113'], 'Log trim', async (t, { observed }) => {
    t.equal('the 91 day row went with the first daily', observed.afterStep.firstDaily.oldLogRows, ['89 days']);
    t.equal('the other went with the next', observed.afterStep.secondDaily.oldLogRows, []);
  }],
  [['UC-114'], 'First sync enqueues the daily', async (t, { observed }) => {
    t.equal('after the first sync', observed.afterStep.firstSync.queueCalls, ['CrmAnalyticsWorkspaceDailyJob']);
    t.equal('none once a daily row exists', observed.afterStep.lateRowSync.queueCallCount, observed.afterStep.firstDaily.queueCallCount);
  }],
  [['UC-115'], 'A failed job is logged and recovers', async (t, { failure }) => {
    t.equal('rethrown', failure.didThrow, true);
    t.equal('failed row', failure.status, 'failed');
    t.ok('message kept', failure.errorMessage.includes('CRM_ANALYTICS_TRACKING_START_AT'), failure.errorMessage);
    t.equal('next run recovers', failure.statusAfter, 'ok');
  }],
  [['UC-116'], 'Signed figure', async (t, { overview, signedWhenOn }) => {
    t.equal('off', overview.figures.signedPeople, null);
    t.equal('on', signedWhenOn, 5);
  }],

  [['UC-117'], 'The contract table, on its own eight people', async (t, { funnelOf }) => {
    const sample = await funnelOf({ sourceKey: 'UNIVERSITY' });

    t.equal('cohort', sample.cohortSize, 7);
    t.equal('New', pick(sample.rows.NEW, STEP_COUNTS), { entered: 7, eligible: 5, reachedNext: 2, exited: 1, timedOut: 2, inWindow: 2 });
    t.equal('Contacted', pick(sample.rows.CONTACTED, STEP_COUNTS), { entered: 4, eligible: 3, reachedNext: 1, exited: 0, timedOut: 2, inWindow: 1 });
    t.equal('rates', [sample.rows.NEW?.stepRate, sample.rows.NEW?.soFarRate, sample.rows.CONTACTED?.stepRate, sample.rows.CONTACTED?.soFarRate], [2 / 5, 4 / 7, 1 / 3, 1 / 4]);
  }],
  [['UC-119'], 'No stage limit at all: longest stays first, nobody past a limit', async (t, { noLimits }) => {
    t.equal('no limits', noLimits.hasLimits, false);
    t.equal('nobody over a limit', noLimits.stuckPeople, 0);
    t.equal('active, not inactive, clock known', noLimits.rowCount, 47);
    t.equal('longest stay first', noLimits.firstRow, { personKey: 'P039', daysInStage: 100, daysOverLimit: null });
    t.ok('never increases', noLimits.isSorted);
  }],
  [['UC-120'], 'W10-1 is 14 days and 6 hours in its stage', async (t, { others }) => {
    t.equal('partDayOverLimit stuck', others.partDayOverLimit.overview.stuck.total, 1);
  }],
  [['UC-118'], 'Loaders refuse a non-local target', async (t, { guards }) => {
    t.equal('other host', guards.otherHost, { status: 3, refused: true });
    t.equal('other host, CRM mode', guards.otherHostCrm, { status: 3, refused: true });
    t.equal('CRM mode without the flag', guards.crmWithoutFlag, { status: 3, refused: true });
    t.equal('other host in the environment', guards.otherHostInEnvironment, { status: 3, refused: true });
    t.equal('a CRM database as the seed database', guards.crmDatabaseAsSeed, { status: 3, refused: true });
  }],
];
