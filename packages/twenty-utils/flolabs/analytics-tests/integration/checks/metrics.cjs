'use strict';
// The real metrics service inside the real read-only page transaction. Every expected
// number below was counted by hand from the fixture people, not read from the output.
const { createMetricsReader } = require('../lib/metrics-adapter.cjs');

const buildLocalDate = (date) => date.toISOString().slice(0, 10);

module.exports = {
  title: 'Metrics: figures on hand-counted people',
  run: async ({ harness, loader, services, query, newWorkspace, daysAgo, minutesAgo, transitionsOf, runSyncJob, runDailyJob, requirement }) => {
    const metricsRequired = requirement('CrmAnalyticsMetricsService');
    const reader = createMetricsReader({ loader, services });

    const buildTotalsWorkspace = async () => {
      const workspace = await newWorkspace({ withApplication: true });
      const { insertPerson, insertStageChange, insertForm, insertSubmission } = workspace.fixtures;

      workspace.trackingStart = daysAgo(60);
      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', workspace.trackingStart.toISOString());

      const people = {
        stuck: await insertPerson({ firstName: 'Ada', lastName: 'Lovelace', stage: 'NEW', createdAt: daysAgo(20), positions: ['FINANCE_INTERN', 'MARKETING_INTERN'], source: 'LINKEDIN' }),
        twoTracks: await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(20), positions: ['AI_AGI_INTERN', 'FINANCE_INTERN'], source: 'REFERRAL' }),
        signedPaid: await insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(30), positions: ['ROBOTICS_ENGINEERING_INTERN'], source: 'WEBSITE' }),
        signedNonPaid: await insertPerson({ stage: 'SIGNED_NON_PAID', createdAt: daysAgo(30), positions: [] }),
        exited: await insertPerson({ stage: 'NOT_INTERESTED', createdAt: daysAgo(30), positions: ['UI_UX_DESIGN_INTERN'], source: 'LINKEDIN' }),
        interested: await insertPerson({ stage: 'INTERESTED', createdAt: daysAgo(10), positions: ['LEGACY_POSITION'] }),
        unmapped: await insertPerson({ stage: 'LEGACY_TEST', createdAt: daysAgo(10), source: 'LINKEDIN' }),
        noStage: await insertPerson({ stage: null, createdAt: daysAgo(10) }),
        softDeleted: await insertPerson({ firstName: 'Soft', lastName: 'Deleted', stage: 'NEW', createdAt: daysAgo(20), positions: ['FINANCE_INTERN'], source: 'LINKEDIN', deletedAt: daysAgo(1) }),
        imported: await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(100) }),
        importedMoved: await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(100) }),
      };

      await insertStageChange({ personId: people.twoTracks, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(5) });
      await insertStageChange({ personId: people.importedMoved, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(5) });

      const applicationForm = await insertForm({ name: 'Internship Application' });
      const otherForm = await insertForm({ name: 'Follow-up survey' });

      await insertSubmission({ formId: applicationForm, personId: people.stuck, submittedAt: daysAgo(1) });
      await insertSubmission({ formId: applicationForm, personId: people.twoTracks, submittedAt: daysAgo(2) });
      await insertSubmission({ formId: applicationForm, personId: people.signedPaid, submittedAt: daysAgo(3) });
      await insertSubmission({ formId: applicationForm, personId: people.stuck, submittedAt: daysAgo(8) });
      await insertSubmission({ formId: applicationForm, personId: people.twoTracks, submittedAt: daysAgo(9) });
      await insertSubmission({ formId: otherForm, personId: people.stuck, submittedAt: daysAgo(1) });
      await insertSubmission({ formId: applicationForm, personId: people.stuck, submittedAt: daysAgo(1), deletedAt: daysAgo(1) });

      workspace.applicationForm = applicationForm;
      await query(`INSERT INTO ${workspace.table('_application')} (name) VALUES ('old one'), ('old two')`);

      workspace.people = people;
      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      return workspace;
    };

    const totals = metricsRequired.isAvailable
      ? await harness.fixture('T0', 'eleven hand-counted people', buildTotalsWorkspace)
      : null;

    const requires = [metricsRequired];

    await harness.check({ id: 'T1', title: 'Stage totals: top rows sum to total contacts, with Unmapped and No stage', requires, needs: [totals] }, async (t) => {
      const overview = await reader.getOverview(totals.workspaceId);
      const topRows = overview.stageTotals.filter((row) => row.rowKind !== 'NESTED');
      const countOf = (rowKey) => overview.stageTotals.find((row) => row.rowKey === rowKey)?.count;

      t.equal('total contacts', overview.figures.totalContacts, 10);
      t.equal('sum of top rows', topRows.reduce((total, row) => total + row.count, 0), 10);
      t.equal('counts', {
        NEW: countOf('NEW'),
        CONTACTED: countOf('CONTACTED'),
        SIGNED: countOf('SIGNED'),
        NOT_INTERESTED: countOf('NOT_INTERESTED'),
        INTERESTED: countOf('INTERESTED'),
        UNMAPPED: countOf('UNMAPPED:LEGACY_TEST'),
        NO_STAGE: countOf('NO_STAGE'),
      }, { NEW: 1, CONTACTED: 3, SIGNED: 2, NOT_INTERESTED: 1, INTERESTED: 1, UNMAPPED: 1, NO_STAGE: 1 });
      t.equal('Signed Paid and Non paid nest under Signed', overview.stageTotals.filter((row) => row.parentStageKey === 'SIGNED').map((row) => [row.rowKey, row.count]), [
        ['SIGNED:SIGNED_PAID', 1],
        ['SIGNED:SIGNED_NON_PAID', 1],
      ]);
    });

    await harness.check({ id: 'T2', title: 'Overview figures: active, stuck, inactive, names read live', requires, needs: [totals] }, async (t) => {
      const overview = await reader.getOverview(totals.workspaceId);

      t.equal('activePeople', overview.figures.activePeople, 5);
      t.equal('stuckPeople', overview.figures.stuckPeople, 1);
      t.equal('inactivePeople', overview.figures.inactivePeople, 1);
      t.equal('signedPeople hidden', overview.figures.signedPeople, null);
      t.equal('importedApplications', overview.figures.importedApplications, 2);
      t.equal('stuck list', overview.stuck.rows.map((row) => [row.personId, row.displayName, row.stageKey, row.daysInStage, row.daysOverLimit, row.isLowerBound]), [
        [totals.people.stuck, 'Ada Lovelace', 'NEW', 20, 6, false],
      ]);
      t.equal('stuck total', overview.stuck.total, 1);
      t.equal('past limit on the totals row', overview.stageTotals.find((row) => row.rowKey === 'NEW')?.pastLimitCount, 1);
    });

    await harness.check({ id: 'T3', title: 'New applications: named form, 7 local days against the 7 before', requires, needs: [totals] }, async (t) => {
      const { figures } = await reader.getOverview(totals.workspaceId);

      t.equal('current', figures.newApplications, 3);
      t.equal('previous', figures.newApplicationsPrevious, 2);
      t.equal('from', figures.newApplicationsFrom, buildLocalDate(daysAgo(6)));
      t.equal('to', figures.newApplicationsTo, buildLocalDate(daysAgo(0)));
    });

    await harness.check({ id: 'T4', title: 'Several positions: counted once in each, distinct totals correct', requires, needs: [totals] }, async (t) => {
      const categories = await reader.getCategories(totals.workspaceId, 'TRACK_PROGRAM');
      const rowOf = (parentKey, key) => categories.rows.find((row) => row.parentKey === parentKey && row.key === key);
      const peopleOf = (parentKey, key) => rowOf(parentKey, key)?.people;

      t.equal('distinctPeople', categories.distinctPeople, 10);
      t.equal('peopleInSeveral', categories.peopleInSeveral, 2);
      t.equal('peopleInSeveralTracks', categories.peopleInSeveralTracks, 1);
      t.equal('tracks', {
        BUSINESS: peopleOf(null, 'BUSINESS'),
        AI_SOFTWARE: peopleOf(null, 'AI_SOFTWARE'),
        ROBOTICS: peopleOf(null, 'ROBOTICS'),
        DESIGN_COMMUNICATION: peopleOf(null, 'DESIGN_COMMUNICATION'),
        UNMAPPED: peopleOf(null, 'UNMAPPED'),
        NONE: peopleOf(null, 'NONE'),
      }, { BUSINESS: 2, AI_SOFTWARE: 1, ROBOTICS: 1, DESIGN_COMMUNICATION: 1, UNMAPPED: 1, NONE: 5 });
      t.equal('programs', {
        FINANCE: peopleOf('BUSINESS', 'FINANCE_INTERN'),
        MARKETING: peopleOf('BUSINESS', 'MARKETING_INTERN'),
        AI: peopleOf('AI_SOFTWARE', 'AI_AGI_INTERN'),
        LEGACY: peopleOf('UNMAPPED', 'LEGACY_POSITION'),
      }, { FINANCE: 2, MARKETING: 1, AI: 1, LEGACY: 1 });
      t.equal('active', {
        BUSINESS: rowOf(null, 'BUSINESS')?.activePeople,
        ROBOTICS: rowOf(null, 'ROBOTICS')?.activePeople,
        UNMAPPED: rowOf(null, 'UNMAPPED')?.activePeople,
        NONE: rowOf(null, 'NONE')?.activePeople,
      }, { BUSINESS: 2, ROBOTICS: 0, UNMAPPED: 1, NONE: 2 });
      t.equal('funnel cohort per row', {
        BUSINESS: rowOf(null, 'BUSINESS')?.cohortSize,
        FINANCE: rowOf('BUSINESS', 'FINANCE_INTERN')?.cohortSize,
        MARKETING: rowOf('BUSINESS', 'MARKETING_INTERN')?.cohortSize,
        AI_SOFTWARE: rowOf(null, 'AI_SOFTWARE')?.cohortSize,
        ROBOTICS: rowOf(null, 'ROBOTICS')?.cohortSize,
        DESIGN_COMMUNICATION: rowOf(null, 'DESIGN_COMMUNICATION')?.cohortSize,
        NONE: rowOf(null, 'NONE')?.cohortSize,
      }, { BUSINESS: 2, FINANCE: 2, MARKETING: 1, AI_SOFTWARE: 1, ROBOTICS: 1, DESIGN_COMMUNICATION: 0, NONE: 1 });
      t.equal('new applications per row', {
        BUSINESS: rowOf(null, 'BUSINESS')?.newApplications,
        FINANCE: rowOf('BUSINESS', 'FINANCE_INTERN')?.newApplications,
        MARKETING: rowOf('BUSINESS', 'MARKETING_INTERN')?.newApplications,
        AI_SOFTWARE: rowOf(null, 'AI_SOFTWARE')?.newApplications,
        ROBOTICS: rowOf(null, 'ROBOTICS')?.newApplications,
        NONE: rowOf(null, 'NONE')?.newApplications,
      }, { BUSINESS: 2, FINANCE: 2, MARKETING: 1, AI_SOFTWARE: 1, ROBOTICS: 1, NONE: 0 });
      t.equal('unmapped position is flagged', rowOf(null, 'UNMAPPED')?.isUnmapped, true);
    });

    await harness.check({ id: 'T5', title: 'Source rows: single valued, add up to distinct people, overlap 0', requires, needs: [totals] }, async (t) => {
      const categories = await reader.getCategories(totals.workspaceId, 'SOURCE');
      const peopleOf = (key) => categories.rows.find((row) => row.key === key)?.people;

      t.equal('distinctPeople', categories.distinctPeople, 10);
      t.equal('overlap', [categories.peopleInSeveral, categories.peopleInSeveralTracks], [0, 0]);
      t.equal('rows', {
        LINKEDIN: peopleOf('LINKEDIN'),
        REFERRAL: peopleOf('REFERRAL'),
        WEBSITE: peopleOf('WEBSITE'),
        NONE: peopleOf('NONE'),
      }, { LINKEDIN: 3, REFERRAL: 1, WEBSITE: 1, NONE: 5 });
      t.equal('rows add up', categories.rows.reduce((total, row) => total + row.people, 0), 10);
    });

    await harness.check({ id: 'T6', title: 'Funnel: imported people outside, skipped stages count, hand-counted rows', requires, needs: [totals] }, async (t) => {
      const funnel = await reader.getFunnel(totals.workspaceId);
      const pick = (stageKey) => {
        const row = funnel.rows.find((candidate) => candidate.stageKey === stageKey);

        return row && [row.entered, row.eligible, row.reachedNext, row.exited, row.timedOut, row.inWindow, row.stepRate, row.soFarRate];
      };

      t.equal('cohortSize excludes imported', funnel.cohortSize, 4);
      t.equal('cohortExcludedUnmapped', funnel.cohortExcludedUnmapped, 1);
      t.equal('NEW', pick('NEW'), [4, 4, 2, 0, 2, 0, 0.5, 3 / 4]);
      t.equal('CONTACTED', pick('CONTACTED'), [3, 2, 2, 0, 0, 1, 1, 2 / 3]);
      t.equal('SIGNED is the final row with no step', pick('SIGNED'), [2, 0, 0, 0, 0, 0, null, null]);
      t.equal('rows are the 8 ranked stages in order', funnel.rows.map((row) => row.stageKey), [
        'NEW', 'CONTACTED', 'BEFORE_MEETING', 'SATURDAY_MEETING', 'ATTENDED', 'SECOND_MEETING', 'AGREEMENT_SENT', 'SIGNED',
      ]);
      t.equal('overall', [funnel.overall.finalStageKey, funnel.overall.windowDays, funnel.overall.eligible, funnel.overall.reached, funnel.overall.rate, funnel.overall.soFarRate], ['SIGNED', 90, 0, 0, null, 0.5]);
      t.equal('no step reaches the minimum sample', funnel.lowestStepStageKey, null);
    });

    await harness.check({ id: 'T7', title: 'Soft-deleted people are out of totals, lists, categories and the cohort', requires, needs: [totals] }, async (t) => {
      const overview = await reader.getOverview(totals.workspaceId);
      const categories = await reader.getCategories(totals.workspaceId, 'SOURCE');
      const funnel = await reader.getFunnel(totals.workspaceId);

      t.ok('not in the stuck list', !overview.stuck.rows.some((row) => row.personId === totals.people.softDeleted), overview.stuck.rows);
      t.equal('not in total', overview.figures.totalContacts, 10);
      t.equal('not in LINKEDIN', categories.rows.find((row) => row.key === 'LINKEDIN')?.people, 3);
      t.equal('not in the cohort', funnel.cohortSize, 4);
    });

    await harness.check({ id: 'T8', title: 'A soft-deleted person\'s applications leave New applications too', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertForm, insertSubmission } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const form = await insertForm({ name: 'Internship Application' });
      const live = await insertPerson({ stage: 'NEW', createdAt: daysAgo(3) });
      const deleted = await insertPerson({ stage: 'NEW', createdAt: daysAgo(3), deletedAt: daysAgo(1) });

      await insertSubmission({ formId: form, personId: live, submittedAt: daysAgo(2) });
      await insertSubmission({ formId: form, personId: deleted, submittedAt: daysAgo(2) });
      await runDailyJob(workspace.workspaceId);

      const unfiltered = await reader.getOverview(workspace.workspaceId);
      const filtered = await reader.getOverview(workspace.workspaceId, { status: 'ACTIVE' });

      t.equal('filtered count', filtered.figures.newApplications, 1);
      t.equal('unfiltered count must agree', unfiltered.figures.newApplications, 1);
    });

    await harness.check({ id: 'T28', title: 'An application with no linked person still counts in the headline, and in no category row', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertForm, insertSubmission } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const form = await insertForm({ name: 'Internship Application' });
      const live = await insertPerson({ stage: 'NEW', createdAt: daysAgo(3), source: 'LINKEDIN' });

      // public-form.service.ts:229 writes personId null when no person could be upserted.
      await insertSubmission({ formId: form, personId: live, submittedAt: daysAgo(2) });
      await insertSubmission({ formId: form, personId: null, submittedAt: daysAgo(2) });
      await runDailyJob(workspace.workspaceId);

      const overview = await reader.getOverview(workspace.workspaceId);
      const categories = await reader.getCategories(workspace.workspaceId, 'SOURCE');

      t.equal('headline', overview.figures.newApplications, 2);
      t.equal('category row', categories.rows.map((row) => [row.key, row.newApplications]), [['LINKEDIN', 1]]);
    });

    await harness.check({ id: 'T9', title: 'Status filter: the six slices add up to total contacts', requires, needs: [totals] }, async (t) => {
      const count = async (status) => (await reader.getOverview(totals.workspaceId, { status })).figures.totalContacts;

      t.equal('slices', {
        ACTIVE: await count('ACTIVE'),
        SUCCESS: await count('SUCCESS'),
        EXITED: await count('EXITED'),
        UNMAPPED: await count('UNMAPPED'),
        NO_STAGE: await count('NO_STAGE'),
      }, { ACTIVE: 5, SUCCESS: 2, EXITED: 1, UNMAPPED: 1, NO_STAGE: 1 });
    });

    await harness.check({ id: 'T10', title: 'Track, program and source filters count the right people', requires, needs: [totals] }, async (t) => {
      const count = async (filter) => (await reader.getOverview(totals.workspaceId, filter)).figures.totalContacts;

      t.equal('filters', {
        track: await count({ trackKey: 'BUSINESS' }),
        trackUnmapped: await count({ trackKey: 'UNMAPPED' }),
        trackNone: await count({ trackKey: 'NONE' }),
        program: await count({ programKey: 'FINANCE_INTERN' }),
        programNone: await count({ programKey: 'NONE' }),
        source: await count({ sourceKey: 'LINKEDIN' }),
        sourceNone: await count({ sourceKey: 'NONE' }),
      }, { track: 2, trackUnmapped: 1, trackNone: 5, program: 2, programNone: 5, source: 3, sourceNone: 5 });
    });

    await harness.check({ id: 'T11', title: 'Date filter: imported people drop out and are reported', requires, needs: [totals] }, async (t) => {
      const filter = { dateFrom: buildLocalDate(daysAgo(25)), dateTo: buildLocalDate(daysAgo(0)) };
      const overview = await reader.getOverview(totals.workspaceId, filter);
      const funnel = await reader.getFunnel(totals.workspaceId, filter);

      t.equal('total in range', overview.figures.totalContacts, 5);
      t.equal('importedExcludedByDate', overview.importedExcludedByDate, 2);
      t.equal('top rows still sum', overview.stageTotals.filter((row) => row.rowKind !== 'NESTED').reduce((total, row) => total + row.count, 0), 5);
      t.equal('cohort in range', funnel.cohortSize, 2);
    });

    await harness.check({ id: 'T12', title: 'Too recent: never 0%, never dropped', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await insertPerson({ stage: 'NEW', createdAt: daysAgo(3), source: 'LINKEDIN' });
      await insertPerson({ stage: 'NEW', createdAt: daysAgo(3), source: 'LINKEDIN' });

      const mover = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(3), source: 'LINKEDIN' });

      await insertStageChange({ personId: mover, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(1) });
      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const funnel = await reader.getFunnel(workspace.workspaceId);
      const rowOf = (stageKey) => funnel.rows.find((row) => row.stageKey === stageKey);

      t.equal('nobody dropped', funnel.cohortSize, 3);
      t.equal('NEW', [rowOf('NEW')?.entered, rowOf('NEW')?.eligible, rowOf('NEW')?.inWindow], [3, 0, 3]);
      t.equal('NEW stepRate is unknown, not 0', rowOf('NEW')?.stepRate, null);
      t.equal('NEW dropOffRate is unknown, not 0', rowOf('NEW')?.dropOffRate, null);
      t.equal('NEW soFarRate', rowOf('NEW')?.soFarRate, 1 / 3);
      t.equal('NEW has no timed out', rowOf('NEW')?.timedOut, 0);
      t.equal('overall rate is unknown', funnel.overall.rate, null);
      t.equal('no lowest step', funnel.lowestStepStageKey, null);

      const categories = await reader.getCategories(workspace.workspaceId, 'SOURCE');
      const linkedin = categories.rows.find((row) => row.key === 'LINKEDIN');
      const stepNew = linkedin?.stepRates.find((step) => step.stageKey === 'NEW');

      t.equal('category step rate', [stepNew?.eligible, stepNew?.rate, stepNew?.soFarRate], [0, null, 1 / 3]);
      t.equal('category overall', [linkedin?.overallEligible, linkedin?.overallRate], [0, null]);

      const overallTrend = await reader.getTrends(workspace.workspaceId, 'OVERALL_CONVERSION', null, { period: 'WEEK' });
      const dropOffTrend = await reader.getTrends(workspace.workspaceId, 'DROP_OFF', 'NEW', { period: 'WEEK' });

      t.ok('overall trend has no number yet', overallTrend.series.every((point) => point.value === null), overallTrend.series);
      t.ok('drop-off trend has no number yet', dropOffTrend.series.every((point) => point.value === null), dropOffTrend.series);

      const cohortCell = overallTrend.cohorts.at(-1)?.cells.find((cell) => cell.stageKey === 'NEW');

      t.equal('cohort cell', [cohortCell?.entered, cohortCell?.eligible, cohortCell?.rate, cohortCell?.isMature], [3, 0, null, false]);
    });

    await harness.check({ id: 'T13', title: 'Durations: reconcile rows are excluded, reached still counts', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange, setPersonStage } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const personId = await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(30), updatedAt: daysAgo(20) });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(20) });
      await runSyncJob(workspace.workspaceId);
      await setPersonStage({ personId, stage: 'ATTENDED', updatedAt: minutesAgo(120) });
      await runDailyJob(workspace.workspaceId);

      t.equal('reconcile row exists', (await transitionsOf(workspace.workspaceId)).filter((row) => row.origin === 'reconcile').length, 1);

      const funnel = await reader.getFunnel(workspace.workspaceId);
      const rowOf = (stageKey) => funnel.rows.find((row) => row.stageKey === stageKey);

      t.equal('NEW stay counts', [rowOf('NEW')?.medianDays, rowOf('NEW')?.completedStays], [10, 1]);
      t.equal('stay ended by a reconcile row is excluded', [rowOf('CONTACTED')?.medianDays, rowOf('CONTACTED')?.completedStays], [null, 0]);
      t.equal('reconcile row counts for reached', rowOf('ATTENDED')?.entered, 1);

      await query(`UPDATE analytics.stage_transition SET happened_at = $2 WHERE workspace_id = $1 AND origin = 'reconcile'`, [workspace.workspaceId, daysAgo(15)]);

      const overview = await reader.getOverview(workspace.workspaceId);

      t.equal('clock is a lower bound', overview.stuck.rows.map((row) => [row.personId, row.stageKey, row.daysInStage, row.isLowerBound]), [[personId, 'ATTENDED', 15, true]]);
    });

    await harness.check({ id: 'T14', title: 'Durations: raw siblings stay inside one stage, exit outside the window times out', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const sibling = await insertPerson({ stage: 'NOT_INTERESTED', createdAt: daysAgo(30) });

      await insertStageChange({ personId: sibling, before: 'NEW', after: 'SIGNED_PAID', happensAt: daysAgo(25) });
      await insertStageChange({ personId: sibling, before: 'SIGNED_PAID', after: 'SIGNED_NON_PAID', happensAt: daysAgo(20) });
      await insertStageChange({ personId: sibling, before: 'SIGNED_NON_PAID', after: 'NOT_INTERESTED', happensAt: daysAgo(10) });

      const lateExit = await insertPerson({ stage: 'NOT_INTERESTED', createdAt: daysAgo(40) });

      await insertStageChange({ personId: lateExit, before: 'NEW', after: 'NOT_INTERESTED', happensAt: daysAgo(10) });
      await runSyncJob(workspace.workspaceId);
      await runDailyJob(workspace.workspaceId);

      const funnel = await reader.getFunnel(workspace.workspaceId);
      const rowOf = (stageKey) => funnel.rows.find((row) => row.stageKey === stageKey);

      t.equal('SIGNED stay spans both raw values', [rowOf('SIGNED')?.medianDays, rowOf('SIGNED')?.completedStays], [15, 1]);
      t.equal('NEW stays are 5 and 30', [rowOf('NEW')?.medianDays, rowOf('NEW')?.completedStays], [17.5, 2]);
      t.equal('late exit times out, not exited', [rowOf('NEW')?.reachedNext, rowOf('NEW')?.exited, rowOf('NEW')?.timedOut], [1, 0, 1]);
    });

    await harness.check({ id: 'T15', title: 'Form reset to INTERESTED: furthest stage kept, clock restarts, never stuck', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const personId = await insertPerson({ stage: 'INTERESTED', createdAt: daysAgo(30) });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(25) });
      await insertStageChange({ personId, before: 'CONTACTED', after: 'INTERESTED', happensAt: daysAgo(20) });
      await runSyncJob(workspace.workspaceId);

      const funnel = await reader.getFunnel(workspace.workspaceId);
      const overview = await reader.getOverview(workspace.workspaceId);
      const rowOf = (stageKey) => funnel.rows.find((row) => row.stageKey === stageKey);

      t.equal('still reached CONTACTED', rowOf('CONTACTED')?.entered, 1);
      t.equal('did not reach further', rowOf('BEFORE_MEETING')?.entered, 0);
      t.equal('counts as active', overview.figures.activePeople, 1);
      t.equal('no limit on INTERESTED, so not stuck', overview.figures.stuckPeople, 0);
      t.equal('stays', [rowOf('NEW')?.medianDays, rowOf('CONTACTED')?.medianDays], [5, 5]);
    });

    await harness.check({ id: 'T16', title: 'No-op rows change nothing: clock, movement, stays', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      const personId = await insertPerson({ stage: 'NEW', createdAt: daysAgo(20) });

      await insertStageChange({ personId, before: 'NEW', after: 'NEW', happensAt: daysAgo(5) });
      await runSyncJob(workspace.workspaceId);

      const overview = await reader.getOverview(workspace.workspaceId);
      const funnel = await reader.getFunnel(workspace.workspaceId);
      const trends = await reader.getTrends(workspace.workspaceId, 'TOTAL_CONTACTS', null, {
        dateFrom: buildLocalDate(daysAgo(10)),
        dateTo: buildLocalDate(daysAgo(0)),
      });

      t.equal('clock still from creation', overview.stuck.rows[0]?.daysInStage, 20);
      t.equal('no completed stay', funnel.rows.find((row) => row.stageKey === 'NEW')?.completedStays, 0);
      t.equal('no movement', trends.movement.rows.filter((row) => row.enteredInPeriod > 0 || row.leftInPeriod > 0), []);
    });

    await harness.check({ id: 'T17', title: 'Movement: event date, imported people included, counts from current scope', requires, needs: [totals] }, async (t) => {
      const trends = await reader.getTrends(totals.workspaceId, 'TOTAL_CONTACTS', null, {
        dateFrom: buildLocalDate(daysAgo(10)),
        dateTo: buildLocalDate(daysAgo(0)),
      });
      const rowOf = (stageKey) => trends.movement.rows.find((row) => row.stageKey === stageKey);

      t.equal('range', [trends.movement.from, trends.movement.to], [buildLocalDate(daysAgo(10)), buildLocalDate(daysAgo(0))]);
      t.equal('CONTACTED', [rowOf('CONTACTED')?.enteredInPeriod, rowOf('CONTACTED')?.leftInPeriod, rowOf('CONTACTED')?.countNow], [2, 0, 3]);
      t.equal('NEW', [rowOf('NEW')?.enteredInPeriod, rowOf('NEW')?.leftInPeriod, rowOf('NEW')?.countNow], [0, 2, 1]);
    });

    await harness.check({ id: 'T18', title: 'Trend lines from snapshots: stored counts, unknown stays null', requires, needs: [totals] }, async (t) => {
      const latest = async (metric, stageKey, filter = {}) => {
        const trends = await reader.getTrends(totals.workspaceId, metric, stageKey, { period: 'WEEK', ...filter });

        return { reason: trends.unavailableReason, value: trends.series.at(-1)?.value, earlier: trends.series.at(0)?.value };
      };

      t.equal('total', await latest('TOTAL_CONTACTS', null), { reason: null, value: 10, earlier: null });
      t.equal('active', await latest('ACTIVE_PEOPLE', null), { reason: null, value: 5, earlier: null });
      t.equal('stage count', await latest('STAGE_COUNT', 'CONTACTED'), { reason: null, value: 3, earlier: null });
      t.equal('stage count over raw siblings', await latest('STAGE_COUNT', 'SIGNED'), { reason: null, value: 2, earlier: null });
      t.equal('track', await latest('TOTAL_CONTACTS', null, { trackKey: 'BUSINESS' }), { reason: null, value: 2, earlier: null });
      t.equal('source none', await latest('TOTAL_CONTACTS', null, { sourceKey: 'NONE' }), { reason: null, value: 5, earlier: null });
      t.equal('status', await latest('TOTAL_CONTACTS', null, { status: 'UNMAPPED' }), { reason: null, value: 1, earlier: null });
      t.equal('program inside its track reads the position rows', await latest('TOTAL_CONTACTS', null, { trackKey: 'BUSINESS', programKey: 'FINANCE_INTERN' }), { reason: null, value: 2, earlier: null });
      t.equal('no position', await latest('TOTAL_CONTACTS', null, { programKey: 'NONE' }), { reason: null, value: 5, earlier: null });

      const combined = await reader.getTrends(totals.workspaceId, 'TOTAL_CONTACTS', null, { trackKey: 'BUSINESS', sourceKey: 'LINKEDIN' });

      t.equal('two dimensions are refused', [combined.unavailableReason, combined.series], ['SNAPSHOT_FILTER_COMBINATION', []]);
    });

    await harness.check({ id: 'T19', title: 'Trend buckets read the last snapshot of each bucket, and previous is one window back', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const today = daysAgo(0);
      const weekday = (today.getUTCDay() + 6) % 7;
      const mondayAge = (weeks) => weekday + weeks * 7;
      const insertAll = (age, stage, count) =>
        query(
          `INSERT INTO analytics.daily_snapshot (workspace_id, snapshot_date, dimension, dimension_key, stage, person_count)
           VALUES ($1, $2::date, 'all', '', $3, $4)`,
          [workspace.workspaceId, buildLocalDate(daysAgo(age)), stage, count],
        );

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(120).toISOString());
      // Monday and Friday of one past week: Friday's stored count must win.
      await insertAll(mondayAge(2), 'NEW', 7);
      await insertAll(mondayAge(2) - 4, 'NEW', 9);
      await insertAll(mondayAge(2) - 4, 'CONTACTED', 1);

      const series = (await reader.getTrends(workspace.workspaceId, 'TOTAL_CONTACTS', null, { period: 'WEEK' })).series;
      const bucket = series.find((point) => point.bucketStart === buildLocalDate(daysAgo(mondayAge(2))));

      t.equal('last snapshot of the bucket', bucket?.value, 10);
      t.equal('bucket with no snapshot is null', series.find((point) => point.bucketStart === buildLocalDate(daysAgo(mondayAge(1))))?.value, null);
      t.equal('12 weekly buckets', series.length, 12);
      t.equal('current bucket is partial', series.at(-1)?.isPartial, true);
    });

    await harness.check({ id: 'T20', title: 'Median trend buckets by stay end date', requires, needs: [totals] }, async (t) => {
      const trends = await reader.getTrends(totals.workspaceId, 'MEDIAN_DAYS', 'NEW', { period: 'DAY' });
      const point = trends.series.find((candidate) => candidate.bucketStart === buildLocalDate(daysAgo(5)));

      t.equal('stay ended 5 days ago', [point?.value, point?.size], [15, 1]);
    });

    await harness.check({ id: 'T21', title: 'Unavailable trends say why', requires, needs: [totals] }, async (t) => {
      const noForms = await newWorkspace({ forms: 'NONE' });

      noForms.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await runDailyJob(noForms.workspaceId);

      const daily = await reader.getTrends(totals.workspaceId, 'OVERALL_CONVERSION', null, { period: 'DAY' });
      const noSubmissions = await reader.getTrends(noForms.workspaceId, 'NEW_APPLICATIONS', null, { period: 'WEEK' });
      const overview = await reader.getOverview(noForms.workspaceId);

      t.equal('daily rate', [daily.unavailableReason, daily.series], ['DAILY_RATE', []]);
      t.equal('no submissions object', [noSubmissions.unavailableReason, noSubmissions.series], ['NO_SUBMISSION_OBJECT', []]);
      t.equal('new applications null, not 0', [overview.figures.newApplications, overview.figures.newApplicationsPrevious, overview.figures.importedApplications], [null, null, null]);
    });

    await harness.check({ id: 'T22', title: 'Every query in every filter branch is valid SQL in the read-only transaction', requires, needs: [totals] }, async (t) => {
      const dateRange = { dateFrom: buildLocalDate(daysAgo(25)), dateTo: buildLocalDate(daysAgo(0)) };
      const filters = [
        {},
        dateRange,
        { dateFrom: dateRange.dateFrom },
        { dateTo: dateRange.dateTo },
        ...['ACTIVE', 'SUCCESS', 'EXITED', 'UNMAPPED', 'NO_STAGE'].map((status) => ({ status })),
        { trackKey: 'BUSINESS' },
        { trackKey: 'NONE' },
        { trackKey: 'UNMAPPED' },
        { programKey: 'FINANCE_INTERN' },
        { programKey: 'NONE' },
        { sourceKey: 'LINKEDIN' },
        { sourceKey: 'NONE' },
        { sourceKey: "O'Reilly; DROP TABLE person" },
        { trackKey: 'BUSINESS', programKey: 'FINANCE_INTERN' },
        { trackKey: 'BUSINESS', programKey: 'FINANCE_INTERN', sourceKey: 'LINKEDIN', status: 'ACTIVE', ...dateRange },
      ];
      const fullFilter = filters.at(-1);
      const metrics = ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT', 'OVERALL_CONVERSION', 'DROP_OFF', 'MEDIAN_DAYS'];
      const periods = ['DAY', 'WEEK', 'MONTH'];
      let calls = 0;

      const attempt = async (name, filter, work) => {
        calls += 1;

        try {
          const result = await work();

          t.ok(`${name} ${JSON.stringify(filter)} returned a payload`, result !== null, result);
        } catch (error) {
          t.fail(`${name} ${JSON.stringify(filter)}: ${error.message}\nposition ${error.position}`);
        }
      };

      // Each filter branch builds the shared scope SQL once; snapshot trends have their own.
      for (const filter of filters) {
        await attempt('overview', filter, () => reader.getOverview(totals.workspaceId, filter));
        await attempt('funnel', filter, () => reader.getFunnel(totals.workspaceId, filter));
        await attempt('categories TRACK_PROGRAM', filter, () => reader.getCategories(totals.workspaceId, 'TRACK_PROGRAM', filter));
        await attempt('categories SOURCE', filter, () => reader.getCategories(totals.workspaceId, 'SOURCE', filter));
        await attempt('trends TOTAL_CONTACTS', filter, () => reader.getTrends(totals.workspaceId, 'TOTAL_CONTACTS', null, filter));
      }

      // Each metric's own SQL, in every period, with no filter and with every filter at once.
      for (const filter of [{}, fullFilter]) {
        for (const metric of metrics) {
          for (const period of periods) {
            await attempt(`trends ${metric} ${period}`, filter, () => reader.getTrends(totals.workspaceId, metric, null, { ...filter, period }));
          }
        }
      }

      t.equal('ran the whole matrix', calls, filters.length * 5 + 2 * metrics.length * periods.length);
    });

    await harness.check({ id: 'T23', title: 'Missing positions, source and form fields: every view still runs', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace({ personFields: 'TEXT', forms: 'NONE' });

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());
      await query(`INSERT INTO ${workspace.table('person')} (stage, "createdAt") VALUES ('NEW', $1), ('', $1), (NULL, $1)`, [daysAgo(20)]);
      await runDailyJob(workspace.workspaceId);

      const overview = await reader.getOverview(workspace.workspaceId);
      const categories = await reader.getCategories(workspace.workspaceId, 'TRACK_PROGRAM');
      const funnel = await reader.getFunnel(workspace.workspaceId);

      t.equal('total', overview.figures.totalContacts, 3);
      t.equal('empty string and null are one No stage row', overview.stageTotals.find((row) => row.rowKey === 'NO_STAGE')?.count, 2);
      t.equal('top rows sum', overview.stageTotals.filter((row) => row.rowKind !== 'NESTED').reduce((total, row) => total + row.count, 0), 3);
      t.equal('everyone under NONE', categories.rows.map((row) => [row.key, row.people]), [['NONE', 3]]);
      t.equal('cohort is the one with a stage', funnel.cohortSize, 1);
    });

    await harness.check({ id: 'T24', title: 'Off switch: metrics return null', requires, needs: [totals] }, async (t) => {
      totals.vars.set('CRM_ANALYTICS_DISABLED', true);

      const overview = await reader.getOverview(totals.workspaceId);

      totals.vars.delete('CRM_ANALYTICS_DISABLED');
      t.equal('overview', overview, null);
    });

    await harness.check({ id: 'T26', title: 'Overall conversion: 90-day window, numerator within it, too recent held back', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(200).toISOString());

      const signedInside = await insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(100) });
      const signedLate = await insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(100) });
      const recentSigned = await insertPerson({ stage: 'SIGNED_PAID', createdAt: daysAgo(10) });

      await insertPerson({ stage: 'NEW', createdAt: daysAgo(100) });
      await insertStageChange({ personId: signedInside, before: 'NEW', after: 'SIGNED_PAID', happensAt: daysAgo(50) });
      await insertStageChange({ personId: signedLate, before: 'NEW', after: 'SIGNED_PAID', happensAt: daysAgo(5) });
      await insertStageChange({ personId: recentSigned, before: 'NEW', after: 'SIGNED_PAID', happensAt: daysAgo(5) });
      await runSyncJob(workspace.workspaceId);

      const { overall } = await reader.getFunnel(workspace.workspaceId);

      t.equal('overall', [overall.eligible, overall.reached, overall.rate, overall.soFarRate], [3, 1, 1 / 3, 3 / 4]);
    });

    await harness.check({ id: 'T27', title: 'Lowest step: needs the minimum sample, first step only when no other qualifies', requires, needs: [] }, async (t) => {
      const workspace = await newWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', daysAgo(60).toISOString());

      // Five past NEW, two moving on in time; of those two past CONTACTED, one moves on.
      for (const age of [40, 40, 40]) {
        await insertPerson({ stage: 'NEW', createdAt: daysAgo(age) });
      }

      const twoMovers = [
        await insertPerson({ stage: 'CONTACTED', createdAt: daysAgo(40) }),
        await insertPerson({ stage: 'BEFORE_MEETING', createdAt: daysAgo(40) }),
      ];

      await insertStageChange({ personId: twoMovers[0], before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(35) });
      await insertStageChange({ personId: twoMovers[1], before: 'NEW', after: 'CONTACTED', happensAt: daysAgo(35) });
      await insertStageChange({ personId: twoMovers[1], before: 'CONTACTED', after: 'BEFORE_MEETING', happensAt: daysAgo(30) });
      await runSyncJob(workspace.workspaceId);

      const { CRM_ANALYTICS_CONFIG: config } = loader.real('src/modules/analytics/constants/crm-analytics-config.constant');
      const realMinimum = config.minimumSample;
      const lowestWith = async (minimumSample) => {
        config.minimumSample = minimumSample;

        return (await reader.getFunnel(workspace.workspaceId)).lowestStepStageKey;
      };

      try {
        t.equal('minimum 2: NEW and CONTACTED qualify, first step is left out', await lowestWith(2), 'CONTACTED');
        t.equal('minimum 5: only NEW qualifies, so it is named', await lowestWith(5), 'NEW');
        t.equal('minimum 6: nothing qualifies', await lowestWith(6), null);
      } finally {
        config.minimumSample = realMinimum;
      }
    });

    await harness.check({ id: 'T25', title: 'Only the page path runs metrics: nothing is written', requires, needs: [totals] }, async (t) => {
      const before = await query(`SELECT count(*)::int AS rows FROM analytics.stage_transition WHERE workspace_id = $1`, [totals.workspaceId]);

      services.statements.length = 0;
      await reader.getFunnel(totals.workspaceId);
      await reader.getOverview(totals.workspaceId);

      const after = await query(`SELECT count(*)::int AS rows FROM analytics.stage_transition WHERE workspace_id = $1`, [totals.workspaceId]);

      t.equal('no rows added', after, before);
      t.ok('all statements went through the page transaction', services.statements.every((statement) => statement.origin === 'page'), services.statements.map((statement) => statement.origin));
    });
  },
};
