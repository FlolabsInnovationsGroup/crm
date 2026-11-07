'use strict';
// Every relation is the facade's own text, run on tables built by the CRM's generator.
// State always comes from the real getCrmState over metadata matching those tables.

const CAST_RELATION = (relationSql) =>
  `SELECT pg_typeof(x.raw_stage)::text AS stage_type, pg_typeof(x.positions)::text AS positions_type,
          pg_typeof(x.source)::text AS source_type, x.*
   FROM (${relationSql}) x ORDER BY x.created_at`;

module.exports = {
  title: 'Facade relations: valid SQL on CRM-shaped tables',
  run: async ({ harness, services, query, newWorkspace, daysAgo }) => {
    const facade = services.get('CrmAnalyticsFacadeService');
    const database = services.get('CrmAnalyticsDatabaseService');

    const jobRun = (sql, parameters = []) => database.runJob((run) => run(sql, parameters));

    const full = await harness.fixture('F0', 'workspace with every field', async () => {
      const workspace = await newWorkspace({ withApplication: true });
      const { insertPerson } = workspace.fixtures;

      workspace.people = {
        complete: await insertPerson({
          firstName: 'Ada',
          lastName: 'Complete',
          stage: 'NEW',
          positions: ['FINANCE_INTERN', 'AI_AGI_INTERN'],
          source: 'LINKEDIN',
          createdAt: daysAgo(5),
        }),
        emptyArray: await insertPerson({
          firstName: 'Ben',
          lastName: '',
          stage: 'CONTACTED',
          positions: [],
          createdAt: daysAgo(4),
        }),
        nullArray: await insertPerson({ firstName: '', lastName: 'Null', createdAt: daysAgo(3) }),
        deleted: await insertPerson({
          firstName: 'Del',
          lastName: 'Eted',
          stage: 'NEW',
          createdAt: daysAgo(2),
          deletedAt: daysAgo(1),
        }),
      };
      workspace.state = await facade.getCrmState(workspace.workspaceId);

      return workspace;
    });

    await harness.check({ id: 'F1', title: 'getCrmState reads every field and object as present', needs: [full] }, async (t) => {
      const { state } = full;

      t.equal('stage status', state.stage.status, 'OK');
      t.equal('stage is audit logged', state.stage.isAuditLogged, true);
      t.equal('positions status', state.positionsAppliedFor.status, 'OK');
      t.equal('source status', state.applicantSource.status, 'OK');
      t.equal('hasFormSubmissionObject', state.hasFormSubmissionObject, true);
      t.equal('hasApplicationObject', state.hasApplicationObject, true);
    });

    await harness.check({ id: 'F2', title: 'Person relation: enum and enum array read as text, soft-deleted excluded', needs: [full] }, async (t) => {
      const rows = await jobRun(CAST_RELATION(facade.buildPersonRelationSql(full.state)));

      t.equal('stage type', rows[0]?.stage_type, 'text');
      t.equal('positions type', rows[0]?.positions_type, 'text[]');
      t.equal('source type', rows[0]?.source_type, 'text');
      t.equal(
        'rows',
        rows.map(({ raw_stage: rawStage, positions, source }) => ({ rawStage, positions, source })),
        [
          { rawStage: 'NEW', positions: ['FINANCE_INTERN', 'AI_AGI_INTERN'], source: 'LINKEDIN' },
          { rawStage: 'CONTACTED', positions: [], source: null },
          { rawStage: null, positions: [], source: null },
        ],
      );
      t.ok('soft-deleted is gone', !rows.some((row) => row.person_id === full.people.deleted));
    });

    await harness.check({ id: 'F3', title: 'Person relation: missing fields become NULL::text and empty text[]' }, async (t) => {
      const workspace = await newWorkspace({ personFields: 'NONE', forms: 'NONE' });
      const personTable = workspace.table('person');

      await query(`INSERT INTO ${personTable} ("nameFirstName") VALUES ('Bare')`);

      const state = await facade.getCrmState(workspace.workspaceId);

      t.equal('statuses', [state.stage.status, state.positionsAppliedFor.status, state.applicantSource.status], ['MISSING', 'MISSING', 'MISSING']);

      const rows = await jobRun(CAST_RELATION(facade.buildPersonRelationSql(state)));

      t.equal('one row', rows.length, 1);
      t.equal('stage type', rows[0]?.stage_type, 'text');
      t.equal('positions type', rows[0]?.positions_type, 'text[]');
      t.equal('source type', rows[0]?.source_type, 'text');
      t.equal('values', [rows[0]?.raw_stage, rows[0]?.positions, rows[0]?.source], [null, [], null]);
    });

    await harness.check({ id: 'F4', title: 'Person relation: wrong-typed fields are treated as missing' }, async (t) => {
      const workspace = await newWorkspace({ personFields: 'WRONG_TYPE', forms: 'NONE' });

      await query(
        `INSERT INTO ${workspace.table('person')} (stage, "positionsAppliedFor", "applicantSource") VALUES (true, 'not an array', 7)`,
      );

      const state = await facade.getCrmState(workspace.workspaceId);

      t.equal('statuses', [state.stage.status, state.positionsAppliedFor.status, state.applicantSource.status], ['WRONG_TYPE', 'WRONG_TYPE', 'WRONG_TYPE']);

      const rows = await jobRun(CAST_RELATION(facade.buildPersonRelationSql(state)));

      t.equal('values', [rows[0]?.raw_stage, rows[0]?.positions, rows[0]?.source], [null, [], null]);
    });

    await harness.check({ id: 'F5', title: 'Person relation: TEXT stage and source are accepted' }, async (t) => {
      const workspace = await newWorkspace({ personFields: 'TEXT', forms: 'NONE' });

      await query(`INSERT INTO ${workspace.table('person')} (stage, "applicantSource") VALUES ('NEW', 'LINKEDIN')`);

      const state = await facade.getCrmState(workspace.workspaceId);

      t.equal('statuses', [state.stage.status, state.positionsAppliedFor.status, state.applicantSource.status], ['OK', 'MISSING', 'OK']);

      const rows = await jobRun(CAST_RELATION(facade.buildPersonRelationSql(state)));

      t.equal('values', [rows[0]?.raw_stage, rows[0]?.positions, rows[0]?.source], ['NEW', [], 'LINKEDIN']);
    });

    await harness.check({ id: 'F6', title: 'Stage change relation: only own stage diffs inside the bounds', needs: [full] }, async (t) => {
      const { insertStageChange, insertTimelineRow } = full.fixtures;
      const personId = full.people.complete;
      const updatedSince = daysAgo(50);
      const happenedSince = daysAgo(60);

      const wanted = await insertStageChange({
        personId,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: daysAgo(10),
        updatedAt: daysAgo(9),
      });
      const wantedWithOtherField = await insertStageChange({
        personId,
        before: 'CONTACTED',
        after: 'ATTENDED',
        happensAt: daysAgo(8),
        extraDiff: { jobTitle: { before: 'a', after: 'b' } },
      });
      const clearedStage = await insertStageChange({
        personId,
        before: 'ATTENDED',
        after: null,
        happensAt: daysAgo(7),
      });

      await insertStageChange({ personId, before: 'A', after: 'B', happensAt: daysAgo(10), linkedRecordId: full.people.emptyArray });
      await insertStageChange({ personId: null, before: 'A', after: 'B', happensAt: daysAgo(10) });
      await insertTimelineRow({ personId, properties: { diff: { jobTitle: { before: 'a', after: 'b' } } }, happensAt: daysAgo(10) });
      await insertTimelineRow({ personId, properties: {}, happensAt: daysAgo(10) });
      await insertTimelineRow({ personId, properties: null, happensAt: daysAgo(10) });
      await insertStageChange({ personId, before: 'A', after: 'B', happensAt: daysAgo(10), updatedAt: daysAgo(55) });
      await insertStageChange({ personId, before: 'A', after: 'B', happensAt: daysAgo(70), updatedAt: daysAgo(1) });

      const relationSql = facade.buildStageChangeRelationSql({
        state: full.state,
        updatedSinceParameter: '$1',
        happenedSinceParameter: '$2',
      });
      const rows = await jobRun(`SELECT * FROM (${relationSql}) c ORDER BY c.happened_at`, [updatedSince, happenedSince]);

      t.equal(
        'rows',
        rows.map(({ id, person_id: rowPersonId, from_stage: from, to_stage: to }) => ({ id, rowPersonId, from, to })),
        [
          { id: wanted, rowPersonId: personId, from: 'NEW', to: 'CONTACTED' },
          { id: wantedWithOtherField, rowPersonId: personId, from: 'CONTACTED', to: 'ATTENDED' },
          { id: clearedStage, rowPersonId: personId, from: 'ATTENDED', to: null },
        ],
      );
      t.equal('happened_at is happensAt', rows[0]?.happened_at, daysAgo(10));
      t.equal('source_updated_at is updatedAt', rows[0]?.source_updated_at, daysAgo(9));
    });

    await harness.check({ id: 'F7', title: 'Submission relation: named form only, soft-deleted excluded', needs: [full] }, async (t) => {
      const { insertForm, insertSubmission } = full.fixtures;
      const applicationForm = await insertForm({ name: 'Internship Application' });
      const otherForm = await insertForm({ name: 'Follow-up survey' });
      const personId = full.people.complete;
      const first = await insertSubmission({ formId: applicationForm, personId, submittedAt: daysAgo(3) });
      const second = await insertSubmission({ formId: applicationForm, personId, submittedAt: daysAgo(2) });

      await insertSubmission({ formId: otherForm, personId, submittedAt: daysAgo(2) });
      await insertSubmission({ formId: applicationForm, personId, submittedAt: daysAgo(2), deletedAt: daysAgo(1) });

      const rows = await jobRun(
        `SELECT * FROM (${facade.buildApplicationSubmissionRelationSql(full.state)}) s ORDER BY s.submitted_at`,
      );

      t.equal(
        'rows',
        rows.map(({ id, person_id: rowPersonId, submitted_at: submittedAt }) => ({ id, rowPersonId, submittedAt })),
        [
          { id: first, rowPersonId: personId, submittedAt: daysAgo(3) },
          { id: second, rowPersonId: personId, submittedAt: daysAgo(2) },
        ],
      );
    });

    await harness.check({ id: 'F8', title: 'Submission relation is null with no or half-built form objects' }, async (t) => {
      const bare = await newWorkspace({ forms: 'NONE' });
      const half = await newWorkspace({ forms: 'HALF_BUILT' });
      const bareState = await facade.getCrmState(bare.workspaceId);
      const halfState = await facade.getCrmState(half.workspaceId);

      t.equal('no objects', [bareState.hasFormSubmissionObject, facade.buildApplicationSubmissionRelationSql(bareState)], [false, null]);
      t.equal('half built', [halfState.hasFormSubmissionObject, facade.buildApplicationSubmissionRelationSql(halfState)], [false, null]);
    });

    await harness.check({ id: 'F9', title: 'Imported applications count: soft-deleted excluded, null when absent', needs: [full] }, async (t) => {
      const table = full.table('_application');

      await query(`INSERT INTO ${table} (name) VALUES ('a'), ('b')`);
      await query(`INSERT INTO ${table} (name, "deletedAt") VALUES ('c', now())`);

      const count = await database.runJob((run) => facade.countImportedApplications({ state: full.state, run }));
      const absent = await newWorkspace({ forms: 'NONE', withApplication: false });
      const absentState = await facade.getCrmState(absent.workspaceId);
      const absentCount = await database.runJob((run) => facade.countImportedApplications({ state: absentState, run }));

      t.equal('count', count, 2);
      t.equal('absent object', absentCount, null);
    });

    await harness.check({ id: 'F10', title: 'Display names: composite columns, soft-deleted excluded', needs: [full] }, async (t) => {
      const names = await database.runJob((run) =>
        facade.getPersonDisplayNames({
          state: full.state,
          personIds: Object.values(full.people),
          run,
        }),
      );

      t.equal(
        'names',
        Object.fromEntries(names),
        {
          [full.people.complete]: 'Ada Complete',
          [full.people.emptyArray]: 'Ben',
          [full.people.nullArray]: 'Null',
        },
      );
    });

    await harness.check({ id: 'F11', title: 'Every relation runs inside the read-only page transaction', needs: [full] }, async (t) => {
      const rows = await database.runPageTransaction(full.workspaceId, async (run) => ({
        people: await run(facade.buildPersonRelationSql(full.state), []),
        changes: await run(
          facade.buildStageChangeRelationSql({ state: full.state, updatedSinceParameter: '$1', happenedSinceParameter: '$2' }),
          [daysAgo(50), daysAgo(60)],
        ),
        submissions: await run(facade.buildApplicationSubmissionRelationSql(full.state), []),
      }));

      t.equal('people', rows.people.length, 3);
      t.equal('changes', rows.changes.length, 3);
      t.equal('submissions', rows.submissions.length, 2);
    });
  },
};
