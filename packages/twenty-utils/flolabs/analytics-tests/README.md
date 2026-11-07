# CRM Analytics test suite

Permanent automated tests for the analytics tool. Run from the worktree root:

```bash
node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer <name>
```

| Layer | What it covers | Needs running | Takes |
|---|---|---|---|
| `unit-server` | Every spec under `packages/twenty-server/src/modules/analytics/`, plus `unit/server/` | Dependencies, `twenty-shared/dist` | About 2 min |
| `unit-front` | Every test under `packages/twenty-front/src/modules/crm-analytics/`, plus `unit/front/` | Also `twenty-ui/dist` | About 1 min |
| `integration` | Real SQL on real Postgres, real jobs and services, CRM tables built by the CRM's own column generator: contract section 9 sample, replay, merges, reconcile, snapshot, reports, off switch | Docker `db` container on `localhost:5432` | About 6 min |
| `blackbox` | The GraphQL API as a user calls it: login, refusals, bad input, section 7 shapes, section 6 identities on real responses | Local CRM server on `http://localhost:3000`, seeded | About 1 min |
| `ui` | Playwright browser journey: real-server paths, plus every section 8 state and rule against known numbers. Screenshots in light and dark | Server as above, front on `http://localhost:3001` | About 6 min |
| `merge-guard` | Seed and test data cannot reach `main`: simulates the clean branch, searches product code and the Docker startup path, tries the seed loader with a non-local host, runs the check on temporary commits. Creates no branch | Git only | About 1 min |
| `all` | Everything above, in that order | Whatever each needs | |

To start what they need, see contract section 9 "Local end to end":

```bash
docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db redis
```

`blackbox` and `ui` run on whatever the local CRM holds. Checks about numbers skip with the reason until the workspace is `READY` with people in it: see `seed/README.md` for loading data, then run a sync job.

## Results

Written to `../analytics-work/test-results/` (`ANALYTICS_TEST_RESULTS_DIR` overrides it):

- `latest-<layer>.json`: status, passed, failed, skipped, each failure's test name and message, duration.
- `latest-<layer>.log`: the raw output of that layer.
- `history.jsonl`: one line per run, with a timestamp.
- `screenshots/`: from the `ui` layer.

Exit code 0 means nothing failed. A missing prerequisite (database down, no CRM on the port, no browser) is `SKIPPED` with the exact reason. A layer is stopped at 8.5 minutes and reported as failed.

## Safety

This suite only ever talks to this machine, and that is enforced, not assumed:

- `lib/local-only.cjs` refuses any URL or database host other than `localhost` or `127.0.0.1`, and any database other than `analytics_proof`. The runner, the test files and the Playwright config all go through it, so starting one directly is refused too.
- Requests use `redirect: 'error'`, so an answer cannot lead one elsewhere.
- The browser starts with a rule that resolves no other host.
- `integration` connects only to `postgres` and `analytics_proof`, and drops and recreates `analytics_proof` on each run. It never opens the CRM's `default` database. Do not run it next to `../analytics-work/e2e/sql-proof`, which uses the same database.

Black-box and UI login is the local seed user `tim@apple.dev`, password the same. The `FORBIDDEN` checks use a seed user without `EXPORT_CSV`, so they need the full dev seed. On `--light` they skip and say so.

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
| `ANALYTICS_TEST_DATABASE` | `analytics_proof` | `analytics_proof` or `analytics_proof_<suffix>` |
| `ANALYTICS_TEST_ONLY` | | Regex for a quick rerun: test names, or check ids in `integration`, such as `^M` |

## Adding tests

- `integration/checks/`: one file per section. A check's expected numbers are counted by hand, never read from the output.
- `blackbox/*.test.mjs`: from contract section 7, no knowledge of the code. A check with nothing to look at skips with the reason.
- `ui/*.pw.ts`: by visible text and role, strings from contract section 8.
- `unit/server/*.unit.ts`, `unit/front/*.unit.tsx`: only for gaps in the specs beside the code. Suite files avoid the `.spec` and `.test` names so `packages/twenty-utils`'s own jest does not collect them.
