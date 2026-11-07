# Resume here: CRM Analytics tool

Paused on 2026-11-07 at about 20:00 Pakistan time because the user had to close the chat. This file says where every workflow stopped and how to restart from that exact point. `CLAUDE.md` holds the full project background and the contract (`docs/analytics/contract.md`) holds the build details. **Read this file first, then the "CRM Analytics tool: project state" section of `CLAUDE.md`.**

Nothing was lost. All code is committed on the local branch `analytics_tool`. It was pushed to `origin/analytics_tool` at the user's request on 2026-11-08 at 00:05, at commit `8f6f06d4`. Anything after that stays local until the user says to push again. Never `main`.

**Latest, 2026-11-07 at 23:45: the user asked for a graph-first redesign. Read `docs/analytics/dashboard-redesign.md` first; sections 2 to 7 below are older.** The test workflows are stopped on purpose. The redesign workflow is `analytics-dashboard-redesign`, run ID `wf_02bed1f5-875`, script at `docs/analytics/resume/workflows/analytics-dashboard-redesign.js`. The PDF report workflow is `analytics-report-pdf`, run ID `wf_3a40b86a-b1f`, script at `docs/analytics/resume/workflows/analytics-report-pdf.js`. **After both finish and the type check is done, run the final step the user asked for: a large code review, with many Opus agents at max effort, of all code changed on this branch against `origin/main`, with findings checked by independent agents before fixing.** Method, the user's idea (2026-11-08): one planner agent maps the changed code and gives each reviewer one module or function, with its file and line numbers and who calls it. Each reviewer checks that piece and follows it through its callers and what it calls, instead of reading everything. Reviewers share findings through one notes file, so they can see their neighbours' work. A few extra agents trace whole paths across pieces, such as filter to SQL to chart. Then other agents try to disprove each finding, and one pass fixes what survives. Keep it to under an hour. The user also approved pushing the redesign and PDF to `analytics_tool` once they are finished, in their words: "Yes, when finished". Never `main`. If the chat closes first, check their `journal.jsonl` in the session's `subagents/workflows/` folder and `git status`, because agents do not commit.

**Restarted on 2026-11-07 at 21:50.** The five workflows in section 3 are running: backend `wf_82d28687-032`, UI `wf_00e66097-be6`, tests `wf_24060795-bfa`, data flow `wf_02f3a634-e5f`, seed `wf_00006db9-6bb`. If the chat closes before they report, first check what finished in each run's `journal.jsonl` under `C:\Users\Ahsan\.claude\projects\D--Coding-Flolabs-crm\80ecf43a-baa7-43f2-95f1-efcb443943ff\subagents\workflows\<run id>\`, and in `git status`, since agents do not commit. In this same session, `Workflow({scriptPath, resumeFromRunId})` with these run IDs returns finished agents from cache. In a new chat, rerun the continuation scripts after removing any step already finished.

## 1. How to restart

**The user:** start Docker Desktop, close Chrome, open a new chat in `D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool` and send:

> Read RESUME.md and CLAUDE.md, then continue the CRM Analytics build from where it stopped. Start the workflows in RESUME.md section 3.

That sentence also counts as the opt-in the Workflow tool needs, so Ultracode does not have to be on.

**The new chat, before launching anything:**

1. Confirm you are on `analytics_tool` in the worktree, the tree is clean, and the latest commit matches section 9. Never work in `D:\Coding\Flolabs\crm`: that is `automations_branch` with an empty git index.
2. Run `docker ps`. `twenty-dev-db-1` and `twenty-dev-redis-1` must be up. If not, run `docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db redis`. If Docker itself is not running, ask the user to start it.
3. Check memory and disk. **C: fell from 8 GB to under 0.3 GB free at the pause,** most likely because the Windows page file grew to 17.7 GB under memory pressure, with only 2 GB of it in use. A restart should shrink it. If C: has under 3 GB free, ask the user to restart the PC and close games and other heavy apps before launching anything. D: had about 4 GB. Free memory also fell to 0.6 GB with five agents and Chrome (4.2 GB) open, so ask the user to keep Chrome closed. Then start this watcher with `run_in_background`, and tell the user if it fires:
   ```bash
   while true; do free=$(df --output=avail -k /c | tail -1 | tr -d ' '); commit=$(powershell.exe -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB,1)" 2>/dev/null | tr -d '\r'); if [ "$free" -lt 524288 ]; then echo "CRITICAL DISK C: free KB $free, commit free GB $commit"; break; fi; low=$(python -c "print(1 if float('${commit:-9}')<0.5 else 0)"); if [ "$low" = "1" ]; then echo "CRITICAL MEMORY commit free GB $commit, C free KB $free"; break; fi; sleep 60; done
   ```
4. Confirm `D:\Coding\Flolabs\crm\.claude\worktrees\analytics-work` still exists, since every workflow reads `brief.md` and `contract.md` there and writes test results there. If it is gone, recreate it from section 9.

## 2. Where each workflow stopped

Stopped by hand at about 19:52 with `TaskStop`, because closing the chat would have ended them anyway. Agents that were cut off left their file edits in place but returned no report. The original scripts are in `docs/analytics/resume/workflows/originals/`.

| Workflow | Run ID | Finished steps | Stopped during | Next step |
|---|---|---|---|---|
| Research and contract | `wf_1185f5ea-65a` | All | Finished | None |
| Integration (five existing files) | `wf_1c810e29-9f0` | Writer and separate reviewer, approved | Finished | None. Committed one per file |
| Merge guard | `wf_9d57b112-8f7` | All | Finished | None |
| SQL proof | `wf_182ab2dc-c6d` | All | Finished | Rerun results are in section 5 |
| **Backend** `analytics-backend` | `wf_3a38ec46-0e1` | `backend-foundation`, `backend-pipeline`, `backend-metrics-api`, `backend-review-1`, `backend-fix-1` | `backend-review-2`: 52 tool calls, read-only, no result | `analytics-backend-continue.js`: known fix, then review 2, fix 2, review 3 |
| **UI** `analytics-ui` | `wf_f8080ac4-839` | `ui-foundation`, `ui-funnel-categories`, `ui-trends-reports`, `ui-review-1`, `ui-fix-1` | `ui-review-2`: 167 tool calls, read-only, no result | `analytics-ui-continue.js`: review 2, fix 2, review 3, minor findings |
| **Tests** `analytics-tests` | `wf_b46b544a-bc6` | None returned. The suite is written and runs | First `test-author`: 233 tool calls, finishing touches. The run and evaluate loop never started | `analytics-tests-continue.js`: finish the author step, then the loop |
| **Data flow** `analytics-dataflow-tests` | `wf_36b878c6-b01` | None returned. Graph and tests are written | `dataflow-tests`: 204 tool calls, checking that tests catch planted defects | `analytics-dataflow-continue.js` |
| **Seed** `analytics-seed-data-small` | `wf_28e7e089-6d7` | None returned. 77 people and all use cases are written | `seed-data-small`: 124 tool calls, polishing the README | `analytics-seed-continue.js` |
| Large seed | `wf_7e384414-b5b` | Replaced, the user asked for small data | Stopped | None |

Nothing was left half-edited that I could find: the unit tests and merge guard were rerun after the stop (section 5).

## 3. What to launch

Launch these five together with the Workflow tool. That is at most 5 agents at once, under the limit of 6. They work in any chat, because each one is the original script with the finished steps removed and the current state written into its prompt. A dry run with fake agents confirmed each one parses and reaches the right steps.

```text
Workflow({ scriptPath: "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/docs/analytics/resume/workflows/analytics-backend-continue.js" })
Workflow({ scriptPath: "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/docs/analytics/resume/workflows/analytics-ui-continue.js" })
Workflow({ scriptPath: "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/docs/analytics/resume/workflows/analytics-tests-continue.js" })
Workflow({ scriptPath: "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/docs/analytics/resume/workflows/analytics-dataflow-continue.js" })
Workflow({ scriptPath: "D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool/docs/analytics/resume/workflows/analytics-seed-continue.js" })
```

What each does:

- **Backend:** `backend-known-fixes` makes `readTrendValues` return null before tracking start. Then up to two review and fix rounds, stopping when a review finds nothing serious.
- **UI:** up to two review and fix rounds, then `ui-fix-minors` for the 19 minor findings in `analytics-work/test-results/ui-review-1.md`, the "-0 points" in the trend table, and Lingui for server-built labels.
- **Tests:** finishes the suite, then repeats: Haiku runs every layer, Sonnet separates real bugs from bad tests and appends bugs to `analytics-work/test-results/bugs.md`, Opus corrects tests, Haiku waits for code to change. It ends after 40 rounds or 8 idle waits of about 10 minutes each. It never edits product code. Stop it with `TaskStop` when the local run is over, not before. The loop runs `unit-server`, `unit-front`, `integration` (which includes seed and data flow), `blackbox` and `ui`. The merge guard runs only on demand, with `--layer merge-guard`.
- **Data flow and Seed:** one agent each to finish the known failures in section 5. Their layers already exist in `run-tests.mjs`, so neither needs to edit that file.

Do not stop a running agent without asking the user. Agents do not commit; the main session does.

**If the same chat is reopened instead:** the same scripts work. `resumeFromRunId` only works in the original session and would rerun the first `test-author` with its old "build the suite" prompt, so do not use it.

## 4. Fixes

**Already in the code, from `backend-fix-1`:**

- **Soft-deleted applications (T8):** new applications counted a soft-deleted person's applications when no filter was set. `buildApplicationSubmissionRelationSql` now left-joins person, keeping applications with no person.
- **Query speed:** `enable_nestloop` and `jit` are off on analytics connections only, in `crm-analytics-database.service.ts`. At 43,000 moves Overview took 643 ms, the monthly conversion trend 419 ms, and the daily job 13 s.

**Still to do, already written into the continuation scripts:**

- `readTrendValues` returns null, not 0, for new applications before tracking start (`backend-known-fixes`).
- Review 1 minor findings and "-0 points" (`ui-fix-minors`).
- Server-built English labels mapped to Lingui on the front (`ui-fix-minors`).
- Data flow test FP-06 and the nine seed failures (section 5).

**Still to do, in the main session:**

- `analytics-work/e2e/sql-proof/lib/try-fixes.cjs`: its facade block would now join person twice if `PROOF_TRY_FIXES=1` were set. Remove the block.
- `analytics-work/e2e/RESULTS.md`: its opening paragraph is hand-written and still describes the run before the fixes (128 passed, 3 failed). Update it. The current result is in `e2e/sql-proof/last-run.json`: 122 passed, 0 failed, 9 not run.

## 5. Tests at the pause

Fresh runs after the workflows stopped, on the final code of this pause:

| Layer | Passed | Failed | Notes |
|---|---|---|---|
| `unit-server` | 351 | 0 | Rerun at the pause |
| `unit-front` | 164 | 0 | Rerun at the pause |
| `merge-guard` | 40 | 0 | Rerun at the pause, including the new exclusions |
| SQL proof | 122 | 0 | Rerun on the committed code. The 9 large-volume checks are off by default and were not run; `backend-fix-1` reported them passing on a scratch copy. Output: `analytics-work/e2e/sql-proof/last-run.json` |
| `integration` | 314 | 9 | 19:37, before the stop. Same 9 as seed |
| `seed` | 185 | 9 | 19:37, before the stop |
| `dataflow` | 622 | 1 | 19:45, before the stop |
| `blackbox`, `ui` | 0 | 0 | Skipped: they need the local CRM running |

**FP-06 (data flow):** expects new applications not to change when a person is soft deleted. T8 changed that on purpose, so the test is stale. The data flow continuation corrects it.

**The nine seed failures** come from four questions the contract did not answer. I chose the working answers below and wrote them into the contract's "Decisions from testing" section. The product already behaves this way, so the seed continuation corrects the tests. The user or recruiting can still overrule any of them; they are on the before-merge checklist.

| Question | Working answer | Failing tests |
|---|---|---|
| Unknown source key | Keep the raw value with `isUnmapped: true`, shown as "Unmapped: {raw}" | `V-overview source UNMAPPED`, `V-categories sources`, `V-categories sources, active`, `U-UC-64` |
| How far back the cohort table goes | Same 12 weeks as the trend line | Two `V-trends NEW_APPLICATIONS WEEK` cases |
| Median precision | Rounded to one decimal | `D-1` |
| Part days against the stuck limit | Whole days: 14 days 6 hours is not stuck until day 15 | `V-workspace partDayOverLimit`, `U-UC-120` |

Both planted-defect checks showed the tests catching what they should: the seed run's results are in the backup, and the data flow run caught every defect it logged before it was cut off.

**Not proven yet by anything:** type checks, lint, server boot, and whether real CRM actions create the timeline rows we expect (T1 to T11). About 10,000 lines have never been type checked, so expect some errors.

## 6. After the workflows finish

The main session does these in order. Heavy commands run one at a time. Before any `npx nx`, run:

```bash
export PATH="/d/Coding/Flolabs/crm/.claude/worktrees/analytics-work/bin:$PATH" NX_DAEMON=false NX_TUI=false
```

1. **Read the results:** each workflow's report and `analytics-work/test-results/bugs.md`, which does not exist yet because no evaluator has run. Send real bugs to a fix agent. Any edit to an existing CRM file needs one agent to write and a different agent to review.
2. **Commit** by area on `analytics_tool`. No AI attribution, no translation catalogs, no `.env`. Do not push.
3. **Rerun the SQL proof** from the worktree root: `node ../analytics-work/e2e/sql-proof/run.cjs`.
4. **Type check,** server then front, never together. `twenty-shared` and `twenty-ui` are already built in the worktree.
   ```bash
   cd packages/twenty-server && npx tsgo -p tsconfig.json --noEmit
   ```
   ```bash
   cd packages/twenty-front && npx tsgo -p tsconfig.json --noEmit
   ```
5. **Lint:** `npx nx lint:diff-with-main twenty-server`, then `twenty-front`.
6. **Boot test:** server and worker must start with no new errors, because a bad provider would stop the whole CRM.
7. **Local run with seed data, contract section 9 "Local end to end".** `yarn start` and `setup-dev-env.sh` are likely to fail on Windows, so use the contract's commands: `.env` files with `cp -n`, `npx nx database:reset twenty-server`, then the server, the worker and `npx nx start twenty-front` in three terminals. Load the data with `node packages/twenty-utils/flolabs/analytics-tests/seed/load.mjs --crm --i-am-local` after the fields exist. Run T1 to T11 and P1 to P12. Run the `blackbox` and `ui` layers. Take screenshots of every tab and state, light and dark, plus a keyboard pass. Check People, person page, Team inbox, Notifications and Forms still work.
8. **Hand it to the user:** they open `http://localhost:3001` themselves, with the prefilled login ("Continue with Email"). The user asked for this to be the final step.
9. **Merging and deploying are done by a person, never by Claude.** Claude only prepares the checklist in `docs/analytics/THINGS-TO-DO-BEFORE-MERGE.md`.

10. **Remind the user about the clean up, at the very end of everything. Do it only when the user asks** (the user, 2026-11-07). It clears builds and installs to get the disk space back. Details in `docs/analytics/THINGS-TO-DO-BEFORE-MERGE.md` section 7.

Update `CLAUDE.md` and this file at the end of each of these steps.

## 7. Time left

From the moment the workflows restart, measured against how long these steps took today:

| Step | Time |
|---|---|
| Restart and checks | 5 to 10 min |
| Backend and UI reviews, tests, data flow and seed, all in parallel | 60 to 90 min |
| Bugs, commit, SQL proof | About 15 min |
| First type check and lint, with fixes | 30 to 45 min |
| Boot test | 10 to 15 min |
| Local run with seed data, T1 to T11, P1 to P12, screenshots, fixes | 60 to 90 min |
| **Total** | **3 to 4.5 hours, most likely about 3.5** |

It runs unattended until the last step. The biggest unknowns are the first type check and the first real boot of the CRM with this code.

## 8. Open questions

**Nothing here blocks the work.** The build continues on defaults.

- **For the user:** whether `EXPORT_CSV` is the right gate (default members have it), whether a Reports tab is enough, and approving the retention paragraph.
- **For recruiting or someone with production access:** the stage list, positions to tracks, windows, and the rest of contract section 11. `docs/analytics/production-audit.sql` must be run by someone else. **The user has no production access: never ask them to run anything there.**
- **Screens:** the user will send CRM screens of Settings, Data model, People, Stage and a person's Timeline when they can. Do not wait for them.
- **Stop rule:** if the audit shows no stage rows on the timeline, or `isAuditLogged` false for `stage`, stop metrics work and ask the user.

## 9. Snapshot

- **Branch:** `analytics_tool`, based on `origin/main` at `30f3e351`. GitHub holds it up to `8f6f06d4`; later commits exist only on this D: drive until the user asks for another push.
- **Commits made at the pause, in order:** server module, page, test suite with merge guard, five integration edits one per file, contract decisions and checklist, then this file and `CLAUDE.md` (subject "Save the resume point for the analytics build").
- **Worktree:** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool`. Dependencies are installed and `twenty-shared` and `twenty-ui` are built, which `git` does not record.
- **Work folder:** `D:\Coding\Flolabs\crm\.claude\worktrees\analytics-work`, not in git. A copy is committed in `docs/analytics/resume/work-folder-backup/`. If the folder is gone: copy that folder's contents back, then `docs/analytics/contract.md` to `contract.md`, `docs/analytics/research/` to `research/`, and `docs/analytics/requirements.txt` to `spec.txt`. The `bin/yarn` shim points at the worktree's Yarn.
- **Updating state:** edit `analytics-work/state_block.md`, run `python -X utf8 "D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work/sync_claude_md.py"`, then commit `CLAUDE.md`. The script also copies this file to the main checkout, so a chat opened there finds it.
- **Docker:** test databases are disposable and every test recreates its own. The stopped runs' leftovers were dropped.
- **Merge guard:** this file and `docs/analytics/resume/` are excluded from `main`, along with the test suite and seed data.

## 10. Rules that carry over

Full list in `CLAUDE.md`. The ones most easily broken:

- Do not touch existing CRM logic. New code in new files. One agent writes, a different one reviews, for every edit to an existing CRM file. Do not fix unasked things, including bugs you notice: report them.
- The user makes the decisions. Ask before anything irreversible.
- **Claude never merges or pushes to `main`, ever, in any case, and never merges anything.** A person does all merging. Do not push any other branch or deploy until the user says so.
- Seed and test data never reach `main` or the live CRM. Every pre-merge item goes in `THINGS-TO-DO-BEFORE-MERGE.md`. Test data stays small.
- Do not waste tokens, but do not cut useful work short, and do not stop a running agent without asking.
- At most 6 agents at once without asking, and 7 if really needed. Heavy commands one at a time. Never `isolation: 'worktree'`.
- No AI attribution in commits, PRs or files. No em dashes or emojis. Plain tone.
- Keep `CLAUDE.md` current, every 2 or 3 decisions.

## 11. Running the CRM locally with seed data

Scripts are in `analytics-work/e2e/local-run/`, with a copy in `docs/analytics/resume/work-folder-backup/e2e/local-run/`. They change no CRM code, and everything Windows-specific stays in memory or in the local build output.

1. **Docker up:** `docker compose -f packages/twenty-docker/docker-compose.dev.yml up -d db redis`.
2. **Build the server:** `bash ../analytics-work/e2e/local-run/build-server.sh`, about 30 seconds. `packages/twenty-client-sdk` must be built first, directly with `NODE_ENV=production npx vite build` and `-c vite.metadata.config.ts`, because its Nx target fails under Windows' shell. Local `.env` files come from `cp -n` of the `.env.example` files.
3. **Reset the database:** `bash ../analytics-work/e2e/local-run/reset-database.sh <log file>`, about 6 minutes. It refuses a non-local database and seeds the Apple workspace with `--light`, so there is no second workspace.
4. **Start them, each as a background command:** `node ../analytics-work/e2e/local-run/crm.cjs server`, the same with `worker`, and `node ../analytics-work/e2e/local-run/front.cjs`. `.claude/launch.json` is not used, because the preview tool reads the main checkout's copy.
5. **Prepare the workspace:** `node ../analytics-work/e2e/local-run/setup-seed-objects.mjs`, then in the local database set `createdByName` and `updatedByName` to default to `'System'` on `_crmForm` and `_formSubmission`, because the seed loader does not fill them.
6. **Load the seed:** `node packages/twenty-utils/flolabs/analytics-tests/seed/load.mjs --crm --i-am-local`, then soft delete the 1,200 demo people: `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3h5".person SET "deletedAt" = now() WHERE id::text NOT LIKE '5eed0001-%' AND "deletedAt" IS NULL`.
7. **Run the jobs:** `node ../analytics-work/e2e/local-run/crm.cjs command crm-analytics:run --workspace-id 20202020-1c25-4d02-bf25-6aeccf7ea419 --job sync`, then `--job daily`. They enqueue, and the worker does the work.
8. **Open** `http://localhost:3001`, "Continue with Email", prefilled login, then Analytics in the sidebar.

After any server code change, stop the server and worker, rebuild with step 2, and start them again. The front reloads by itself. Reports already stored keep their old payload, so delete from `analytics.report` and rerun the daily job to see changes there. The `live` test layer makes and removes its own people on this CRM, so reload the seed (step 6 and 7) before anyone tests by hand.
