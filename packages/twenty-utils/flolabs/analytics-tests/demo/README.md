# Demo data for CRM Analytics

About 150 invented applications for showing the tool: realistic names, example.com emails, 26 weeks of history that gets busier toward now. It is repeatable, and the size is `DEMO_APPLICATION_COUNT` in `generate.mjs`. Not for testing: `seed/` holds the numbers tied to tests.

## Commands

Run from the worktree root, with Docker's `db` and `redis` up, and the server and worker started through `../analytics-work/e2e/local-run/crm.cjs`, which adds the reminder value to the config.

```bash
# 1. Add the options the demo needs to the Stage, Positions and Source fields. Needs the server.
node ../analytics-work/e2e/local-run/setup-seed-objects.mjs

# 2. Replace earlier demo and seed people, soft delete everyone else, set tracking start, drop the analytics schema.
node packages/twenty-utils/flolabs/analytics-tests/demo/load.mjs --i-am-local --stage people

# 3. First sync. It creates the analytics schema. Wait for the worker to finish it.
node ../analytics-work/e2e/local-run/crm.cjs command crm-analytics:run --workspace-id 20202020-1c25-4d02-bf25-6aeccf7ea419 --job sync

# 4. Backfill analytics.daily_snapshot up to yesterday, and clear reports built before it.
node packages/twenty-utils/flolabs/analytics-tests/demo/load.mjs --i-am-local --stage snapshots

# 5. Daily job: today's snapshot and the reports.
node ../analytics-work/e2e/local-run/crm.cjs command crm-analytics:run --workspace-id 20202020-1c25-4d02-bf25-6aeccf7ea419 --job daily
```

`node generate.mjs` prints counts per stage, track, source and week. `node fields.mjs` prints the option values as JSON.

## Safety

Refuses a database host other than `localhost` or `127.0.0.1` before connecting. Port, credentials and the database name `default` are fixed. It also needs `--i-am-local`, a workspace named Apple and no more than 5,000 existing people. Rows it writes have IDs starting `de300001-`.

## What to expect

- Overall conversion only counts people older than 90 days, so about 50 people carry it, and each track and source is under the minimum sample of 30. Those rates draw lighter, as they should. Raise the size to see them solid.
- 8 imported people have no source and no application, so a "None" source row is correct.
- `ON_HOLD` and `WAITLIST` show as Unmapped on purpose.
- `CONTACTED_REMINDER` only nests under Contacted when the server runs through `crm.cjs`. Otherwise it shows as Unmapped too.
