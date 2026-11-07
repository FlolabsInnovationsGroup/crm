'use strict';
// Data minimization, spec section 9. Sentinels go into every personal column a real
// person has, the jobs run, and then every column of every analytics table and every
// payload is scanned. The only allowed place is the live displayName of a stuck row.
const { insertPeople } = require('../lib/seed.cjs');

const SENTINELS = {
  firstName: 'TaintFirstQ7X',
  lastName: 'TaintLastQ7X',
  email: 'taint.email.q7x@example.test',
  extraEmail: 'taint.second.q7x@example.test',
  phone: '+15550107777',
  city: 'TaintCityQ7X',
  jobTitle: 'TaintJobQ7X',
  answer: 'TaintAnswerQ7X',
  answerEmail: 'taint.answer.q7x@example.test',
  submissionName: 'TaintSubmissionQ7X',
  sourceUrl: 'https://taint-q7x.example.test/apply',
  cachedName: 'TaintCachedQ7X',
  formDefinition: 'TaintDefinitionQ7X',
  applicationName: 'TaintApplicationQ7X',
};

const SENTINEL_VALUES = Object.values(SENTINELS);
const LIVE_NAME_SENTINELS = [SENTINELS.firstName, SENTINELS.lastName];

const findSentinels = (text) =>
  SENTINEL_VALUES.filter((sentinel) => text.toLowerCase().includes(sentinel.toLowerCase()));

// Every string leaf holding a sentinel, by path.
const walkForSentinels = (value, path, hits) => {
  if (typeof value === 'string') {
    const found = findSentinels(value);

    if (found.length > 0) hits.push({ path, found });
  } else if (Array.isArray(value)) {
    value.forEach((element, position) => walkForSentinels(element, `${path}[${position}]`, hits));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      walkForSentinels(key, `${path}.<key>`, hits);
      walkForSentinels(inner, `${path}.${key}`, hits);
    }
  }

  return hits;
};

module.exports = {
  title: 'Taint: personal data never reaches analytics',
  run: async ({ context, createScope }) => {
    const { fixture, test } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsReportService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });

    const { daysAgo, query } = context;

    // The harness builds the fields analytics needs; the rest of a real person is added here.
    const seedTaintedWorkspace = async () => {
      const workspace = await context.createWorkspace({ withApplication: true });
      const person = workspace.table('person');
      const { insertForm, insertStageChange, insertSubmission, insertTimelineRow } = workspace.fixtures;

      await query(`ALTER TABLE ${person}
        ADD COLUMN "emailsPrimaryEmail" text,
        ADD COLUMN "emailsAdditionalEmails" jsonb,
        ADD COLUMN "phonesPrimaryPhoneNumber" text,
        ADD COLUMN city text`);

      workspace.setTrackingStart(daysAgo(45));

      const tainted = { firstName: SENTINELS.firstName, lastName: SENTINELS.lastName };

      await insertPeople({
        workspace,
        people: {
          stuck: { ...tainted, createdAge: 30, stage: 'NEW', positions: ['FINANCE_INTERN'], source: 'LINKEDIN' },
          moved: { ...tainted, createdAge: 30, stage: 'CONTACTED', positions: ['AI_AGI_INTERN'], source: 'REFERRAL', moves: [['NEW', 'CONTACTED', 25]] },
          signed: { ...tainted, createdAge: 30, stage: 'SIGNED_PAID', positions: ['FINANCE_INTERN'], source: 'LINKEDIN', moves: [['NEW', 'SIGNED_PAID', 10]] },
          recent: { ...tainted, createdAge: 3, stage: 'NEW', positions: [], source: null },
          deleted: { ...tainted, createdAge: 30, stage: 'NEW', positions: [], source: null, deletedAge: 1 },
        },
        daysAgo,
      });

      await query(
        `UPDATE ${person} SET "emailsPrimaryEmail" = $1, "emailsAdditionalEmails" = $2::jsonb,
           "phonesPrimaryPhoneNumber" = $3, city = $4, "jobTitle" = $5`,
        [SENTINELS.email, JSON.stringify([SENTINELS.extraEmail]), SENTINELS.phone, SENTINELS.city, SENTINELS.jobTitle],
      );

      const { moved, stuck } = workspace.people;

      // A real audit-logged update carries every changed field in one diff.
      await insertStageChange({
        personId: stuck,
        before: 'NEW',
        after: 'CONTACTED',
        happensAt: daysAgo(24),
        extraDiff: {
          nameFirstName: { before: SENTINELS.firstName, after: SENTINELS.firstName },
          emails: { before: SENTINELS.email, after: SENTINELS.extraEmail },
          phones: { before: SENTINELS.phone, after: SENTINELS.phone },
        },
      });
      await insertStageChange({ personId: stuck, before: 'CONTACTED', after: 'NEW', happensAt: daysAgo(23) });
      await insertTimelineRow({
        personId: moved,
        properties: { diff: { jobTitle: { before: SENTINELS.jobTitle, after: SENTINELS.city } } },
        happensAt: daysAgo(6),
      });
      await query(`UPDATE ${workspace.table('timelineActivity')} SET "linkedRecordCachedName" = $1`, [SENTINELS.cachedName]);

      const formId = await insertForm({ name: 'Internship Application' });

      await query(`UPDATE ${workspace.table('_crmForm')} SET definition = $1::jsonb`, [
        JSON.stringify({ title: SENTINELS.formDefinition }),
      ]);

      for (const [personId, age] of [[stuck, 2], [moved, 10]]) {
        await insertSubmission({ formId, personId, submittedAt: daysAgo(age) });
      }

      await query(`UPDATE ${workspace.table('_formSubmission')} SET name = $1, "sourceUrl" = $2, answers = $3::jsonb`, [
        SENTINELS.submissionName,
        SENTINELS.sourceUrl,
        JSON.stringify({ motivation: SENTINELS.answer, contact: SENTINELS.answerEmail }),
      ]);
      await query(`INSERT INTO ${workspace.table('_application')} (name) VALUES ($1)`, [SENTINELS.applicationName]);

      return workspace;
    };

    const listAnalyticsTables = () =>
      query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics' AND table_type = 'BASE TABLE'`);

    // Whole row as text, so every column is read and a new column is read too.
    const scanAnalyticsTables = async () => {
      const hits = [];
      const rowCounts = {};

      for (const { table_name: tableName } of await listAnalyticsTables()) {
        const rows = await query(`SELECT t::text AS row_text FROM analytics."${tableName}" t`);

        rowCounts[tableName] = rows.length;

        for (const { row_text: rowText } of rows) {
          const found = findSentinels(rowText);

          if (found.length > 0) hits.push({ tableName, found });
        }
      }

      return { hits, rowCounts };
    };

    const tainted = await fixture('workspace seeded with sentinels, after sync and daily', async () => {
      const mark = context.statements.length;
      const workspace = await seedTaintedWorkspace();

      await context.runSync(workspace);
      await context.runDaily(workspace);
      await context.runDaily(workspace);

      return {
        jobStatements: context.statements.slice(mark).filter(({ origin }) => origin === 'job'),
        workspace,
      };
    });

    const needs = [tainted];

    await test('TAINT-01 control: the sentinels really are in the CRM tables', async (t) => {
      const { workspace } = tainted;
      const textOf = async (table) =>
        (await query(`SELECT t::text AS row_text FROM ${workspace.table(table)} t`)).map(({ row_text: text }) => text).join(' ');
      const crmText = [
        await textOf('person'),
        await textOf('timelineActivity'),
        await textOf('_formSubmission'),
        await textOf('_crmForm'),
        await textOf('_application'),
      ].join(' ');

      t.equal('every sentinel found', SENTINEL_VALUES.filter((sentinel) => !findSentinels(crmText).includes(sentinel)), []);
    }, { needs });

    await test('TAINT-02 control: the scanner finds a sentinel in a new table', async (t) => {
      await query(`CREATE TABLE analytics.dataflow_scan_control (note text)`);

      try {
        await query(`INSERT INTO analytics.dataflow_scan_control VALUES ($1)`, [SENTINELS.email]);

        const { hits } = await scanAnalyticsTables();

        t.equal('found', hits.filter(({ tableName }) => tableName === 'dataflow_scan_control').length, 1);
      } finally {
        await query(`DROP TABLE analytics.dataflow_scan_control`);
      }
    }, { needs });

    await test('TAINT-03 no sentinel in any column of any analytics table', async (t) => {
      const { hits, rowCounts } = await scanAnalyticsTables();

      t.equal('hits', hits, []);

      for (const table of ['stage_transition', 'daily_snapshot', 'report', 'sync_log']) {
        t.ok(`${table} was scanned with rows in it`, rowCounts[table] > 0, rowCounts);
      }

      const own = (table) =>
        query(`SELECT count(*)::int AS total FROM analytics.${table} WHERE workspace_id = $1`, [tainted.workspace.workspaceId]);

      for (const table of ['stage_transition', 'daily_snapshot', 'report', 'sync_log']) {
        t.ok(`this workspace wrote to ${table}`, (await own(table))[0].total > 0);
      }
    }, { needs });

    await test('TAINT-04 stage_transition holds only ids, stages and times', async (t) => {
      const columns = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'stage_transition' ORDER BY column_name`,
      );

      t.equal('columns', columns.map(({ column_name: name }) => name), [
        'from_stage', 'happened_at', 'id', 'origin', 'person_id', 'source_id', 'source_updated_at', 'to_stage', 'workspace_id',
      ]);
    }, { needs });

    await test('TAINT-05 no sentinel in any stored report payload or report read back', async (t) => {
      const { workspace } = tainted;
      const list = await context.page.reports(workspace);

      t.ok('reports exist', list.length > 0, list);
      t.equal('the list', walkForSentinels(list, 'reports', []), []);

      for (const { periodType, periodStart } of list) {
        const report = await context.page.report(workspace, periodType, periodStart);

        t.equal(`${periodType} ${periodStart}`, walkForSentinels(report, 'report', []), []);
      }
    }, { needs });

    await test('TAINT-06 no sentinel in meta, funnel, categories or trends payloads', async (t) => {
      const { workspace } = tainted;
      const { page } = context;

      t.equal('meta', walkForSentinels(await page.meta(workspace), 'meta', []), []);
      t.equal('funnel', walkForSentinels(await page.funnel(workspace), 'funnel', []), []);
      t.equal('categories', walkForSentinels(await page.categories(workspace, 'TRACK_PROGRAM'), 'categories', []), []);
      t.equal('sources', walkForSentinels(await page.categories(workspace, 'SOURCE'), 'sources', []), []);

      for (const metric of ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT', 'OVERALL_CONVERSION', 'DROP_OFF', 'MEDIAN_DAYS']) {
        t.equal(metric, walkForSentinels(await page.trends(workspace, metric), metric, []), []);
      }
    }, { needs });

    await test('TAINT-07 Overview: the name appears only as the live displayName of a stuck row, and nothing else personal does', async (t) => {
      const overview = await context.page.overview(tainted.workspace);
      const hits = walkForSentinels(overview, 'overview', []);
      const elsewhere = hits.filter(({ path }) => !/^overview\.stuck\.rows\[\d+\]\.displayName$/.test(path));

      t.ok('the control holds: a stuck row shows it', hits.length > 0, overview.stuck);
      t.equal('nowhere else', elsewhere, []);

      for (const { found } of hits) {
        t.equal('only name parts', found.filter((sentinel) => !LIVE_NAME_SENTINELS.includes(sentinel)), []);
      }

      const row = overview.stuck.rows.find(({ personId }) => personId === tainted.workspace.people.moved);

      t.equal('the whole display name', row?.displayName, `${SENTINELS.firstName} ${SENTINELS.lastName}`);
    }, { needs });

    await test('TAINT-08 a soft-deleted name is not read, even live', async (t) => {
      const { stuck } = await context.page.overview(tainted.workspace);

      t.equal('absent', stuck.rows.some(({ personId }) => personId === tainted.workspace.people.deleted), false);
    }, { needs });

    await test('TAINT-09 jobs never select a personal column; the name is read only in the page transaction', async (t) => {
      const personalColumns = /nameFirstName|nameLastName|emails|phones|answers|jobTitle|"?city"?\b|sourceUrl|linkedRecordCachedName|definition/i;
      const offenders = tainted.jobStatements.filter(({ sql }) => personalColumns.test(sql));

      t.ok('jobs ran statements', tainted.jobStatements.length > 20, tainted.jobStatements.length);
      t.equal('no job statement names one', offenders.map(({ sql }) => sql.slice(0, 200)), []);

      const mark = context.statements.length;

      await context.page.overview(tainted.workspace);

      const pageStatements = context.statements.slice(mark);
      const nameStatements = pageStatements.filter(({ sql }) => /nameFirstName/.test(sql));

      t.equal('one live read', nameStatements.length, 1);
      t.equal('from the read-only page transaction', nameStatements[0]?.origin, 'page');
      t.ok('a plain SELECT', nameStatements[0]?.sql.trimStart().startsWith('SELECT'), nameStatements[0]?.sql);
    }, { needs });

    await test('TAINT-10 the analytics schema is the only thing written: CRM tables are unchanged by the jobs', async (t) => {
      const workspace = await seedTaintedWorkspace();
      const fingerprint = async () =>
        (
          await query(
            `SELECT
               (SELECT md5(string_agg(t::text, '' ORDER BY t.id)) FROM ${workspace.table('person')} t) AS person,
               (SELECT md5(string_agg(t::text, '' ORDER BY t.id)) FROM ${workspace.table('timelineActivity')} t) AS timeline,
               (SELECT md5(string_agg(t::text, '' ORDER BY t.id)) FROM ${workspace.table('_formSubmission')} t) AS submission,
               (SELECT md5(string_agg(t::text, '' ORDER BY t.id)) FROM ${workspace.table('_crmForm')} t) AS form`,
          )
        )[0];
      const before = await fingerprint();

      await context.runSync(workspace);
      await context.runDaily(workspace);
      await context.page.overview(workspace);

      t.equal('read-only on the CRM', await fingerprint(), before);
    }, { needs });
  },
};
