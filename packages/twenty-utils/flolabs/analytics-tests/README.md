# CRM Analytics test suite

Permanent automated tests for the analytics tool. Run from the worktree root:

```bash
node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <name>
```

| Layer | What it covers | Needs running | Takes |
|---|---|---|---|
| `unit-server` | Every spec under `packages/twenty-server/src/modules/analytics/`, plus `unit/server/` | Dependencies, `twenty-shared/dist` | 3 min, up to 8 on a busy machine |
| `unit-front` | Every test under `packages/twenty-front/src/modules/crm-analytics/`, plus `unit/front/` | Also `twenty-ui/dist` | 1 to 2 min |
| `integration` | Real SQL on real Postgres, real jobs and services, CRM tables built by the CRM's own column generator: contract section 9 sample, replay, merges, reconcile, snapshot, reports, off switch. Run on its own it also runs `seed` and the server part of `dataflow` | Docker `db` container on `localhost:5432` | About 7 min |
| `seed` | The 77-person seed through the real code, against numbers worked out by hand. See `seed/README.md` | Same | About 2 min |
| `dataflow` | Every step of the data flow graph, CRM to page. See `dataflow/DATAFLOW.md` | Same | About 6 min |
| `blackbox` | The GraphQL API as a user calls it: login, refusals, API keys, a role without `EXPORT_CSV` (P10), bad input, section 7 shapes, section 6 identities on real responses. Makes one API key and one role on the local CRM, and removes both | Local CRM server on `http://localhost:3000`, seeded | About 1 min |
| `live` | Contract T1 to T11, on real rows from the real CRM write path, through to stored transitions, plus the off switch (P5) and stale state (P6). Makes its own people and removes them. T8, T10 and T11 say "record what happens": see `timeline-observations.json` | Server and worker running, Docker `db` and `redis`, a Stage field on People | About 1 to 3 min |
| `boot` | Contract P12: server, worker and both commands start from the real build, on port 3100, with no boot error, a whole schema and both crons registered. Skips one check, saying so, when the build is older than the source | `packages/twenty-server/dist`, `.env` on local hosts, Docker `db` and `redis` | About 5 min, 1 GB at a time |
| `ui` | Playwright browser journey: real-server paths, off switch and stale banner on the real page (P5, P6), a role without `EXPORT_CSV` (P10), People, person, Team inbox, Notifications and Form builder still load (P12), plus every section 8 state and rule against known numbers. Screenshots in light and dark | Server as above, front on `http://localhost:3001`. The P5 and P6 pages also need the worker | About 6 min |
| `merge-guard` | Seed and test data cannot reach `main`: simulates the clean branch, searches product code and the Docker startup path, tries the seed loader with a non-local host, runs the check on temporary commits. Creates no branch | Git only | About 1 min |
| `all` | Everything above in that order, `seed` once, inside `integration` | Whatever each needs | |

Not in `all`, because it takes minutes per defect: `mutation/run.mjs`, below.

To start what they need, see contract section 9 "Local end to end":

```bash
docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db redis
```

`blackbox` and `ui` run on whatever the local CRM holds. Checks about numbers skip with the reason until the workspace is `READY` with people in it: see `seed/README.md` for loading data, then run a sync job. Their real screenshots are named `<scheme>-real-*.png`; the others use known numbers.

## A pass and a skip are different results

| Status | Means |
|---|---|
| `PASSED` | Every check ran and passed |
| `PARTIAL` | Some ran and passed, others could not run. Each reason is printed. Not a clean result |
| `SKIPPED` | Nothing could run, with the reason |
| `FAILED` | At least one check failed |

Exit code 0 means nothing failed. Add `--strict`, or set `ANALYTICS_TEST_STRICT=1`, to also exit 1 on `PARTIAL` or `SKIPPED`. The run before a merge uses it, because a check that did not run has proved nothing.

## Results

Written to `../analytics-work/test-results/` (`ANALYTICS_TEST_RESULTS_DIR` overrides it):

- `latest-<layer>.json`: status, passed, failed, skipped, each failure's test name and message, duration.
- `latest-<layer>.log`: the raw output of that layer.
- `history.jsonl`: one line per run, with a timestamp.
- `screenshots/`: from the `ui` layer.

A missing prerequisite (database down, no CRM on the port, no browser) is `SKIPPED` with the exact reason. A layer is stopped at 8.5 minutes and reported as failed.

## Do the tests catch mistakes?

```bash
node packages/twenty-utils/flolabs/analytics-tests/mutation/run.mjs --target <unit-server|unit-front|dataflow>
```

Plants the defects in `mutation/mutants.cjs` one at a time and runs the tests that should catch each, after confirming those tests pass clean. The change is made in memory as a file loads: product code on disk is never touched. Results are in `mutation-<target>.json`, with which test caught what. `SURVIVED` is a hole in the tests, `CODE_CHANGED` means the text to change is gone, so update the mutant. Add `--only <regex>`, or `--time-limit-minutes <n>`, default 30. The dataflow target runs the layer once per defect, about 5 minutes each. The graph in `dataflow/dataflow-graph.json` only shows that every edge is exercised, so this is the evidence that the tests on those edges are right.

## Safety

This suite only ever talks to this machine, and that is enforced, not assumed:

- `lib/local-only.cjs` refuses any URL or database host other than `localhost` or `127.0.0.1`, and any database other than `analytics_proof`. The runner, the test files and the Playwright config all go through it, so starting one directly is refused too.
- Requests use `redirect: 'error'`, so an answer cannot lead one elsewhere.
- The browser starts with a rule that resolves no other host.
- `integration` connects only to `postgres` and `analytics_proof`, and drops and recreates `analytics_proof` on each run. It never opens the CRM's `default` database. Do not run it next to `../analytics-work/e2e/sql-proof`, which uses the same database.
- `live` and `boot` do open the local `default` database and Redis, to read results and do the backdating section 9 asks for. They refuse any other host or database name before connecting, need a workspace named Apple, and refuse one holding over 5,000 people. `boot` also refuses a server `.env` that points elsewhere.
- `live` and the P5 and P6 pages change the real local CRM while they run, so do not use the CRM by hand during them. They put back what they change.

Black-box and UI login is the local seed user `tim@apple.dev`, password the same. The `FORBIDDEN` checks give `phil.schiler@apple.dev` a role made for the test and put his role back, so they run on either dev seed.

## Merging

This folder and `docs/analytics/research/` stay on `analytics_tool` (`merge-guard/excluded-from-main.json`). Merge from the clean branch, never from `analytics_tool`:

```bash
node packages/twenty-utils/flolabs/analytics-tests/merge-guard/prepare-merge.mjs
```

It makes the local branch `analytics_tool_merge` from the committed work, as one commit on the point where `analytics_tool` left `origin/main`, so no older commit holding seed files can come along, whichever merge button is used. It then runs `merge-guard/check-before-merge.mjs --ref analytics_tool_merge`. It never pushes and never touches `main` or the working copy. `.github/workflows/flolabs-analytics-merge-guard.yml` repeats the path check on pull requests to `main`, with the list inline because that branch has no copy of this folder. The steps around it are in `docs/analytics/THINGS-TO-DO-BEFORE-MERGE.md`.

## Settings

| Variable | Default | |
|---|---|---|
| `ANALYTICS_TEST_API_URL` | `http://localhost:3000` | Local hosts only |
| `ANALYTICS_TEST_FRONT_URL` | `http://localhost:3001` | Local hosts only. A front served by the server loads faster |
| `ANALYTICS_TEST_PG_HOST`, `_PORT`, `_USER`, `_PASSWORD` | `localhost`, `5432`, `postgres`, `postgres` | Local hosts only |
| `ANALYTICS_TEST_REDIS_HOST`, `_PORT` | `localhost`, `6379` | `live` and `boot`. Local hosts only |
| `ANALYTICS_TEST_BOOT_PORT` | `3100` | `boot`, beside a CRM already on 3000 |
| `ANALYTICS_TEST_DATABASE` | `analytics_proof` | `analytics_proof` or `analytics_proof_<suffix>` |
| `ANALYTICS_TEST_ONLY` | | Regex for a quick rerun: test names, or check ids in `integration`, such as `^M` |

## Adding tests

- `integration/checks/`: one file per section. A check's expected numbers are counted by hand, never read from the output.
- `blackbox/*.test.mjs`: from contract section 7, no knowledge of the code. A check with nothing to look at skips with the reason, which shows as `PARTIAL`.
- `live/*.test.mjs`: real changes through the real API, real rows read back. A check makes its own people.
- `mutation/mutants.cjs`: a defect someone could really make. When one survives, add the test that catches it.
- `ui/*.pw.ts`: by visible text and role, strings from contract section 8.
- `unit/server/*.unit.ts`, `unit/front/*.unit.tsx`: only for gaps in the specs beside the code. Suite files avoid the `.spec` and `.test` names so `packages/twenty-utils`'s own jest does not collect them.
