'use strict';
// Keeps the graph, the tests and the code from drifting apart. Runs last: it reads what
// every other section registered.
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('../lib/context.cjs');
const { renderDataflowDoc } = require('../lib/render-dataflow-doc.cjs');
const { loadGraph } = require('../lib/suite.cjs');
const { seedBaseline } = require('../lib/seed.cjs');
const { listCteNames } = require('../lib/sql-tap.cjs');

const EDGE_ID = /^DF-\d+$/;
const NAMED_EDGE = /\bDF-\d+\b/g;
const LAYERS_THAT_COVER_EDGES = new Set(['blackbox', 'ui', 'unit-front', 'unit-server', 'integration']);

// A statement's own write helpers, not CTEs of the read path.
const JOB_ONLY_CTE_NAMES = new Set(['latest', 'inserted', 'snapshot_row']);

const readEdgesWithoutTest = (graph, results) => {
  const tested = new Set(results.map(({ edgeId }) => edgeId));

  return graph.edges
    .filter(({ id, coveredByLayer }) => !tested.has(id) && !LAYERS_THAT_COVER_EDGES.has(coveredByLayer))
    .map(({ id }) => id);
};

module.exports = {
  title: 'Graph coverage',
  run: async ({ context, createScope, graph, runner }) => {
    const { test: dbTest } = createScope({
      requirements: () => [
        context.requirement('CrmAnalyticsMetricsService'),
        context.requirement('CrmAnalyticsWorkspaceDailyJob'),
        context.resolverRequirement,
      ],
    });
    const nodeIds = new Set(graph.nodes.map(({ id }) => id));
    const edgeIds = new Set(graph.edges.map(({ id }) => id));

    const runStatic = (name, work) =>
      runner.test({ name }, work);

    await runStatic('COVERAGE-01 every edge in dataflow-graph.json has a test named with its id, or names the layer that covers it', (t) => {
      t.equal('edges with no test', readEdgesWithoutTest(graph, runner.results), []);
    });

    await runStatic('COVERAGE-02 the coverage check itself fails on a graph edge nobody tests', (t) => {
      const drifted = { edges: [...graph.edges, { id: 'DF-999', from: 'x', to: 'y', field: 'z', use: 'w' }] };

      t.equal('found', readEdgesWithoutTest(drifted, runner.results), ['DF-999']);

      const handedOver = { edges: [{ id: 'DF-999', from: 'x', to: 'y', field: 'z', use: 'w', coveredByLayer: 'ui' }] };

      t.equal('a named layer is accepted', readEdgesWithoutTest(handedOver, []), []);
    });

    await runStatic('COVERAGE-03 no test names an edge the graph does not have', (t) => {
      const unknown = runner.results
        .flatMap(({ name }) => name.match(NAMED_EDGE) ?? [])
        .filter((id) => !edgeIds.has(id));

      t.equal('unknown ids', unknown, []);
    });

    await runStatic('COVERAGE-04 the graph is well formed', (t) => {
      t.equal('ids unique', edgeIds.size, graph.edges.length);
      t.equal('ids well formed', graph.edges.filter(({ id }) => !EDGE_ID.test(id)).map(({ id }) => id), []);
      t.equal(
        'every endpoint is a node',
        graph.edges.flatMap(({ from, to }) => [from, to]).filter((id) => !nodeIds.has(id)),
        [],
      );
      t.equal(
        'every node is used',
        graph.nodes.map(({ id }) => id).filter((id) => !graph.edges.some(({ from, to }) => from === id || to === id)),
        [],
      );
      t.equal(
        'every edge states its field and use',
        graph.edges.filter(({ field, use }) => !field || !use).map(({ id }) => id),
        [],
      );
    });

    await runStatic('COVERAGE-05 every required node of the task is in the graph', (t) => {
      const required = [
        'crm.person.stage',
        'crm.person.positionsAppliedFor',
        'crm.person.applicantSource',
        'crm.person.createdAt',
        'crm.person.deletedAt',
        'crm.timelineActivity.properties.diff.stage',
        'crm.timelineActivity.happensAt',
        'crm.timelineActivity.updatedAt',
        'crm.formSubmission.submittedAt',
        'crm.crmForm.name',
        'config.stages',
        'config.tracks',
        'sync.readTimeline',
        'sync.reconcile',
        'analytics.report.payload',
      ];

      t.equal('missing', required.filter((id) => !nodeIds.has(id)), []);
    });

    await runStatic('COVERAGE-06 every source file the graph names exists', (t) => {
      const sources = [...new Set(graph.nodes.flatMap(({ source }) => (source === undefined ? [] : [source])))];

      t.equal('missing', sources.filter((source) => !fs.existsSync(path.join(REPO_ROOT, source))), []);
    });

    await runStatic('COVERAGE-07 DATAFLOW.md is what the graph generates', (t) => {
      const docPath = path.join(__dirname, '..', 'DATAFLOW.md');
      const current = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n') : '';

      t.ok(
        'out of date. Run: node packages/twenty-utils/flolabs/analytics-tests/dataflow/lib/render-dataflow-doc.cjs --write',
        current === renderDataflowDoc(loadGraph()),
      );
    });

    await runStatic('COVERAGE-08 a missing product file reports SKIPPED with the file named, it does not fail', async (t) => {
      const before = runner.results.length;

      await runner.test(
        { name: 'COVERAGE-08 self check', requires: [{ isAvailable: false, label: 'src/modules/analytics/not-written-yet.ts' }] },
        (inner) => inner.fail('must not run'),
      );

      const [entry] = runner.results.splice(before);

      t.equal('status', entry.status, 'SKIPPED');
      t.ok('reason names the file', entry.reason.includes('not-written-yet.ts'), entry.reason);
    });

    await runStatic('COVERAGE-09 the layer refuses any database but a local proof database', (t) => {
      const { assertLocalDatabaseHost, assertProofDatabaseName } = require(path.join(__dirname, '..', '..', 'lib', 'local-only.cjs'));

      t.equal('localhost passes', assertLocalDatabaseHost('localhost'), 'localhost');
      t.equal('a run has its own database', assertProofDatabaseName('analytics_proof_dataflow123'), 'analytics_proof_dataflow123');

      const refuses = (work) => {
        try {
          work();

          return false;
        } catch {
          return true;
        }
      };

      t.ok('a remote host', refuses(() => assertLocalDatabaseHost('crm.flolabsinnovations.com')));
      t.ok('the CRM database', refuses(() => assertProofDatabaseName('default')));
    });

    // ---- against the real system
    await dbTest('COVERAGE-10 every analytics table column is a node, and every column node exists', async (t) => {
      const columns = await context.query(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'analytics'`,
      );
      const actual = new Set(columns.map(({ table_name: table, column_name: column }) => `analytics.${table}.${column}`));
      const inGraph = [...nodeIds].filter((id) => id.startsWith('analytics.'));

      // A generated primary key defines nothing that flows anywhere.
      const unmodelled = [...actual].filter((id) => !nodeIds.has(id) && !/\.id$/.test(id));

      t.equal('columns with no node', unmodelled, []);
      t.equal('nodes with no column', inGraph.filter((id) => !actual.has(id)), []);
    });

    await dbTest('COVERAGE-11 every field of every real payload is a node', async (t) => {
      const workspace = await seedBaseline(context);
      const { page } = context;

      await context.runSync(workspace);
      await context.runDaily(workspace);

      const [item] = await page.reports(workspace);
      const report = await page.report(workspace, item.periodType, item.periodStart);
      const payloads = [
        ['overview', await page.overview(workspace)],
        ['funnel', await page.funnel(workspace)],
        ['categories', await page.categories(workspace, 'TRACK_PROGRAM')],
        ['meta', await page.meta(workspace)],
        ['trends', await page.trends(workspace, 'DROP_OFF')],
        ['reports', await page.reports(workspace)],
      ];
      const fieldsOf = (name, payload) => {
        const fields = new Set();

        const walk = (value, trail) => {
          if (Array.isArray(value)) {
            if (value.length === 0) return;
            walk(value[0], `${trail}[]`);
          } else if (value !== null && typeof value === 'object') {
            for (const [key, inner] of Object.entries(value)) walk(inner, `${trail}.${key}`);
          } else {
            fields.add(trail);
          }
        };

        walk(payload, `payload.${name}`);

        return fields;
      };
      const BASE_FIELDS = new Set(['asOf', 'trackingStartedAt', 'reportingTimeZone', 'minimumSample']);
      const missing = [];

      for (const [name, payload] of payloads) {
        for (const field of fieldsOf(name, payload)) {
          const leaf = field.split('.').at(-1);
          const node = field.replace(/^payload\.reports\[\]/, 'payload.reports[]');

          if (BASE_FIELDS.has(leaf) || nodeIds.has(node)) continue;

          // A leaf whose parent was folded, such as a stage inside the stepStageKeys array.
          if (nodeIds.has(node.replace(/\[\]$/, ''))) continue;

          missing.push(node);
        }
      }

      for (const key of Object.keys(report)) {
        const isModelled = [`payload.report.${key}`, `payload.report.${key}[]`, `payload.report.${key}[].label`].some((id) => nodeIds.has(id));

        if (!BASE_FIELDS.has(key) && !isModelled) missing.push(`payload.report.${key}`);
      }

      t.equal('payload fields with no node', missing, []);
    });

    await dbTest('COVERAGE-12 every CTE the real statements use is a node', async (t) => {
      const workspace = await seedBaseline(context);
      const { page } = context;

      context.statements.length = 0;

      await context.runSync(workspace);
      await context.runDaily(workspace);
      await page.overview(workspace);
      await page.funnel(workspace);
      await page.categories(workspace, 'TRACK_PROGRAM');
      await page.categories(workspace, 'SOURCE');

      for (const metric of ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'DROP_OFF', 'MEDIAN_DAYS']) {
        await page.trends(workspace, metric);
      }

      const names = new Set(
        context.statements
          .filter(({ sql }) => sql.trimStart().startsWith('WITH'))
          .flatMap(({ sql }) => listCteNames(sql)),
      );
      const unmodelled = [...names].filter((name) => !nodeIds.has(`cte.${name}`) && !JOB_ONLY_CTE_NAMES.has(name));
      const unused = [...nodeIds]
        .filter((id) => id.startsWith('cte.'))
        .map((id) => id.slice('cte.'.length))
        .filter((name) => !names.has(name));

      t.ok('statements were read', names.size > 20, [...names]);
      t.equal('CTEs with no node', unmodelled, []);
      t.equal('nodes with no CTE', unused, []);
    });

    await dbTest('COVERAGE-13 every CRM column the facade reads is a node', async (t) => {
      const workspace = await seedBaseline(context);
      const facade = context.services.get('CrmAnalyticsFacadeService');
      const state = await facade.getCrmState(workspace.workspaceId);
      const sql = [
        facade.buildPersonRelationSql(state),
        facade.buildStageChangeRelationSql({ state, updatedSinceParameter: '$1', happenedSinceParameter: '$2' }),
        facade.buildApplicationSubmissionRelationSql(state),
      ].join('\n');
      const NODE_BY_ALIAS = { p: 'crm.person', t: 'crm.timelineActivity', s: 'crm.formSubmission', f: 'crm.crmForm' };
      const read = [...sql.matchAll(/\b([ptsf])\.(?:"([A-Za-z]+)"|([a-z]+))/g)].map(
        ([, alias, quoted, plain]) => `${NODE_BY_ALIAS[alias]}.${quoted ?? plain}`,
      );
      const ids = [...nodeIds];
      const modelled = (column) =>
        ids.some((id) => id === column) ||
        // Read through its JSON path.
        (column === 'crm.timelineActivity.properties' && ids.includes('crm.timelineActivity.properties.diff.stage')) ||
        // Identity and join keys of the submission relation, which define nothing further.
        ['crm.formSubmission.id', 'crm.formSubmission.formId', 'crm.crmForm.id'].includes(column);

      t.ok('columns were read', read.length > 10, read);
      t.equal('CRM columns with no node', [...new Set(read)].filter((column) => !modelled(column)), []);
    });
  },
};
