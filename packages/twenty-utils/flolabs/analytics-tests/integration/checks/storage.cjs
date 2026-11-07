'use strict';

const EXPECTED_COLUMNS = {
  stage_transition: {
    id: 'uuid',
    source_id: 'uuid',
    workspace_id: 'uuid',
    person_id: 'uuid',
    from_stage: 'text',
    to_stage: 'text',
    happened_at: 'timestamp with time zone',
    source_updated_at: 'timestamp with time zone',
    origin: 'text',
  },
  daily_snapshot: {
    workspace_id: 'uuid',
    snapshot_date: 'date',
    dimension: 'text',
    dimension_key: 'text',
    stage: 'text',
    person_count: 'integer',
  },
  report: {
    workspace_id: 'uuid',
    period_type: 'text',
    period_start: 'date',
    period_end: 'date',
    generated_at: 'timestamp with time zone',
    payload: 'jsonb',
  },
  sync_log: {
    id: 'uuid',
    workspace_id: 'uuid',
    job_name: 'text',
    started_at: 'timestamp with time zone',
    finished_at: 'timestamp with time zone',
    status: 'text',
    processed_count: 'integer',
    restored_count: 'integer',
    details: 'jsonb',
    error_message: 'text',
  },
};

const EXPECTED_INDEXES = [
  'stage_transition_person_idx',
  'stage_transition_source_version_idx',
  'stage_transition_updated_idx',
  'sync_log_workspace_started_idx',
];

module.exports = {
  title: 'Storage: real DDL constant through the real database service',
  run: async ({ harness, services, query, newWorkspace }) => {
    const database = services.get('CrmAnalyticsDatabaseService');

    await harness.check({ id: 'S1', title: 'DDL runs on an empty database' }, async (t) => {
      await query('DROP SCHEMA IF EXISTS analytics CASCADE');
      await database.runJob((run) => database.ensureStorage(run));

      const tables = await query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics' ORDER BY 1`,
      );
      const indexes = await query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'analytics' AND indexname NOT LIKE '%pkey' ORDER BY 1`,
      );

      t.equal('tables', tables.map((row) => row.table_name), Object.keys(EXPECTED_COLUMNS).sort());
      t.equal('indexes', indexes.map((row) => row.indexname), EXPECTED_INDEXES);
    });

    await harness.check({ id: 'S2', title: 'DDL runs twice with no error and keeps rows' }, async (t) => {
      await query(
        `INSERT INTO analytics.sync_log (workspace_id, job_name, started_at, status)
         VALUES ('20202020-ffff-4000-8000-000000000000', 'sync', now(), 'ok')`,
      );
      await database.runJob((run) => database.ensureStorage(run));
      await database.runJob((run) => database.ensureStorage(run));

      const [{ count }] = await query('SELECT count(*)::int AS count FROM analytics.sync_log');

      t.equal('rows kept', count, 1);
      await query(`DELETE FROM analytics.sync_log`);
    });

    await harness.check({ id: 'S3', title: 'Columns match contract section 3' }, async (t) => {
      const rows = await query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'analytics'`,
      );

      for (const [tableName, columns] of Object.entries(EXPECTED_COLUMNS)) {
        const actual = Object.fromEntries(
          rows
            .filter((row) => row.table_name === tableName)
            .map((row) => [row.column_name, row.data_type]),
        );

        t.equal(tableName, actual, columns);
      }
    });

    await harness.check(
      { id: 'S4', title: 'Job connection: 120 s server limit, no 10 s client limit' },
      async (t) => {
        const [{ statement_timeout: statementTimeout }] = await database.runJob((run) =>
          run('SHOW statement_timeout', []),
        );

        t.equal('statement_timeout', statementTimeout, '2min');

        // Slept past the 10 s query_timeout on the CRM pools, which runJob must drop.
        await database.runJob((run) => run('SELECT pg_sleep(10.5)', []));
      },
    );

    await harness.check(
      { id: 'S5', title: 'Page transaction: read only with an 8 s statement limit' },
      async (t) => {
        const workspaceId = '20202020-ffff-4000-8000-000000000000';

        const settings = await database.runPageTransaction(workspaceId, async (run) => ({
          readOnly: (await run('SHOW transaction_read_only', []))[0].transaction_read_only,
          timeout: (await run('SHOW statement_timeout', []))[0].statement_timeout,
        }));

        t.equal('transaction_read_only', settings.readOnly, 'on');
        t.equal('statement_timeout', settings.timeout, '8s');

        let writeError;

        try {
          await database.runPageTransaction(workspaceId, (run) =>
            run(`DELETE FROM analytics.sync_log`, []),
          );
        } catch (error) {
          writeError = error;
        }

        t.equal('write is refused', writeError?.code, '25006');
      },
    );

    await harness.check(
      { id: 'S6', title: 'CRM tables have the shapes the CRM column generator produces' },
      async (t) => {
        const workspace = await newWorkspace({ withApplication: true });
        const rows = await query(
          `SELECT table_name, column_name, data_type, udt_name, is_nullable
           FROM information_schema.columns WHERE table_schema = $1`,
          [workspace.schemaName],
        );
        const shape = (tableName, columnName) => {
          const row = rows.find(
            (candidate) => candidate.table_name === tableName && candidate.column_name === columnName,
          );

          return row === undefined ? null : `${row.data_type}/${row.udt_name}`;
        };

        t.ok('schema name is workspace_ plus base 36', /^workspace_[0-9a-z]+$/.test(workspace.schemaName), workspace.schemaName);
        t.equal('person.stage', shape('person', 'stage'), 'USER-DEFINED/person_stage_enum');
        t.equal(
          'person.positionsAppliedFor',
          shape('person', 'positionsAppliedFor'),
          'ARRAY/_person_positionsAppliedFor_enum',
        );
        t.equal(
          'person.applicantSource',
          shape('person', 'applicantSource'),
          'USER-DEFINED/person_applicantSource_enum',
        );
        t.equal('person.nameFirstName', shape('person', 'nameFirstName'), 'text/text');
        t.equal('person.nameLastName', shape('person', 'nameLastName'), 'text/text');
        t.equal('person.createdAt', shape('person', 'createdAt'), 'timestamp with time zone/timestamptz');
        t.equal('person.deletedAt', shape('person', 'deletedAt'), 'timestamp with time zone/timestamptz');
        t.equal('timelineActivity.id', shape('timelineActivity', 'id'), 'uuid/uuid');
        t.equal('timelineActivity.targetPersonId', shape('timelineActivity', 'targetPersonId'), 'uuid/uuid');
        t.equal('timelineActivity.linkedRecordId', shape('timelineActivity', 'linkedRecordId'), 'uuid/uuid');
        t.equal('timelineActivity.properties', shape('timelineActivity', 'properties'), 'jsonb/jsonb');
        t.equal('timelineActivity.happensAt', shape('timelineActivity', 'happensAt'), 'timestamp with time zone/timestamptz');
        t.equal('timelineActivity.updatedAt', shape('timelineActivity', 'updatedAt'), 'timestamp with time zone/timestamptz');
        t.equal('_crmForm.name', shape('_crmForm', 'name'), 'text/text');
        t.equal('_formSubmission.personId', shape('_formSubmission', 'personId'), 'uuid/uuid');
        t.equal('_formSubmission.formId', shape('_formSubmission', 'formId'), 'uuid/uuid');
        t.equal('_formSubmission.submittedAt', shape('_formSubmission', 'submittedAt'), 'timestamp with time zone/timestamptz');
        t.equal('_application.deletedAt', shape('_application', 'deletedAt'), 'timestamp with time zone/timestamptz');
      },
    );
  },
};
