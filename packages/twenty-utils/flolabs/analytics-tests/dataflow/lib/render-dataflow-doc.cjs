'use strict';
// DATAFLOW.md is generated from the graph, so the two cannot drift.
const GROUPS = [
  ['crm', 'CRM tables'],
  ['facade', 'Facade relations'],
  ['mapping-and-settings', 'Mapping constant and settings'],
  ['job', 'Sync, reconcile, snapshot and report jobs'],
  ['storage', 'Analytics tables'],
  ['api-input', 'Filter and query arguments'],
  ['cte', 'CTEs'],
  ['metric', 'Metrics'],
  ['payload', 'GraphQL payload'],
  ['ui', 'UI components'],
];

const CTE_FAMILIES = {
  'mapping CTEs': ['stage_map', 'position_map', 'funnel_stage'],
  'base CTEs': ['crm_person', 'scope', 'transition', 'first_move', 'cohort', 'arrival', 'person_step', 'mapped_mover'],
  'funnel CTEs': ['funnel_group', 'step_row', 'step_exit', 'step_total', 'overall_row', 'overall_total'],
  'stay CTEs': ['stay_event', 'ordered_event', 'kept_event', 'stay', 'completed_stay'],
  'stage clock CTEs': ['latest_entry', 'moved_person', 'stage_clock', 'stage_age'],
  'category CTEs': ['person_position', 'category_member'],
  'movement CTEs': ['period_move', 'entered_total', 'left_total', 'current_total'],
  'snapshot CTEs': ['snapshot_day', 'bucket_day', 'matching_row'],
  'submission CTE': ['submission'],
};

const METRIC_FAMILIES = {
  'current state': ['totalContacts', 'activePeople', 'signedPeople', 'importedApplications', 'importedExcludedByDate', 'stageTotals', 'stuckList', 'stuckPeople', 'inactivePeople', 'stuckByStage'],
  'new applications': ['newApplications'],
  'funnel step': ['entered', 'eligible', 'reachedNext', 'exited', 'timedOut', 'inWindow', 'stepRate', 'soFarRate', 'dropOffRate', 'isUnderMinimum', 'lowestStep', 'cohortSize', 'cohortExcludedUnmapped'],
  'stage duration': ['medianDays', 'completedStays'],
  'overall conversion': ['overallEligible', 'overallReached', 'overallRate', 'overallSoFarRate'],
  'category rows': ['categoryPeople', 'categoryNewApplications', 'categoryRates', 'categoryOverlap', 'categoryRows'],
  'cohort table': ['cohortTable'],
  'trend lines': ['trendOverallConversion', 'trendDropOff', 'trendNewApplications', 'trendSnapshot', 'trendMedianDays', 'trendBuckets', 'trendSeries'],
  'movement and comparisons': ['movement', 'comparisons'],
  'sync and page state': ['syncState', 'pageState', 'queryContext'],
};

const findFamily = (families, name) =>
  Object.entries(families).find(([, members]) => members.includes(name))?.[0] ?? name;

// The diagram folds columns into tables and fields into payload parts. The JSON has each.
const foldNode = (id) => {
  const parts = id.replace(/\[\]/g, '').split('.');

  switch (parts[0]) {
    case 'facade':
      return { id: `facade.${parts[1]}`, label: parts[1] };
    case 'analytics':
      return { id: `analytics.${parts[1]}`, label: `analytics.${parts[1]}` };
    case 'core':
      return { id: 'core.keyValuePair', label: 'core.keyValuePair' };
    case 'cte': {
      const family = findFamily(CTE_FAMILIES, parts[1]);

      return { id: `cte.${family}`, label: (CTE_FAMILIES[family] ?? [family]).join(', ') };
    }
    case 'metric': {
      const family = findFamily(METRIC_FAMILIES, parts[1]);

      return { id: `metric.${family}`, label: family };
    }
    case 'api':
      return { id: 'api.input', label: 'filter and query arguments' };
    case 'config':
      return ['stages', 'tracks'].includes(parts[1])
        ? { id, label: `CRM_ANALYTICS_CONFIG.${parts[1]}` }
        : { id: 'config.other', label: 'other config values' };
    case 'sync':
      return { id: parts[1] === 'latest' ? 'sync.readTimeline' : id, label: parts[1] === 'latest' ? 'readTimeline' : parts[1] };
    case 'job':
      return { id: 'job', label: 'sync and daily jobs' };
    case 'report':
      return { id: 'report.builder', label: 'report builder and periods' };
    case 'payload': {
      const part = parts[1] === 'base' || parts[1] === 'reports' || parts[1] === 'report' || parts.length === 3 ? parts[1] : `${parts[1]}.${parts[2]}`;

      return { id: `payload.${part}`, label: part };
    }
    case 'ui':
      return { id, label: parts[1] };
    default:
      return { id, label: parts.slice(1).join('.') };
  }
};

const mermaidId = (id) => id.replace(/[^A-Za-z0-9]/g, '_');

const renderMermaid = (graph) => {
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const groups = new Map(GROUPS.map(([kind]) => [kind, new Map()]));
  const links = new Set();

  for (const { from, to } of graph.edges) {
    const foldedFrom = foldNode(from);
    const foldedTo = foldNode(to);

    groups.get(kindOf.get(from)).set(foldedFrom.id, foldedFrom.label);
    groups.get(kindOf.get(to)).set(foldedTo.id, foldedTo.label);

    if (foldedFrom.id !== foldedTo.id) {
      links.add(`  ${mermaidId(foldedFrom.id)} --> ${mermaidId(foldedTo.id)}`);
    }
  }

  const subgraphs = GROUPS.flatMap(([kind, title]) => [
    `  subgraph group_${kind.replace(/-/g, '_')}["${title}"]`,
    ...[...groups.get(kind).entries()].sort().map(([id, label]) => `    ${mermaidId(id)}["${label}"]`),
    '  end',
  ]);

  return ['```mermaid', 'flowchart LR', ...subgraphs, ...[...links].sort(), '```'].join('\n');
};

const renderEdgeTable = (graph) => {
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const titleOf = new Map(GROUPS);
  const rows = new Map();

  for (const edge of graph.edges) {
    const key = `${kindOf.get(edge.from)}>${kindOf.get(edge.to)}`;
    const row = rows.get(key) ?? { from: kindOf.get(edge.from), to: kindOf.get(edge.to), ids: [], sample: edge };

    row.ids.push(edge.id);
    rows.set(key, row);
  }

  const lines = [...rows.values()].map(({ from, to, ids, sample }) => {
    return `| ${titleOf.get(from)} | ${titleOf.get(to)} | ${ids.length} | ${ids[0]} | \`${sample.field}\`: ${sample.use} |`;
  });

  return ['| From | To | Edges | First id | Example |', '|---|---|---:|---|---|', ...lines].join('\n');
};

const renderDataflowDoc = (graph) => `# CRM Analytics data flow

What this layer tests: each value is followed from where it is defined to everywhere it is used, so one that gets lost, altered or leaked fails a test.

- \`dataflow-graph.json\` is the machine-readable graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, each edge with its id, the field defined at the source, and its use.
- Every edge has a test named with its id. \`tests/graph-coverage.cjs\` fails if one has none, if a test names an unknown edge, or if a stored column, payload field or CTE has no node.
- Run it: \`node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer dataflow\`. Local Postgres only, on a database of its own for each run, dropped at the end.

This file is generated from the graph by \`lib/render-dataflow-doc.cjs\`, and the coverage test fails when it is out of date. To regenerate: \`node packages/twenty-utils/flolabs/analytics-tests/dataflow/lib/render-dataflow-doc.cjs --write\`.

## Other tests here

| Prefix | What it proves |
|---|---|
| \`FP-\` | Forward propagation. One input changes; the whole difference across every sink is stated, so anything else that moves fails |
| \`TAINT-\` | Sentinels in names, emails, phones and form answers reach no analytics column and no payload, except the stuck list's live display name |
| \`UNIT-\` | \`happened_at\` stays a UTC instant, local dates only make buckets, rates stay fractions until the UI, counts stay integers |
| \`UNKNOWN-\` | An unmapped stage reaches the Unmapped row, never a funnel step. Too-recent people reach inWindow, never a failure count |
| \`FILTER-\` | A filter reaches every view of a tab, stored counts included. A bad value stops before any SQL |
| \`PATH-\` | Real payloads from Postgres rendered by the real components: a value followed from a CRM row to the text on the screen |
| \`COVERAGE-\` | The graph, the tests and the code have not drifted apart |

## Graph

Columns are folded into tables, and CTEs, metrics and payload fields into families, so it can be read. The JSON has each one.

${renderMermaid(graph)}

## Edges

${renderEdgeTable(graph)}
`;

if (require.main === module && process.argv.includes('--write')) {
  const fs = require('node:fs');
  const path = require('node:path');
  const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dataflow-graph.json'), 'utf8'));

  fs.writeFileSync(path.join(__dirname, '..', 'DATAFLOW.md'), renderDataflowDoc(graph));
}

module.exports = { renderDataflowDoc };
