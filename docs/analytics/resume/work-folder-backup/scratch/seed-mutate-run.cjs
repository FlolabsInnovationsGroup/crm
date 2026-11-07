// Sensitivity check only: each mutation is applied in memory by the preload. Does the
// seeded test notice a wrong rule, and through the use case meant to catch it?
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH = __dirname;
const REPO = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool';
const TEST = `${REPO}/packages/twenty-utils/flolabs/analytics-tests/seed/seeded-metrics.test.mjs`;
const METRICS = 'modules/analytics/services/crm-analytics-metrics.service.ts';
const SYNC = 'modules/analytics/services/crm-analytics-sync.service.ts';
const FACADE = 'modules/analytics/facade/crm-analytics-facade.service.ts';
const PERIODS = 'modules/analytics/utils/compute-crm-analytics-report-periods.util.ts';

const MUTATIONS = [
  { name: 'none', file: METRICS, from: 'const NONE_CATEGORY_KEY', to: 'const NONE_CATEGORY_KEY' },
  { name: 'reached at window end excluded', file: METRICS, from: 'r.next_at <= r.window_end)::int AS reached_next', to: 'r.next_at < r.window_end)::int AS reached_next' },
  { name: 'stuck at the limit', file: METRICS, from: 'a.days_in_stage > a.limit_days', to: 'a.days_in_stage >= a.limit_days' },
  { name: 'exit any time', file: METRICS, from: "t.to_kind = 'EXIT' AND t.happened_at >= r.entered_at AND t.happened_at <= r.window_end", to: "t.to_kind = 'EXIT' AND t.happened_at <= r.window_end" },
  { name: 'cursor moved by reconcile rows', file: SYNC, from: "max(source_updated_at) FILTER (WHERE origin = 'timeline')", to: 'max(source_updated_at)' },
  { name: 'reconcile ignores recent updates', file: SYNC, from: "WHERE p.updated_at < now() - interval '30 minutes'\n    AND COALESCE", to: 'WHERE COALESCE' },
  { name: 'reconcile compares raw values', file: SYNC, from: 'COALESCE(a.stage_key, l.to_stage) IS DISTINCT FROM COALESCE(b.stage_key, p.raw_stage)', to: 'l.to_stage IS DISTINCT FROM p.raw_stage' },
  { name: 'linked rows read', file: FACADE, from: 'AND t."targetPersonId" IS NOT NULL AND t."linkedRecordId" IS NULL', to: 'AND t."targetPersonId" IS NOT NULL' },
  { name: 'deleted submissions counted', file: FACADE, from: 'WHERE s."deletedAt" IS NULL AND f.name IN', to: 'WHERE f.name IN' },
  { name: 'reports per run 9', file: PERIODS, from: 'REPORTS_PER_RUN_LIMIT = 8', to: 'REPORTS_PER_RUN_LIMIT = 9' },
];

const only = process.argv[2];
const baselineFailures = new Set();

for (const mutation of MUTATIONS) {
  if (only && !mutation.name.includes(only) && mutation.name !== 'none') continue;

  const output = path.join(SCRATCH, 'seed-mutation.json');

  fs.rmSync(output, { force: true });

  const run = spawnSync(process.execPath, ['--max-old-space-size=1024', '--require', path.join(SCRATCH, 'seed-mutate-preload.cjs'), TEST], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ANALYTICS_TEST_OUTPUT_FILE: output, ANALYTICS_SEED_DATABASE: 'analytics_seed_sensitivity', SEED_MUTATION: JSON.stringify(mutation) },
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (run.status === 9 || !fs.existsSync(output)) {
    fs.appendFileSync(path.join(SCRATCH, 'seed-mutation-results.txt'), `${mutation.name}: DID NOT RUN status ${run.status} ${run.stderr.slice(0, 300)}\n`);
    continue;
  }

  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  const failed = report.results.filter((result) => result.status === 'FAIL').map((result) => result.id);

  if (mutation.name === 'none') {
    failed.forEach((id) => baselineFailures.add(id));
  }

  const added = failed.filter((id) => !baselineFailures.has(id));

  fs.appendFileSync(
    path.join(SCRATCH, 'seed-mutation-results.txt'),
    `${mutation.name}: failed ${failed.length}, new ${added.length}: ${added.slice(0, 12).join(' | ')}\n`,
  );
}

fs.appendFileSync(path.join(SCRATCH, 'seed-mutation-results.txt'), 'FINISHED\n');
