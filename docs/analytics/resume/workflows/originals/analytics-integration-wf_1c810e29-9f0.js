export const meta = {
  name: 'analytics-integration',
  description: 'Wire the analytics module and page into the CRM with the five smallest edits: one agent writes, a different agent reviews',
  whenToUse: 'Integration phase of the CRM Analytics build',
  phases: [
    { title: 'Write', detail: 'one agent makes the five edits to existing CRM files', model: 'opus' },
    { title: 'Review', detail: 'a different agent reviews every changed line', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'

const writePrompt = (extra) => `You are making the ONLY edits to existing CRM code in the CRM Analytics build. This is the company's live CRM. The user's rule: do not change existing CRM logic, keep edits as small as possible, and a different agent reviews your work.

Working copy: ${WT} (branch analytics_tool). Use absolute paths. Never touch D:/Coding/Flolabs/crm/packages, a different checkout.
Read ${WORK}/contract.md section 2, the INTEGRATION table, and read section 7's resolver part if you need context.

Make exactly these edits and nothing else, matching the surrounding style and import order of each file. Line numbers in the contract may have drifted, so place each edit by content:
1. packages/twenty-server/src/modules/modules.module.ts: import and add CrmAnalyticsModule.
2. packages/twenty-server/src/database/commands/database-command.module.ts: import and add CrmAnalyticsModule.
3. packages/twenty-server/src/database/commands/cron-register-all.command.ts: inject CrmAnalyticsCronCommand and add it to the list.
4. packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx: lazy AnalyticsPage and one route, copying the Team inbox pattern, no handle.
5. packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx: import and render NavigationDrawerAnalyticsItem.

Other agents are writing the new files under packages/twenty-server/src/modules/analytics/ and packages/twenty-front/src/modules/crm-analytics/ right now. Some files you import, such as crm-analytics.module.ts and crons/commands/crm-analytics.cron.command.ts, may not exist yet. That is expected: do not create them, and do not edit anything inside those two folders. Confirm the export names against the contract.
Do not run git add, commit, stash or checkout. Do not run yarn install, nx, tsgo, lint, jest or docker. You may run git diff to check your work. When done, confirm with git status and git diff that only these five existing files have changes among tracked files.
${extra}
Your final text must be at most 120 words: what you changed in each file, and anything unexpected.`

const REVIEW = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['file', 'severity', 'problem', 'fix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['approved', 'filesChanged', 'defects', 'summary'],
}

const reviewPrompt = `You are the second agent the user requires for any change to core CRM code. You did not write these edits. Your job is to protect the live CRM: assume the edit is wrong until you have checked it.

Working copy: ${WT} (branch analytics_tool). Read ${WORK}/contract.md section 2's INTEGRATION table, then run: cd ${WT} && git status --short -- . ':(exclude)packages/twenty-server/src/modules/analytics' ':(exclude)packages/twenty-front/src/modules/crm-analytics' ':(exclude)packages/twenty-front/src/pages/analytics' ':(exclude)packages/twenty-shared/dist' and git diff.
Do not edit anything. Do not run git add, commit, stash or checkout, nor yarn install, nx, tsgo, lint, jest or docker.

Check:
1. Only the five expected existing files changed, and every changed line is needed. No reformatting, no reordering, no line-ending change, no unrelated edit. Check with git diff --stat that line counts are small.
2. Would each edit compile? Import paths resolve (open the new files where they already exist; if a file is still being written, check its path and export name against the contract). Import style matches the file.
3. Runtime safety:
   - modules.module.ts: does adding this module risk server or worker boot? Read crm-analytics.module.ts if it exists. Are the providers' dependencies importable?
   - database-command.module.ts and cron-register-all.command.ts: CronRegisterAllCommand injects the cron command, so the module must export it and the command module must import that module. Would Nest resolve it? Compare with another cron command in the same files, including the name and multi-line form used in the list.
   - createWorkspaceRouteObjects.tsx: same pattern as Team inbox. No path collision with existing routes (check AppPath). Lazy import shape matches the page's named export.
   - MainNavigationDrawerScrollableItems.tsx: the item returns null without permission. Placement is sensible next to the other FloLabs items.
4. Does any edit change existing behaviour for users who do not use analytics?
approved is true only if there are no blocker or major defects.`

phase('Write')
const write = await agent(writePrompt(''), { label: 'integration-writer', phase: 'Write', model: 'opus', effort: 'max' })

phase('Review')
let review = await agent(reviewPrompt, { label: 'integration-reviewer', phase: 'Review', model: 'opus', effort: 'max', schema: REVIEW })
let fix = null
if (review && !review.approved) {
  log('Reviewer did not approve: ' + review.defects.length + ' findings. Writer is fixing.')
  fix = await agent(writePrompt('A reviewer found problems with the current edits. Confirm each in the code and fix the real ones, still with the smallest possible edit:\n' + JSON.stringify(review.defects, null, 1)), { label: 'integration-writer-fix', phase: 'Write', model: 'opus', effort: 'max' })
  review = await agent(reviewPrompt, { label: 'integration-reviewer-2', phase: 'Review', model: 'opus', effort: 'max', schema: REVIEW })
}
log('Integration approved: ' + (review ? review.approved : 'no review'))
return { write, fix, review }