# Things to do before merging CRM Analytics into main

Work through this before `analytics_tool` goes anywhere near `main`. Add new items here as they come up. Tick an item only when it has really been done.

Merging to `main` triggers an image build, and a deploy can follow after approval, so treat the merge as the last step.

## 1. What must not go into main

- [ ] **Seed data stays out.** `packages/twenty-utils/flolabs/analytics-tests/seed/` is fake test data and must never reach `main` or the live CRM. Merge from a clean branch, not from `analytics_tool` directly:
  ```bash
  node packages/twenty-utils/flolabs/analytics-tests/merge-guard/prepare-merge.mjs
  ```
  This makes the branch `analytics_tool_merge` with everything on the exclusion list removed, then checks it. `analytics_tool` keeps all the tests and seed data for future testing. The exclusion list is `merge-guard/excluded-from-main.json`. Only committed work goes in. The branch is one commit on the point where `analytics_tool` left `origin/main`, so no older commit holding seed files can reach the history of `main`, whichever merge button is used.
- [ ] **Merge guard passes** on the clean branch:
  ```bash
  node packages/twenty-utils/flolabs/analytics-tests/merge-guard/check-before-merge.mjs --ref analytics_tool_merge
  ```
- [ ] **No test or scratch files in the merge:** no `.env` files, no test results, and nothing from `analytics-work`, which lives outside git.
- [ ] **No translation catalogs in the merge:** `locales/*.po` and `locales/generated/*`.
- [ ] **`CLAUDE.md`:** decide what goes to `main`. The project-state section is working notes for this build, not lasting guidance. Default: the clean branch removes it and keeps a short pointer.
- [ ] **Decide whether the rest of the test suite goes to `main`.** Default: tests stay on `analytics_tool`, because most of them need the seed data. The unit tests beside the product code do go to `main`.
- [ ] **Decide whether `docs/analytics/research/` goes to `main`.** Default: it stays out; the contract and the overview PDF go in.

## 2. Real data that must be confirmed

The tool is built on guessed stage values. Until these are done, the page shows a "definitions are provisional" banner and the funnel numbers cannot be trusted. **Ahsan has no production access, so someone who does has to run the audit.**

- [ ] **Run the audit on production:** `docs/analytics/production-audit.sql`. It is read-only and returns no personal data.
- [ ] **Stop rule:** if the audit shows no stage rows on the timeline, or `isAuditLogged` is false for `stage`, stop. The funnel depends on those rows.
- [ ] **Stage list:** value, label and order. Mark each main, reminder (of which stage) or exit. Name the entry and success stages. Update `constants/crm-analytics-config.constant.ts`, then set `isProvisional` to false.
- [ ] **Positions to tracks:** recruiting checks the 39-position, 5-track table in contract section 1.
- [ ] **Follow-up forms:** three forms set `Stage = INTERESTED`, which can move people backwards. Is that intended, and where does `INTERESTED` sit in the order?
- [ ] **Settings:** reporting time zone, step window (default 14 days), overall window (90), stuck days per stage (14), minimum sample (30).
- [ ] **Unit:** confirm the funnel counts people, not applications, and that there is only one pipeline.
- [ ] **Applications object:** name, fields, link to Person, application date.
- [ ] **Tracking start:** the date the last HubSpot import finished. The default is 2026-10-27. Check it against the audit's people-per-day result.
- [ ] **HubSpot history:** is stage history still readable? It could give a real funnel at launch instead of starting empty.
- [ ] **Hand check:** one hand-counted sample period from recruiting matches the page.

## 3. Decisions for Ahsan

- [ ] **Who can see analytics.** The gate is the `EXPORT_CSV` permission, which is wider than it sounds: the default Member role has it, so nearly everyone sees the page. A role with no People access could still see names in the stuck list. To narrow it, change the flag in `NavigationDrawerAnalyticsItem.tsx` and `crm-analytics.resolver.ts`.
- [ ] **Reports:** is a Reports tab enough for now, with no email or n8n delivery?
- [ ] **Retention:** approve the paragraph in contract section 3.
- [ ] **Query speed at full size:** measured once with temporary fake data at about 43,000 people. Overview and the monthly conversion trend hit the 8 second limit until `enable_nestloop` and `jit` were turned off on analytics connections, then took about 2 seconds. Confirm that fix is in the code. Real production data may behave differently, so check `analytics.sync_log` and page speed after the first deploy.

## 4. Proof that it works

Run from the worktree. Each must pass on the final code.

- [ ] **All test layers pass:**
  ```bash
  node packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs --layer all
  ```
- [ ] **`analytics-work/test-results/bugs.md`** has no open real bugs.
- [ ] **Type checks:** run `npx tsgo -p tsconfig.json --noEmit` directly in `packages/twenty-server`, then in `packages/twenty-front`, one at a time. Do not rely on `nx typecheck`, whose cache can give a stale pass.
- [ ] **Lint:** `npx nx lint:diff-with-main twenty-server`, then `twenty-front`.
- [ ] **Boot test:** server and worker start with no new errors, since a bad provider would stop the whole CRM.
- [ ] **Local end-to-end:** contract section 9, timeline checks T1 to T11 and pipeline checks P1 to P12.
- [ ] **CRM regression:** People list, person page, Team inbox, Notifications and Forms still work.
- [ ] **UI screenshots:** every tab and state, light and dark, plus a keyboard-only pass.

## 5. Branch and commits

- [ ] **Update from `origin/main`** and resolve conflicts. Five existing files are edited; `main` may have moved.
- [ ] **Integration edits are one commit per file,** each reviewed by a second agent. That history stays on `analytics_tool`; the clean branch folds everything into one commit.
- [ ] **No AI attribution** in commit messages, because CI rejects it.
- [ ] **`FLOLABS.md`:** add the analytics section: what it is, the off switch, how to change the mapping. The merge guard fails on any existing file beyond the five and `CLAUDE.md`, so also add `FLOLABS.md` to `ALSO_ALLOWED_EXISTING_FILES` in `merge-guard/check-before-merge.mjs`.
- [ ] **Security scan workflow** passes on the pull request.
- [ ] **Merge guard workflow** `flolabs-analytics-merge-guard` passes on the pull request. A red check only blocks the merge button if it is a required check in the branch protection for `main`, which someone with admin access has to set.
- [ ] **Team reviews the pull request.** Nothing merges without Ahsan's go.

## 6. Deploying to production

- [ ] **The first deploy switches analytics on.** `entrypoint.sh` registers the crons, so jobs start for every active workspace and the `analytics` schema gets created. Hold the deploy until section 2 is done, or switch it off first with the SQL below. The sidebar item still shows, opening an "off" page.
  ```sql
  INSERT INTO core."keyValuePair" ("key", "value", "workspaceId", "type")
  VALUES ('CRM_ANALYTICS_DISABLED', 'true'::jsonb, '<workspaceId>', 'USER_VARIABLE');
  ```
- [ ] **Confirm no seed data in production:** after deploying, the person count matches the audit, and there are no `example.com` test people.
- [ ] **Backup:** `deploy.sh` takes one before the deploy, and it covers the `analytics` schema.
- [ ] **Watch job time:** analytics jobs share a queue with member updates, cleanup and app installs. Compare `started_at` and `finished_at` in `analytics.sync_log`. If sync takes over 30 seconds, switch to the hourly pattern.
- [ ] **Removal, if ever needed:** `DROP SCHEMA analytics CASCADE`. No CRM table is touched.

## 7. Noticed along the way, separate from this work

These are not blockers for this merge, and nobody has acted on them.

- [ ] Possible bug: `useNotificationsSeenState.ts`, `FormBuilderResponsesTab.tsx:161` and `FormBuilderActionsEditor.tsx:63` appear to use the wrong GraphQL client. Unconfirmed.
- [ ] GitHub reports 402 dependency vulnerabilities on `main`, 5 critical.
- [ ] The main checkout at `D:\Coding\Flolabs\crm` has an empty git index on `automations_branch`.
