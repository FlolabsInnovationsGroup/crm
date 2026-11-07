# Seed data for CRM Analytics

Small, hand-designed test data: 77 invented people (66 in the main workspace, 11 across nine small workspaces), each tied to the use cases it proves. Every use case in `use-cases.json` must have a seed row and an assertion, or the run fails.

No production data is used or allowed. Query speed at production size is not measured here, on purpose.

## Commands

Run from the repository root. Needs the local Postgres (`docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db`).

```bash
# The test, through the suite. Writes analytics-work/test-results/latest-seed.json.
# --layer integration and --layer all run it too. About 2 minutes.
node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer seed

# The test alone, printing only what failed
node packages/twenty-utils/flolabs/analytics-tests/seed/seeded-metrics.test.mjs

# Load only: drop and recreate analytics_seed, run no job
node packages/twenty-utils/flolabs/analytics-tests/seed/load.mjs

# Later full local run: the Apple workspace in the local CRM database, after the fields exist
node packages/twenty-utils/flolabs/analytics-tests/seed/load.mjs --crm --i-am-local
```

## Safety

Every load refuses a database host other than `localhost` or `127.0.0.1`, before anything connects. Port and credentials are fixed in `load.mjs`, and the database it drops must be named `analytics_seed`, with an optional suffix through `ANALYTICS_SEED_DATABASE`. `--crm` also needs `--i-am-local`, a workspace named Apple and no more than 5,000 existing people. It writes only rows whose ID starts `5eed0001-` and that workspace's tracking start key, replaces them on the next load, and drops the `analytics` schema, because stored transitions are never rewritten.

## Files

| File | What it is |
|---|---|
| `use-cases.json` | The numbered use cases, each with its contract section |
| `seed-data.mjs` | People, timeline rows, submissions and the job plan, as tables with use case IDs and hand-calculated outcomes |
| `expected.mjs` | Every expected number, calculated in plain JavaScript from contract sections 5 and 6 and its "Decisions from testing". Imports nothing from the product |
| `load.mjs` | Loads the seed. Also the fixed clock |
| `use-case-checks.mjs` | One check per use case, with values worked out by hand |
| `seeded-metrics.test.mjs` | Runs the real sync, daily and metrics code, then compares |
| `difference-notes.mjs` | Which way a known difference leans, and corrections made to `expected.mjs` |

## How the test holds still

`analytics_seed` puts a `seed_clock.now()` first on its search path, so the product's own `now()` returns the seed's time, and rows become visible as that clock passes them. That is how a sync can run between two changes the CRM later merges, and why results repeat on any day. The fixed "now" is `2026-11-18T12:00:00Z`, tracking start is 100 days before it.

Only metadata, user variables, the queue and the workspace ORM are fakes. The config gets one reminder and one alias added, because the default has neither. Nothing else in it changes for the main run; single reads vary the zone, the minimum sample, the signed figure and the stage limits.

## Reading a difference

Each one lists both values and a `suspect`: product bug, bug in `expected.mjs`, or contract ambiguity. That is a lean, not a ruling, and the check still fails. Whoever rules a difference fine sets `isAccepted` on its note in `difference-notes.mjs`. `CORRECTED_IN_EXPECTED` lists readings changed after comparing, so they can be overruled.

Not compared, because the contract does not define them: `size` on trend points, labels.

## With `--crm`

It prints the job commands to run next. Ages run from the moment of loading and the clock keeps moving, so people placed exactly on a boundary (P011, P013, P035 to P037) read differently within minutes, and rows the seed merges around a sync appear in merged form. The server's config has no reminder or alias, so those two values show as Unmapped until they are added. Use it to see the page with varied data, not as a second source of expected numbers.
