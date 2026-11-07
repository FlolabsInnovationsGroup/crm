'use strict';
// Scratch only, never committed. Proves the data flow tests notice real faults: every
// statement passes through a text replacement in memory, with no product file touched.
const path = require('node:path');

const BASE = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/packages/twenty-utils/flolabs/analytics-tests/dataflow';
const { createContext } = require(path.join(BASE, 'lib/context.cjs'));
const { createSuite, loadGraph } = require(path.join(BASE, 'lib/suite.cjs'));
const { createTestRunner } = require(path.join(BASE, 'lib/test-runner.cjs'));

const MUTATIONS = {
  'soft-deleted people stay in the person relation': {
    sections: ['metric-to-payload'],
    mutate: (sql) => sql.replace(/ WHERE p\."deletedAt" IS NULL/g, ' WHERE TRUE'),
  },
  'reached so far counts everybody': {
    sections: ['metric-to-payload'],
    mutate: (sql) => sql.replace('count(r.next_at)::int AS reached_so_far', 'count(*)::int AS reached_so_far'),
  },
  'exit outside the window still counts': {
    sections: ['storage-to-cte'],
    mutate: (sql) => sql.replace(" AND t.happened_at <= r.window_end", ''),
  },
  'local dates ignore the reporting zone': {
    sections: ['unit-consistency'],
    mutate: (sql) => sql.replace(/AT TIME ZONE (\$\d+)/g, "AT TIME ZONE COALESCE(NULL::text, 'UTC', $1::text)"),
  },
  'no-op moves are read as moves': {
    sections: ['unknown-values'],
    mutate: (sql) => sql.replace(' AND t.from_stage IS DISTINCT FROM t.to_stage', ''),
  },
  'linked rows reach the sync': {
    sections: ['crm-to-storage'],
    mutate: (sql) => sql.replace(' AND t."linkedRecordId" IS NULL', ''),
  },
  'the stuck limit is ignored': {
    sections: ['unknown-values'],
    mutate: (sql) => sql.replace(/a\.days_in_stage > a\.limit_days/g, 'a.days_in_stage >= 0'),
  },
  'a report stores a person name': {
    sections: ['taint'],
    mutate: (sql) =>
      sql.includes('INSERT INTO analytics.report')
        ? sql.replace('$6::jsonb', `($6::jsonb || jsonb_build_object('leak', 'TaintFirstQ7X'))`)
        : sql,
  },
  'the snapshot keeps the track row of a person twice': {
    sections: ['crm-to-storage'],
    mutate: (sql) => sql.replace("COALESCE(m.track_key, 'UNMAPPED')", "COALESCE(m.track_key, 'OTHER')"),
  },
  'position change also moves the source rows': {
    sections: ['forward-propagation'],
    only: /^FP-03/,
    mutate: (sql) => sql.replace(/COALESCE\(NULLIF\(p\.source, ''\), 'NONE'\)/, "COALESCE(NULLIF(p.positions[1], ''), 'NONE')"),
  },
};

// At the driver, so every service set and every read of a tapped statement sees it.
const installMutation = (pg, mutate) => {
  const original = pg.Client.prototype.query;

  pg.Client.prototype.query = function query(config, ...rest) {
    if (typeof config === 'string') return original.call(this, mutate(config), ...rest);
    if (typeof config?.text === 'string') config.text = mutate(config.text);

    return original.call(this, config, ...rest);
  };

  return () => {
    pg.Client.prototype.query = original;
  };
};

const main = async () => {
  const graph = loadGraph();
  const names = process.argv[2] ? Object.keys(MUTATIONS).filter((name) => name.includes(process.argv[2])) : Object.keys(MUTATIONS);

  for (const name of names) {
    const { sections, mutate, only } = MUTATIONS[name];
    const silent = console.log;
    const runner = createTestRunner({ onlyPattern: only, isQuiet: true });
    const context = await createContext();
    const restore = installMutation(context.loader.repoRequire('pg'), mutate);
    const suite = createSuite({ runner, context, graph });

    console.log = () => {};

    for (const section of sections) {
      await require(path.join(BASE, 'tests', `${section}.cjs`)).run(suite);
    }

    console.log = silent;
    restore();
    await context.close();

    const failed = runner.results.filter(({ status }) => status === 'FAIL');

    console.log(`${failed.length > 0 ? 'CAUGHT' : 'MISSED'} ${name}: ${failed.length} failed`);

    for (const { name: testName } of failed.slice(0, 4)) {
      console.log(`   ${testName.slice(0, 110)}`);
    }
  }

  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
