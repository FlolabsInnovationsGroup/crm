export const meta = {
  name: 'analytics-merge-guard',
  description: 'Build the merge guard that keeps seed and test data out of main and away from the live CRM',
  whenToUse: 'Before merging the CRM Analytics build',
  phases: [
    { title: 'Merge guard', detail: 'exclusion list, clean merge branch script, checks, and a test layer', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const SUITE = `${WT}/packages/twenty-utils/flolabs/analytics-tests`
const RESULTS = `${WORK}/test-results`

phase('Merge guard')
const result = await agent(`You build the merge guard for the CRM Analytics tool in FloLabs CRM, a fork of Twenty. The user's requirement: when this work is merged, the seed data must NOT go with it. Fake test people must never reach main or the live CRM. This is the company's live CRM, so the guard must be simple and hard to get wrong.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages. Read ${WT}/docs/analytics/THINGS-TO-DO-BEFORE-MERGE.md, which describes the commands you must deliver, and ${WORK}/brief.md.
Product code is off limits, other agents are writing it now. Never edit it. Other agents own ${SUITE}/ other than merge-guard/. Do not run git add, commit, stash, push, or checkout in this working copy. Do not run yarn install or builds.

WRITE, under ${SUITE}/merge-guard/, plain Node with no new dependencies:
1. excluded-from-main.json: the paths that stay on analytics_tool and never go to main. Include packages/twenty-utils/flolabs/analytics-tests/ as a whole except what the checklist says otherwise, and docs/analytics/research/. Each entry has a one-line reason.
2. prepare-merge.mjs: creates the local branch analytics_tool_merge from analytics_tool with the excluded paths removed in a single commit, and with the "CRM Analytics tool: project state" block between the analytics-state markers in CLAUDE.md replaced by one short pointer line. It must leave the user's working copy alone, so use a temporary git worktree (or a temporary index with commit-tree), and clean it up afterwards. It never pushes and never touches main. Rerunning it replaces the old analytics_tool_merge after saying so. It ends by running the check below and printing the result and the next step in plain words. The commit message carries no AI attribution.
3. check-before-merge.mjs --ref <branch>: fails, with a plain message for each problem, if that branch compared with origin/main contains any of:
   - any excluded path;
   - any file containing the seed's fake markers. Read the marker list from the seed folder when present, and also check for example.com emails in newly added files outside tests;
   - any newly added file or changed line in product code (packages/twenty-server/src, packages/twenty-front/src, packages/twenty-docker, packages/twenty-utils/flolabs/deploy.sh, entrypoint scripts, upgrade commands, migrations) that references analytics-tests, seed, or analytics_seed;
   - .env files, test results, translation catalogs (locales/*.po, locales/generated/*);
   - AI attribution in the branch's commit messages (Co-Authored-By with anthropic.com, "Generated with Claude").
   It also prints the list of existing CRM files changed, so a human can confirm it is only the five expected ones, and FAILS if any existing file other than those five and CLAUDE.md changed. Read the five from docs/analytics/contract.md section 2.
4. merge-guard.test.mjs, a test layer that runs safely on analytics_tool during normal testing, where seed files exist on purpose:
   - Simulates prepare-merge without creating branches, for example with a temporary index, and asserts the resulting tree has no excluded path.
   - No product file imports or references analytics-tests or seed. Confirm by searching the real tree.
   - Nothing in the Docker image can load seed data: read packages/twenty-docker/twenty/Dockerfile and .dockerignore, and record whether packages/twenty-utils reaches the image; either way, assert nothing in the image's startup path (entrypoint.sh, server, worker) can invoke it.
   - The seed loader refuses non-local hosts: run seed/load.mjs with a non-local host in dry form if the file exists, and assert it refuses before connecting; SKIP with a reason if it does not exist yet. Never make a real outside connection.
   - check-before-merge.mjs itself works: give it a temporary tree or ref that contains a seed file, and assert it fails; give it one without, and assert it passes.
   Writes ${RESULTS}/latest-merge-guard.json in the suite's result format.
5. .github/workflows/flolabs-analytics-merge-guard.yml at ${WT}/.github/workflows/: on pull requests to main only, fail if the pull request contains any path from excluded-from-main.json. Read-only permissions, no secrets, no npm install, and it must work even if the check script is excluded from the branch: use plain shell over git diff with the paths listed inline, plus a comment saying which file they mirror. Copy the style of the existing .github/workflows/security-scan.yml, which also shows how the repo pins actions. It must not run on push and must not affect any other workflow.
6. When ${SUITE}/run-tests.mjs exists, add a small edit: a merge-guard layer, included in "all". If it does not exist yet, check again at the end of your work and make the edit if it has appeared.
7. Add a short note on this to the suite README if it exists.

Test your scripts for real where it is safe: creating a local temporary branch named analytics_tool_merge_test and deleting it is fine, using a temporary worktree outside the working copy under ${WORK}. Since the code is uncommitted while other agents work, your tests must operate on commits, and must not depend on uncommitted files being present. Delete anything temporary. Do not leave analytics_tool_merge behind: the user runs that themselves when ready.

Your final text must be at most 150 words: what exists, test results, and whether packages/twenty-utils reaches the Docker image.`, { label: 'merge-guard', phase: 'Merge guard', model: 'opus', effort: 'max' })
return { result }