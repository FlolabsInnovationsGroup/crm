'use strict';
// Definition-use edges from CRM columns through the facade and the jobs into the
// analytics tables. Each test defines a value at the source and reads it at the use.
const { toIso } = require('../lib/sinks.cjs');
const { BASELINE_PEOPLE, TRACKING_START_AGE, seedBaseline } = require('../lib/seed.cjs');

const byPerson = (rows, workspace, column = 'person_id') =>
  Object.fromEntries(rows.map((row) => [workspace.keyOf.get(row[column]) ?? row[column], row]));

module.exports = {
  title: 'CRM columns to facade relations to analytics tables',
  run: async ({ context, createScope }) => {
    const { edge, fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsFacadeService'),
        context.requirement('CrmAnalyticsSyncService'),
        context.requirement('CrmAnalyticsSnapshotService'),
        context.requirement('CrmAnalyticsWorkspaceSyncJob'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
      ],
    });

    const baseline = await fixture('baseline workspace, synced and with a daily run', async () => {
      const { services, query } = context;
      const workspace = await seedBaseline(context);
      const facade = services.get('CrmAnalyticsFacadeService');
      const database = services.get('CrmAnalyticsDatabaseService');
      const state = await facade.getCrmState(workspace.workspaceId);
      const trackingStart = workspace.trackingStart.toISOString();
      const jobRun = (sql, parameters = []) => database.runJob((run) => run(sql, parameters));

      const relations = {
        person: byPerson(await jobRun(facade.buildPersonRelationSql(state)), workspace),
        stageChange: await jobRun(
          facade.buildStageChangeRelationSql({ state, updatedSinceParameter: '$1', happenedSinceParameter: '$2' }),
          [trackingStart, trackingStart],
        ),
        submission: await jobRun(facade.buildApplicationSubmissionRelationSql(state)),
      };

      await context.runSync(workspace);

      const queuedDaily = services.queueCalls.filter(({ data }) => data.workspaceId === workspace.workspaceId);

      await context.runDaily(workspace);

      const rowsOf = (table) => query(`SELECT * FROM analytics.${table} WHERE workspace_id = $1`, [workspace.workspaceId]);

      return {
        facade,
        database,
        jobRun,
        queuedDaily,
        relations,
        state,
        transitions: byPerson(await rowsOf('stage_transition'), workspace),
        snapshots: await rowsOf('daily_snapshot'),
        logs: await rowsOf('sync_log'),
        workspace,
      };
    });

    const needs = [baseline];
    const person = (key) => baseline.relations.person[key];
    const stageChangeOf = (key) =>
      baseline.relations.stageChange.find((row) => row.person_id === baseline.workspace.people[key]);

    await edge('crm.person.id', 'facade.personRelation.person_id', (t) => {
      t.equal('ada', person('ada').person_id, baseline.workspace.people.ada);
    }, { needs });

    await edge('crm.person.stage', 'facade.personRelation.raw_stage', (t) => {
      t.equal('enum read as text', person('ben').raw_stage, 'CONTACTED');
      t.equal('value outside the config stays raw', person('fay').raw_stage, 'LEGACY_TEST');
      t.equal('no stage stays NULL', person('gus').raw_stage, null);
    }, { needs });

    await edge('crm.person.positionsAppliedFor', 'facade.personRelation.positions', (t) => {
      t.equal('both values, in order', person('cat').positions, ['FINANCE_INTERN', 'AI_AGI_INTERN']);
      t.equal('NULL becomes empty', person('gus').positions, []);
    }, { needs });

    await edge('crm.person.applicantSource', 'facade.personRelation.source', (t) => {
      t.equal('enum read as text', person('ben').source, 'REFERRAL');
      t.equal('no source stays NULL', person('dan').source, null);
    }, { needs });

    await edge('crm.person.createdAt', 'facade.personRelation.created_at', (t) => {
      t.equal('same instant', toIso(person('eve').created_at), toIso(context.daysAgo(BASELINE_PEOPLE.eve.createdAge)));
    }, { needs });

    await edge('crm.person.updatedAt', 'facade.personRelation.updated_at', async (t) => {
      const updatedAt = context.minutesAgo(45);
      const workspace = await seedBaseline(context);
      const state = await baseline.facade.getCrmState(workspace.workspaceId);

      await workspace.fixtures.setPersonStage({ personId: workspace.people.ada, stage: 'NEW', updatedAt });

      const rows = byPerson(await baseline.jobRun(baseline.facade.buildPersonRelationSql(state)), workspace);

      t.equal('same instant', toIso(rows.ada.updated_at), toIso(updatedAt));
      t.ok('differs from createdAt', toIso(rows.ada.updated_at) !== toIso(rows.ada.created_at));
    }, { needs });

    await edge('crm.person.deletedAt', 'facade.personRelation', async (t) => {
      const [{ total }] = await context.query(`SELECT count(*)::int AS total FROM ${baseline.workspace.table('person')}`);

      t.equal('the row is still in the CRM table', total, Object.keys(BASELINE_PEOPLE).length);
      t.equal('but not in the relation', person('zed'), undefined);
      t.equal('the rest are', Object.keys(baseline.relations.person).sort(), ['ada', 'ben', 'cat', 'dan', 'eve', 'fay', 'gus']);
    }, { needs });

    await edge('crm.person.name', 'facade.displayNames', async (t) => {
      const { ada, cat, zed } = baseline.workspace.people;
      const names = await baseline.database.runJob((run) =>
        baseline.facade.getPersonDisplayNames({ state: baseline.state, personIds: [ada, cat, zed], run }),
      );

      t.equal('ada', names.get(ada), 'Ada Stone');
      t.equal('cat', names.get(cat), 'Cat Ng');
      t.equal('a soft-deleted name is not read', names.has(zed), false);
    }, { needs });

    await edge('crm.timelineActivity.id', 'facade.stageChangeRelation.id', async (t) => {
      const [{ id }] = await context.query(
        `SELECT id FROM ${baseline.workspace.table('timelineActivity')} WHERE "targetPersonId" = $1 AND "happensAt" = $2`,
        [baseline.workspace.people.ben, context.daysAgo(25)],
      );

      t.equal('ben', stageChangeOf('ben').id, id);
    }, { needs });

    await edge('crm.timelineActivity.targetPersonId', 'facade.stageChangeRelation.person_id', (t) => {
      t.ok('ben', stageChangeOf('ben') !== undefined);

      const { noPerson } = baseline.workspace.ignoredRows;

      t.equal('NULL target left out', baseline.relations.stageChange.some(({ id }) => id === noPerson), false);
    }, { needs });

    await edge('crm.timelineActivity.linkedRecordId', 'facade.stageChangeRelation', (t) => {
      const { linked } = baseline.workspace.ignoredRows;

      t.equal('linked row left out', baseline.relations.stageChange.some(({ id }) => id === linked), false);
    }, { needs });

    await edge('crm.timelineActivity.properties.diff.stage', 'facade.stageChangeRelation.from_stage', (t) => {
      t.equal('before', stageChangeOf('ben').from_stage, 'NEW');
    }, { needs });

    await edge('crm.timelineActivity.properties.diff.stage', 'facade.stageChangeRelation.to_stage', (t) => {
      t.equal('after', stageChangeOf('dan').to_stage, 'NOT_INTERESTED');
    }, { needs });

    await edge('crm.timelineActivity.properties.diff.stage', 'facade.stageChangeRelation', (t) => {
      const { noStageDiff } = baseline.workspace.ignoredRows;

      t.equal('row without a stage diff left out', baseline.relations.stageChange.some(({ id }) => id === noStageDiff), false);
      t.equal('only real stage changes', baseline.relations.stageChange.length, 3);
    }, { needs });

    await edge('crm.timelineActivity.happensAt', 'facade.stageChangeRelation.happened_at', (t) => {
      t.equal('zed', toIso(stageChangeOf('zed').happened_at), toIso(context.daysAgo(28)));
    }, { needs });

    await edge('crm.timelineActivity.updatedAt', 'facade.stageChangeRelation.source_updated_at', (t) => {
      t.equal('zed, a day after the event', toIso(stageChangeOf('zed').source_updated_at), toIso(context.daysAgo(27)));
    }, { needs });

    await edge('crm.formSubmission.personId', 'facade.submissionRelation.person_id', (t) => {
      const { ada, ben } = baseline.workspace.people;

      t.equal('people', baseline.relations.submission.map(({ person_id: id }) => id).sort(), [ada, ben].sort());
    }, { needs });

    await edge('crm.formSubmission.submittedAt', 'facade.submissionRelation.submitted_at', (t) => {
      const row = baseline.relations.submission.find(({ id }) => id === baseline.workspace.submissions.adaRecent);

      t.equal('same instant', toIso(row.submitted_at), toIso(context.daysAgo(2)));
    }, { needs });

    await edge('crm.formSubmission.deletedAt', 'facade.submissionRelation', (t) => {
      const { benDeleted } = baseline.workspace.submissions;

      t.equal('left out', baseline.relations.submission.some(({ id }) => id === benDeleted), false);
    }, { needs });

    await edge('crm.person.deletedAt', 'facade.submissionRelation', async (t) => {
      const workspace = await context.createWorkspace();
      const { insertForm, insertPerson, insertSubmission } = workspace.fixtures;
      const formId = await insertForm({ name: 'Internship Application' });
      const gonePersonId = await insertPerson({ stage: 'NEW', createdAt: context.daysAgo(9), deletedAt: context.daysAgo(1) });
      const livePersonId = await insertPerson({ stage: 'NEW', createdAt: context.daysAgo(9) });
      const ofGonePerson = await insertSubmission({ formId, personId: gonePersonId, submittedAt: context.daysAgo(3) });
      const ofLivePerson = await insertSubmission({ formId, personId: livePersonId, submittedAt: context.daysAgo(3) });
      const ofNobody = await insertSubmission({ formId, personId: null, submittedAt: context.daysAgo(3) });
      const state = await baseline.facade.getCrmState(workspace.workspaceId);
      const rows = await baseline.jobRun(baseline.facade.buildApplicationSubmissionRelationSql(state));
      const ids = rows.map(({ id }) => id);

      t.equal('the soft-deleted person takes the application out', ids.includes(ofGonePerson), false);
      t.equal('a live person keeps it', ids.includes(ofLivePerson), true);
      t.equal('one with no person still counts', ids.includes(ofNobody), true);
    }, { needs });

    await edge('crm.crmForm.name', 'facade.submissionRelation', (t) => {
      const { catOtherForm } = baseline.workspace.submissions;

      t.equal('other form left out', baseline.relations.submission.some(({ id }) => id === catOtherForm), false);
    }, { needs });

    await edge('config.applicationFormNames', 'facade.submissionRelation', async (t) => {
      await context.withAlteredConfig(
        (config) => {
          config.applicationFormNames = ['Skills survey'];
        },
        async ({ services }) => {
          const rows = await baseline.jobRun(
            services.get('CrmAnalyticsFacadeService').buildApplicationSubmissionRelationSql(baseline.state),
          );

          t.equal('the configured form is read instead', rows.map(({ id }) => id), [baseline.workspace.submissions.catOtherForm]);
        },
      );
    }, { needs });

    await edge('crm.application.rows', 'facade.importedApplications', async (t) => {
      const total = await baseline.database.runJob((run) =>
        baseline.facade.countImportedApplications({ state: baseline.state, run }),
      );

      t.equal('three rows, one soft deleted', total, 2);
    }, { needs });

    const altered = await fixture('workspaces with absent and wrong fields', async () => {
      const none = await context.createWorkspace({ personFields: 'NONE', forms: 'NONE' });
      const wrong = await context.createWorkspace({ personFields: 'WRONG_TYPE', forms: 'HALF_BUILT' });

      return {
        none: await baseline.facade.getCrmState(none.workspaceId),
        wrong: await baseline.facade.getCrmState(wrong.workspaceId),
      };
    });

    await edge('crm.metadata.person.stage', 'facade.crmState.stage', (t) => {
      const { stage } = baseline.state;

      t.equal('status', stage.status, 'OK');
      t.equal('audit flag', stage.isAuditLogged, true);
      t.ok('options carry value and label', stage.options.some(({ value, label }) => value === 'NEW' && label === 'NEW'));
      t.equal('absent', altered.none.stage.status, 'MISSING');
      t.equal('wrong type', altered.wrong.stage.status, 'WRONG_TYPE');
    }, { needs: [baseline, altered] });

    await edge('crm.metadata.person.positionsAppliedFor', 'facade.crmState.positionsAppliedFor', (t) => {
      t.equal('status', baseline.state.positionsAppliedFor.status, 'OK');
      t.equal('absent', altered.none.positionsAppliedFor.status, 'MISSING');
      t.equal('wrong type', altered.wrong.positionsAppliedFor.status, 'WRONG_TYPE');
    }, { needs: [baseline, altered] });

    await edge('crm.metadata.person.applicantSource', 'facade.crmState.applicantSource', (t) => {
      t.equal('status', baseline.state.applicantSource.status, 'OK');
      t.equal('absent', altered.none.applicantSource.status, 'MISSING');
      t.equal('wrong type', altered.wrong.applicantSource.status, 'WRONG_TYPE');
    }, { needs: [baseline, altered] });

    await edge('crm.metadata.objects', 'facade.crmState.objects', (t) => {
      t.equal('forms present', baseline.state.hasFormSubmissionObject, true);
      t.equal('application present', baseline.state.hasApplicationObject, true);
      t.equal('forms absent', altered.none.hasFormSubmissionObject, false);
      t.equal('half-built forms count as absent', altered.wrong.hasFormSubmissionObject, false);
      t.equal('application absent', altered.none.hasApplicationObject, false);
    }, { needs: [baseline, altered] });

    const settings = () => context.services.get('CrmAnalyticsSettingsService');

    await edge('core.keyValuePair.CRM_ANALYTICS_TRACKING_START_AT', 'settings.trackingStart', async (t) => {
      t.equal(
        'override reads back as the same instant',
        await settings().getTrackingStart(baseline.workspace.workspaceId),
        context.daysAgo(TRACKING_START_AGE).toISOString(),
      );
    }, { needs });

    await edge('config.trackingStartAt', 'settings.trackingStart', async (t) => {
      const workspace = await context.createWorkspace();
      const { CRM_ANALYTICS_CONFIG } = context.loader.real('src/modules/analytics/constants/crm-analytics-config.constant');

      t.equal('default', await settings().getTrackingStart(workspace.workspaceId), CRM_ANALYTICS_CONFIG.trackingStartAt);
    }, { needs });

    await edge('core.keyValuePair.CRM_ANALYTICS_DISABLED', 'settings.isDisabled', async (t) => {
      const workspace = await context.createWorkspace();

      t.equal('off by default', await settings().isDisabled(workspace.workspaceId), false);
      workspace.vars.set('CRM_ANALYTICS_DISABLED', true);
      t.equal('switched', await settings().isDisabled(workspace.workspaceId), true);
    }, { needs });

    // ---- stage_transition
    const transition = (key) => baseline.transitions[key];

    await edge('facade.stageChangeRelation.id', 'analytics.stage_transition.source_id', (t) => {
      t.equal('ben', transition('ben').source_id, stageChangeOf('ben').id);
    }, { needs });

    await edge('facade.stageChangeRelation.person_id', 'analytics.stage_transition.person_id', (t) => {
      t.equal('ben', transition('ben').person_id, baseline.workspace.people.ben);
      t.equal('a soft-deleted person keeps its row', transition('zed').person_id, baseline.workspace.people.zed);
    }, { needs });

    await edge('facade.stageChangeRelation.from_stage', 'analytics.stage_transition.from_stage', (t) => {
      t.equal('raw', transition('dan').from_stage, 'NEW');
    }, { needs });

    await edge('facade.stageChangeRelation.to_stage', 'analytics.stage_transition.to_stage', (t) => {
      t.equal('raw', transition('dan').to_stage, 'NOT_INTERESTED');
    }, { needs });

    await edge('facade.stageChangeRelation.happened_at', 'analytics.stage_transition.happened_at', (t) => {
      t.equal('same instant', toIso(transition('zed').happened_at), toIso(context.daysAgo(28)));
    }, { needs });

    await edge('facade.stageChangeRelation.source_updated_at', 'analytics.stage_transition.source_updated_at', (t) => {
      t.equal('same instant', toIso(transition('zed').source_updated_at), toIso(context.daysAgo(27)));
    }, { needs });

    const merged = await fixture('a timeline row merged in place between two syncs', async () => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange, mergeStageChange } = workspace.fixtures;

      workspace.setTrackingStart(context.daysAgo(40));

      const personId = await insertPerson({ stage: 'BEFORE_MEETING', createdAt: context.daysAgo(5) });
      const rowId = await insertStageChange({
        personId,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: context.minutesAgo(200),
      });

      await context.runSync(workspace);
      await mergeStageChange({ rowId, after: 'BEFORE_MEETING', updatedAt: context.minutesAgo(190) });
      await context.runSync(workspace);

      const rows = await context.query(
        `SELECT * FROM analytics.stage_transition WHERE workspace_id = $1 ORDER BY happened_at`,
        [workspace.workspaceId],
      );

      return { rowId, rows, workspace };
    });

    await edge('facade.stageChangeRelation.source_updated_at', 'analytics.stage_transition.happened_at', (t) => {
      t.equal('two rows', merged.rows.length, 2);
      t.equal('the merge time dates the appended row', toIso(merged.rows[1].happened_at), toIso(context.minutesAgo(190)));
      t.equal('the first row is untouched', toIso(merged.rows[0].happened_at), toIso(context.minutesAgo(200)));
      t.equal('both versions name the same source row', merged.rows.map(({ source_id: id }) => id), [merged.rowId, merged.rowId]);
    }, { needs: [merged] });

    await edge('sync.latest.to_stage', 'analytics.stage_transition.from_stage', (t) => {
      t.equal('from the last stored stage, not the first before', merged.rows[1].from_stage, 'CONTACTED');
      t.equal('to the new after', merged.rows[1].to_stage, 'BEFORE_MEETING');
    }, { needs: [merged] });

    await edge('analytics.stage_transition.to_stage', 'sync.latest.to_stage', async (t) => {
      await context.runSync(merged.workspace);

      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.stage_transition WHERE workspace_id = $1`,
        [merged.workspace.workspaceId],
      );

      t.equal('latest equals the after, so a third sync adds nothing', total, 2);
    }, { needs: [merged] });

    await edge('sync.readTimeline', 'analytics.stage_transition.origin', (t) => {
      t.equal('timeline', transition('ben').origin, 'timeline');
    }, { needs });

    await edge('job.context.workspaceId', 'analytics.stage_transition.workspace_id', async (t) => {
      const rows = await context.query(
        `SELECT DISTINCT workspace_id FROM analytics.stage_transition WHERE person_id = $1`,
        [baseline.workspace.people.ben],
      );

      t.equal('stored under its workspace', rows.map(({ workspace_id: id }) => id), [baseline.workspace.workspaceId]);
    }, { needs });

    // ---- cursor
    const cursor = await fixture('a workspace with a stored timeline row', async () => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange } = workspace.fixtures;

      workspace.setTrackingStart(context.daysAgo(40));

      const personId = await insertPerson({ stage: 'CONTACTED', createdAt: context.daysAgo(5) });

      await insertStageChange({ personId, before: 'NEW', after: 'CONTACTED', happensAt: context.minutesAgo(600) });
      await context.runSync(workspace);

      return { personId, workspace };
    });

    const computeCursor = (workspace) =>
      baseline.database.runJob((run) =>
        context.services.get('CrmAnalyticsSyncService').computeSyncUpdatedSince({
          workspaceId: workspace.workspaceId,
          trackingStart: workspace.trackingStart.toISOString(),
          run,
        }),
      );

    await edge('analytics.stage_transition.source_updated_at', 'sync.cursor', async (t) => {
      t.equal('latest source_updated_at minus 30 minutes', await computeCursor(cursor.workspace), toIso(context.minutesAgo(630)));
    }, { needs: [baseline, cursor] });

    await edge('analytics.stage_transition.origin', 'sync.cursor', async (t) => {
      await context.query(
        `INSERT INTO analytics.stage_transition (workspace_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin)
         VALUES ($1, $2, 'CONTACTED', 'ATTENDED', now(), now(), 'reconcile')`,
        [cursor.workspace.workspaceId, cursor.personId],
      );

      t.equal('a reconcile row carries now() and must not move it', await computeCursor(cursor.workspace), toIso(context.minutesAgo(630)));
      await context.query(`DELETE FROM analytics.stage_transition WHERE workspace_id = $1 AND origin = 'reconcile'`, [cursor.workspace.workspaceId]);
    }, { needs: [baseline, cursor] });

    await edge('settings.trackingStart', 'sync.cursor', async (t) => {
      const workspace = await context.createWorkspace();

      workspace.setTrackingStart(context.daysAgo(33));
      t.equal('nothing stored yet', await computeCursor(workspace), workspace.trackingStart.toISOString());
    }, { needs });

    await edge('sync.cursor', 'facade.stageChangeRelation', async (t) => {
      const { workspace, personId } = cursor;
      const { insertStageChange } = workspace.fixtures;
      const countRows = async () =>
        (await context.query(`SELECT count(*)::int AS total FROM analytics.stage_transition WHERE workspace_id = $1`, [workspace.workspaceId]))[0].total;

      // The stored row was updated 600 minutes ago, so the cursor reads from 630.
      await insertStageChange({ personId, before: 'CONTACTED', after: 'BEFORE_MEETING', happensAt: context.minutesAgo(620) });
      await insertStageChange({ personId, before: 'BEFORE_MEETING', after: 'ATTENDED', happensAt: context.minutesAgo(640) });
      await context.runSync(workspace);

      t.equal('inside the overlap is read, behind the cursor is not', await countRows(), 2);

      await context.runDaily(workspace);
      t.equal('the daily full re-read recovers the row behind the cursor', await countRows(), 3);
    }, { needs: [baseline, cursor] });

    await edge('settings.trackingStart', 'facade.stageChangeRelation', async (t) => {
      const { beforeTrackingStart } = baseline.workspace.ignoredRows;

      t.equal('older than tracking start is left out', baseline.relations.stageChange.some(({ id }) => id === beforeTrackingStart), false);

      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.stage_transition WHERE source_id = $1`,
        [beforeTrackingStart],
      );

      t.equal('and never stored, by sync or daily', total, 0);
    }, { needs });

    // ---- reconcile
    const reconcile = await fixture('people whose CRM stage moved without a timeline row', async () => {
      const workspace = await context.createWorkspace();
      const { insertPerson, insertStageChange, setPersonStage } = workspace.fixtures;

      workspace.setTrackingStart(context.daysAgo(40));

      const addPerson = async (key, { before = 'NEW', after = 'CONTACTED', current, updatedAt }) => {
        const personId = await insertPerson({ firstName: key, stage: after, createdAt: context.daysAgo(30) });

        workspace.people[key] = personId;
        workspace.keyOf.set(personId, key);
        await insertStageChange({ personId, before, after, happensAt: context.daysAgo(25) });
        await setPersonStage({ personId, stage: current, updatedAt });
      };

      await addPerson('moved', { current: 'BEFORE_MEETING', updatedAt: context.minutesAgo(31) });
      await addPerson('recent', { current: 'BEFORE_MEETING', updatedAt: context.minutesAgo(5) });
      await addPerson('sibling', { before: 'NEW', after: 'SIGNED_PAID', current: 'SIGNED_NON_PAID', updatedAt: context.minutesAgo(31) });
      await context.runSync(workspace);
      await context.runDaily(workspace);

      const rows = await context.query(
        `SELECT * FROM analytics.stage_transition WHERE workspace_id = $1 AND origin = 'reconcile'`,
        [workspace.workspaceId],
      );
      const logs = await context.query(
        `SELECT * FROM analytics.sync_log WHERE workspace_id = $1 AND job_name = 'daily'`,
        [workspace.workspaceId],
      );

      return { logs, rows, workspace };
    });

    await edge('facade.personRelation.raw_stage', 'sync.reconcile', (t) => {
      t.equal('the moved person is the only one restored', reconcile.rows.map(({ person_id: id }) => reconcile.workspace.keyOf.get(id)), ['moved']);
    }, { needs: [reconcile] });

    await edge('analytics.stage_transition.to_stage', 'sync.reconcile', (t) => {
      t.equal('compared with the last stored stage', reconcile.rows[0]?.from_stage, 'CONTACTED');
    }, { needs: [reconcile] });

    await edge('facade.personRelation.updated_at', 'sync.reconcile', (t) => {
      const recentId = reconcile.workspace.people.recent;

      t.equal('updated 5 minutes ago is left for its timeline job', reconcile.rows.some(({ person_id: id }) => id === recentId), false);
    }, { needs: [reconcile] });

    await edge('cte.stage_map', 'sync.reconcile', (t) => {
      const siblingId = reconcile.workspace.people.sibling;

      t.equal('two raw values of one stage key are no move', reconcile.rows.some(({ person_id: id }) => id === siblingId), false);
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.stage_transition.to_stage', (t) => {
      t.equal('raw current stage', reconcile.rows[0]?.to_stage, 'BEFORE_MEETING');
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.stage_transition.from_stage', (t) => {
      t.equal('raw stored stage', reconcile.rows[0]?.from_stage, 'CONTACTED');
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.stage_transition.origin', (t) => {
      t.equal('flagged', reconcile.rows[0]?.origin, 'reconcile');
      t.equal('no source row', reconcile.rows[0]?.source_id, null);
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.stage_transition.happened_at', (t) => {
      t.ok('dated at discovery, not back-dated', new Date(reconcile.rows[0]?.happened_at) >= context.now, reconcile.rows[0]?.happened_at);
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.stage_transition.source_updated_at', (t) => {
      t.ok('now()', new Date(reconcile.rows[0]?.source_updated_at) >= context.now, reconcile.rows[0]?.source_updated_at);
    }, { needs: [reconcile] });

    await edge('sync.reconcile', 'analytics.sync_log.restored_count', (t) => {
      t.equal('one row restored', reconcile.logs[0]?.restored_count, 1);
    }, { needs: [reconcile] });

    // ---- daily_snapshot
    const snapshotCount = (dimension, key, stage) =>
      baseline.snapshots.find(
        (row) => row.dimension === dimension && row.dimension_key === key && row.stage === stage,
      )?.person_count;

    await edge('facade.personRelation.raw_stage', 'analytics.daily_snapshot.stage', (t) => {
      t.equal('raw value', snapshotCount('all', '', 'NOT_INTERESTED'), 1);
      t.equal('unmapped stays raw', snapshotCount('all', '', 'LEGACY_TEST'), 1);
      t.equal("no stage is ''", snapshotCount('all', '', ''), 1);
    }, { needs });

    await edge('facade.personRelation.positions', 'analytics.daily_snapshot.dimension_key', (t) => {
      t.equal('raw position', snapshotCount('position', 'FINANCE_INTERN', 'NEW'), 2);
      t.equal('unmapped stays raw', snapshotCount('position', 'LEGACY_POSITION', 'LEGACY_TEST'), 1);
      t.equal('no position is NONE', snapshotCount('position', 'NONE', 'NEW'), 1);
    }, { needs });

    await edge('cte.position_map', 'analytics.daily_snapshot.dimension_key', (t) => {
      t.equal('track key', snapshotCount('track', 'BUSINESS', 'NEW'), 2);
      t.equal('unknown position', snapshotCount('track', 'UNMAPPED', 'LEGACY_TEST'), 1);
      t.equal('no position', snapshotCount('track', 'NONE', ''), 1);
    }, { needs });

    await edge('facade.personRelation.source', 'analytics.daily_snapshot.dimension_key', (t) => {
      t.equal('raw source', snapshotCount('source', 'REFERRAL', 'CONTACTED'), 1);
      t.equal('no source is NONE', snapshotCount('source', 'NONE', 'NOT_INTERESTED'), 1);
    }, { needs });

    await edge('facade.personRelation.person_id', 'analytics.daily_snapshot.person_count', (t) => {
      const allRows = baseline.snapshots.filter((row) => row.dimension === 'all');

      t.equal('all rows sum to the live total', allRows.reduce((total, row) => total + row.person_count, 0), 7);
      t.ok('integers', baseline.snapshots.every((row) => Number.isInteger(row.person_count)));
    }, { needs });

    await edge('sync.snapshot', 'analytics.daily_snapshot.dimension', (t) => {
      t.equal('four dimensions', [...new Set(baseline.snapshots.map((row) => row.dimension))].sort(), ['all', 'position', 'source', 'track']);
    }, { needs });

    await edge('config.reportingTimeZone', 'analytics.daily_snapshot.snapshot_date', (t) => {
      t.equal('local date, UTC here', [...new Set(baseline.snapshots.map((row) => row.snapshot_date))], [context.now.toISOString().slice(0, 10)]);
    }, { needs });

    await edge('job.context.workspaceId', 'analytics.daily_snapshot.workspace_id', async (t) => {
      const [{ total }] = await context.query(
        `SELECT count(*)::int AS total FROM analytics.daily_snapshot WHERE workspace_id = $1`,
        [baseline.workspace.workspaceId],
      );

      t.equal('only this workspace', total, baseline.snapshots.length);
      t.ok('rows exist', total > 0);
    }, { needs });

    // ---- sync_log
    const logOf = (jobName) => baseline.logs.filter((row) => row.job_name === jobName);

    await edge('analytics.daily_snapshot.person_count', 'analytics.sync_log.details', (t) => {
      const { details } = logOf('daily')[0];

      t.equal('consistency', details.consistency, 'OK');
      t.equal('all total', details.allTotal, 7);
      t.equal('source total', details.sourceTotal, 7);
    }, { needs });

    await edge('facade.personRelation.person_id', 'analytics.sync_log.details', (t) => {
      t.equal('live total', logOf('daily')[0].details.liveTotal, 7);
    }, { needs });

    await edge('job.context.workspaceId', 'analytics.sync_log.workspace_id', (t) => {
      t.equal('one sync and one daily row', baseline.logs.length, 2);
    }, { needs });

    await edge('job.sync', 'analytics.sync_log.job_name', (t) => {
      t.equal('sync', logOf('sync').length, 1);
    }, { needs });

    await edge('job.daily', 'analytics.sync_log.job_name', (t) => {
      t.equal('daily', logOf('daily').length, 1);
    }, { needs });

    await edge('job.sync', 'analytics.sync_log.started_at', (t) => {
      t.ok('set when the job opens', new Date(logOf('sync')[0].started_at) >= context.now);
    }, { needs });

    await edge('job.sync', 'analytics.sync_log.finished_at', (t) => {
      const [row] = logOf('sync');

      t.ok('set when the job closes', new Date(row.finished_at) >= new Date(row.started_at));
    }, { needs });

    await edge('job.sync', 'analytics.sync_log.status', (t) => {
      t.equal('ok', logOf('sync')[0].status, 'ok');
    }, { needs });

    await edge('sync.readTimeline', 'analytics.sync_log.processed_count', (t) => {
      t.equal('ben, dan and zed', logOf('sync')[0].processed_count, 3);
      t.equal('the daily re-read adds none', logOf('daily')[0].processed_count, 0);
    }, { needs });

    await edge('job.daily', 'analytics.sync_log.details', (t) => {
      const { steps } = logOf('daily')[0].details;

      t.equal(
        'each step recorded apart',
        Object.fromEntries(Object.entries(steps).map(([name, outcome]) => [name, outcome.status])),
        { reports: 'ok', reconcile: 'ok', snapshot: 'ok', timelineRead: 'ok', trimLog: 'ok' },
      );
    }, { needs });

    await edge('job.sync', 'analytics.sync_log.error_message', async (t) => {
      const workspace = await context.createWorkspace();

      workspace.vars.set('CRM_ANALYTICS_TRACKING_START_AT', 'not a date');

      let rethrown = false;

      try {
        await context.runSync(workspace);
      } catch {
        rethrown = true;
      }

      const [row] = await context.query(
        `SELECT status, error_message FROM analytics.sync_log WHERE workspace_id = $1`,
        [workspace.workspaceId],
      );

      t.equal('rethrown', rethrown, true);
      t.equal('status', row.status, 'failed');
      t.ok('message kept', row.error_message.includes('CRM_ANALYTICS_TRACKING_START_AT'), row.error_message);
      t.equal('a good run has none', logOf('sync')[0].error_message, null);
    }, { needs });

    await test('first sync enqueues the daily baseline once', (t) => {
      t.equal('one daily job queued', baseline.queuedDaily.map(({ jobName }) => jobName), ['CrmAnalyticsWorkspaceDailyJob']);
    }, { needs });
  },
};
