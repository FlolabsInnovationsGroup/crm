'use strict';
// Every sink flattened to path -> value, keyed by natural keys so two captures compare
// row by row. A forward propagation test states the whole expected difference.
const util = require('node:util');

// Clock readings, not data: they differ between any two captures.
const VOLATILE_KEYS = new Set([
  'asOf',
  'generatedAt',
  'lastSuccessfulSyncAt',
  'lastReconciliationAt',
  'lastAttemptAt',
]);

const computeRowKey = (row, personKeyOf) => {
  if (row === null || typeof row !== 'object') return undefined;
  if (row.personId !== undefined) return personKeyOf(row.personId);
  if (row.rowKey !== undefined) return row.rowKey;
  if (row.metricKey !== undefined) return row.metricKey;
  if (row.bucketStart !== undefined) return row.bucketStart;
  if (row.stageKey !== undefined) return row.stageKey;
  if (row.key !== undefined) return row.parentKey !== undefined ? `${row.parentKey ?? ''}/${row.key}` : row.key;

  return undefined;
};

const flattenInto = (flat, prefix, value, personKeyOf) => {
  if (Array.isArray(value)) {
    value.forEach((element, position) => {
      flattenInto(flat, `${prefix}[${computeRowKey(element, personKeyOf) ?? position}]`, element, personKeyOf);
    });

    return;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (!VOLATILE_KEYS.has(key)) flattenInto(flat, `${prefix}.${key}`, inner, personKeyOf);
    }

    return;
  }

  flat.set(prefix, value);
};

const flatten = (prefix, value, workspace) => {
  const flat = new Map();

  flattenInto(flat, prefix, value, (personId) => workspace.keyOf.get(personId) ?? personId);

  return flat;
};

const mergeMaps = (...maps) => new Map(maps.flatMap((map) => [...map.entries()]));

const toIso = (value) => new Date(value).toISOString();

const createSinkReader = ({ page, query }) => {
  const readTransitions = async (workspace) => {
    const rows = await query(
      `SELECT source_id, person_id, from_stage, to_stage, happened_at, source_updated_at, origin
       FROM analytics.stage_transition WHERE workspace_id = $1
       ORDER BY happened_at, source_updated_at, id`,
      [workspace.workspaceId],
    );
    const flat = new Map();

    for (const row of rows) {
      const key = `transitions[${workspace.keyOf.get(row.person_id) ?? row.person_id} ${row.from_stage}>${row.to_stage}]`;

      flat.set(`${key}.origin`, row.origin);
      flat.set(`${key}.sourceId`, row.source_id);

      // A reconcile row carries now(), which no capture can state.
      if (row.origin === 'timeline') {
        flat.set(`${key}.happenedAt`, toIso(row.happened_at));
        flat.set(`${key}.sourceUpdatedAt`, toIso(row.source_updated_at));
      }
    }

    return flat;
  };

  const readSnapshots = async (workspace) => {
    const rows = await query(
      `SELECT dimension, dimension_key, stage, person_count
       FROM analytics.daily_snapshot WHERE workspace_id = $1`,
      [workspace.workspaceId],
    );

    return new Map(
      rows.map((row) => [`snapshot.${row.dimension}[${row.dimension_key}|${row.stage}]`, row.person_count]),
    );
  };

  const readReports = async (workspace) => {
    const rows = await query(
      `SELECT period_type, period_start::text AS period_start, payload
       FROM analytics.report WHERE workspace_id = $1`,
      [workspace.workspaceId],
    );

    return mergeMaps(
      ...rows.map((row) =>
        flatten(`reports.${row.period_type}.${row.period_start}`, row.payload, workspace),
      ),
    );
  };

  const readPages = async (workspace) => {
    const trendMaps = [];

    for (const metric of ['NEW_APPLICATIONS', 'TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT', 'OVERALL_CONVERSION', 'DROP_OFF', 'MEDIAN_DAYS']) {
      const trends = await page.trends(workspace, metric);

      trendMaps.push(flatten(`trends.${metric}.series`, trends.series, workspace));

      // Cohorts and movement do not depend on the metric, so one copy says it all.
      if (metric === 'NEW_APPLICATIONS') {
        trendMaps.push(flatten('trends.cohorts', trends.cohorts, workspace));
        trendMaps.push(flatten('trends.movement', trends.movement, workspace));
      }
    }

    return mergeMaps(
      flatten('overview', await page.overview(workspace), workspace),
      flatten('funnel', await page.funnel(workspace), workspace),
      flatten('categoriesTrack', await page.categories(workspace, 'TRACK_PROGRAM'), workspace),
      flatten('categoriesSource', await page.categories(workspace, 'SOURCE'), workspace),
      flatten('meta', await page.meta(workspace), workspace),
      ...trendMaps,
    );
  };

  // Everything but the frozen reports, which only a separate diff looks at.
  const capture = async (workspace) =>
    mergeMaps(
      await readTransitions(workspace),
      await readSnapshots(workspace),
      await readPages(workspace),
    );

  return { capture, readPages, readReports, readSnapshots, readTransitions };
};

// Two workspaces seeded alike differ only in generated ids, so one reference capture can
// stand as the "before" of many scenarios.
const normalizeCapture = (capture, workspace) =>
  new Map(
    [...capture.entries()].map(([key, value]) => {
      if (key.endsWith('.personId')) return [key, workspace.keyOf.get(value) ?? value];
      if (key.startsWith('transitions[') && key.endsWith('.sourceId')) return [key, value !== null];

      return [key, value];
    }),
  );

const diffCaptures = (before, after) => {
  const difference = {};

  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const beforeValue = before.get(key);
    const afterValue = after.get(key);

    if (!util.isDeepStrictEqual(beforeValue, afterValue)) {
      difference[key] = [beforeValue, afterValue];
    }
  }

  return difference;
};

// Names each path that moved and should not have, and each that should have and did not.
const assertDifference = (t, label, actual, expected) => {
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) {
      t.fail(`${label}: ${key} should change ${util.inspect(expected[key])} but stayed`);
    } else if (!util.isDeepStrictEqual(actual[key], expected[key])) {
      t.fail(`${label}: ${key} expected ${util.inspect(expected[key])}, got ${util.inspect(actual[key])}`);
    }
  }

  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      t.fail(`${label}: ${key} must not change, moved ${util.inspect(actual[key])}`);
    }
  }
};

module.exports = {
  assertDifference,
  createSinkReader,
  diffCaptures,
  flatten,
  mergeMaps,
  normalizeCapture,
  toIso,
};
