# Manager Buddy: implementation plan

How we build the agent described in `agent.md` (the "Manager Buddy" proposal, 28 Oct 2026). Planning only, no code changed. Checked against this repo on 30 Oct 2026.

## Short version

- **Yes, Buddy uses the same tools as the chatbot.** The chat and the `/mcp` endpoint both read from the same tool registry (`ToolRegistryService`). Buddy connects to `/mcp` with an API key, so it gets the chatbot's tools filtered by the API key's role. It does **not** call the chat API (`sendChatMessage`): that needs a logged-in user, runs with that user's role and the chatbot's prompt, and would put Buddy's runs into someone's chat history.
- **Three CRM surfaces, one adapter:** `/mcp` for agent tools, REST/GraphQL for plain queries (phase 1 needs nothing else), outgoing webhooks for events. Claude is called directly from Buddy with its own Anthropic key, so its spend is separate from the chatbot's.
- **The proposal is sound, with four gaps** found in code: an API key can send from any mailbox in the workspace, "ask first" is not enforced by the CRM, the sender allowlist is spoofable, and the stock `postgres:16` image has no pgvector. Fixes are below.
- **Biggest design change:** two API keys. The agent's key can read and write notes, tasks and Buddy's own lists, but cannot change stages or send to applicants. A second "executor" key is only used by plain code that runs an approval after a team member approved it in the CRM. The model never holds the executor key, so "asks first" becomes a CRM-enforced rule instead of a prompt.

## 1. Which APIs Buddy uses

| Need | CRM surface | Auth | Same as chatbot? |
|---|---|---|---|
| Agent tools (find, group by, create note/task, draft/send email) | `POST /mcp` (JSON-RPC, MCP `2025-06-18`) | API key, role from `ApiKeyRoleService` | Yes, same registry. MCP adds `get_tool_catalog` + `execute_tool`, and drops `code_interpreter` and `http_request` (`mcp-excluded-tool-names.const.ts`) |
| Plain counts and filters (briefing numbers, stuck applicants) | `/rest/<object>` with `filter`, `groupBy` on GraphQL | Same key | Same query engine |
| Events (form submitted, email in, stage changed, approval decided) | Outgoing webhooks, `POST /rest/webhooks` | Admin, once | Not used by chat |
| Creating Buddy's lists and role | Metadata API | Admin key, one-off setup script | No |
| Sending email | `send_email` tool via `/mcp`, with an explicit `connectedAccountId` | Executor key | Yes |
| The model | Anthropic Messages API, Buddy's own key | `ANTHROPIC_API_KEY` in Buddy's env | No: the chatbot uses the key in Admin Panel → AI |

Why not Anthropic's hosted MCP connector (passing the CRM's `/mcp` URL to Claude directly)? Tool calls would go straight from Anthropic to the CRM and skip Buddy's allowlist, approval check and budget meter. Buddy must sit in the middle: it lists the CRM's tools, exposes only the allowed ones to Claude, and forwards each call itself.

## 2. Issues and how we handle them

Verified in code unless marked *to confirm*.

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 1 | **An API key can send from any mailbox.** With no user, the mailbox filter is skipped and the default is the oldest mailbox. | `findMailboxesUsableByCaller` in `connected-account-metadata.service.ts:61` filters by user only `isDefined(userWorkspaceId)`; ordered `createdAt ASC` | Executor always passes the `connectedAccountId` of Buddy's mailbox and refuses any other. Later, a small fork change to tie an API key to one mailbox |
| 2 | **"Ask first" is the model's choice in the CRM.** Approval templates are display only. | `ai-tools-and-n8n-plan.md` §3, `execute-tool.tool.ts` | Two keys (see Short version). The agent key's role has **no** update on the stage field (field permissions exist: `flat-field-permission`) and no `SEND_EMAIL_TOOL` |
| 3 | **Self-approval.** If the agent key can edit Buddy Approvals, the model could mark its own proposal approved. | Records carry `updatedBy` (actor with source and workspace member), `custom.workspace-entity.ts` | Executor only runs an approval whose last `updatedBy` is a workspace member on the allowlist (source `MANUAL`), never an API key |
| 4 | **Sender allowlist is spoofable.** A `From:` header is easy to fake. | Allowlist is the only check in the proposal | Phase 2: email questions are read-only answers, and answers go to the allowlisted address, not the reply-to. Orders that change anything come only through the Buddy Tasks list, where the CRM authenticates the author. *To confirm:* whether synced messages keep `Authentication-Results`; if yes, also require DMARC pass |
| 5 | **Prompt injection through tool results.** The allowlist protects the instruction channel, not the data Buddy reads (an applicant email saying "ignore your rules"). | Design gap | Wrap applicant text as data in tool results; no tool lets the model pick a free-form recipient; every applicant-facing action goes through issue 2's approval path regardless of what the model says |
| 6 | **Buddy can't use the CRM's AI inbox approval cards.** API and trigger runs hard-code `canAskHumans: false`. | `agent-trigger-runner.service.ts:97`, `agent-run.service.ts:258` | Approvals live in the Buddy Approvals list, as proposed. Fine for phase 3 |
| 7 | **Does incoming email fire a webhook?** Reports marked it unconfirmed. | Message import uses `messageRepository.insert` without `shouldSkipEventEmission` (`messaging-message.service.ts:269`), and insert emits created events (`workspace-repository.ts:1107`). Webhook job has no system-object filter | Code says yes. *To confirm* in phase 1 with a live test; fallback is polling messages every few minutes |
| 8 | **Rate limit.** API keys default to 100 calls a minute. | `API_RATE_LIMITING_*` | Plain filters and `groupBy` for counts, never one call per person over 43k records. Scheduler paces itself; raise the limit only if a job needs it |
| 9 | **Double or missed runs with no database of our own.** | Proposal says "no new database" | One container, one replica. Each run gets a key `job:scheduled-slot` stored in a **unique** field on Buddy Runs; a second insert fails, so a restart can't double a run. On start, Buddy checks the last slot per job and catches up within a window |
| 10 | **Upstream drift.** Upstream shipped 2.49 to 2.52 in 11 days; tool names and schemas can change. | `crm-manager-agent-plan.md` §6 | The CRM adapter is the only code that knows tool names. Contract tests run against a local CRM on every CRM upgrade. Phase 1 needs no upgrade; upgrade before phase 2 |
| 11 | **pgvector is not in the stock Postgres image.** | `packages/twenty-docker/docker-compose.yml:120` uses `postgres:16` | Phase 5: switch to `pgvector/pgvector:pg16` (same Postgres, extension added) after a backup, or run a separate small vector database. *To confirm* what prod runs |
| 12 | **The new package would trigger the 15-minute CRM image build.** | `.github/workflows/flolabs-build-image.yaml` ignores only `FLOLABS.md`, `flolabs/**` and the deploy workflow | Add `packages/manager-buddy/**` to `paths-ignore` and give Buddy its own small build workflow and image |
| 13 | **Overlap with Twenty's own agents.** The fork already has cron agents, waits and run history (`crm-manager-agent-plan.md` §3). | Design choice | Accept it: independence from upstream is the point. Don't also build jobs inside the CRM; pick one |
| 14 | **Hosting docs disagree.** Build Plan 4.0 (Notion) says DigitalOcean; `FLOLABS.md` says Hetzner CPX32, decided 25 Oct. | Both docs | Hetzner, as the proposal says. Buddy is small; phase 5's local embedding model needs roughly 1 GB more RAM, to check against the CPX32 |
| 15 | **Business rules written only as "memory".** "Never email applicants on Fridays" in a prompt is a suggestion. | Design gap | Rules that gate sends (quiet hours, Fridays, suppression, unsubscribed, `+crmtest` only in test) are code in the executor. Buddy Memory holds the rest |

## 3. Package layout

`packages/manager-buddy`, TypeScript on Node 22, its own `package.json`, imports nothing from `twenty-*`.

```
packages/manager-buddy/
  src/
    config.ts                 env parsed with zod; refuses to start if anything is missing
    crm/
      crm-adapter.ts          the only file that knows tool names and object names
      mcp-client.ts           @modelcontextprotocol/sdk client, streamable HTTP
      rest-client.ts          filters, groupBy, Buddy lists
      webhook-receiver.ts     HMAC check, stale-timestamp check, dedupe by event id
    scheduler/
      scheduler.ts            cron per job, run key, catch-up, kill switch, quiet hours
      run-log.ts              writes Buddy Runs
    agent/                    phase 2
      agent-loop.ts           Claude tool loop, step and token limits
      tool-allowlist.ts       which CRM tools the model sees
      budget.ts               daily cap, stops the loop when reached
    approvals/                phase 3
      executor.ts             runs approved actions with the executor key
    jobs/
      pipeline-snapshot.job.ts  phase 1
      morning-briefing.job.ts   phase 2
      weekly-report.job.ts      phase 2
  scripts/
    setup-crm.mjs             creates Buddy lists, the two roles and keys (admin key, run once)
  Dockerfile
```

Libraries: `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `croner`, `zod`, `pino`. Model: the latest Sonnet for jobs and email answers, the latest Haiku for classification (reply triage). Pricing to be measured in phase 2, not guessed.

## 4. Roles and keys

| Key | Role | Can | Cannot |
|---|---|---|---|
| `CRM_AGENT_KEY` | Manager Buddy | Read People, Applications, Forms, Form submissions, Tasks, Notes, messages; create notes and tasks; read and write Buddy lists | Update stage or status fields, send email, delete, merge, settings, workflows, data model |
| `CRM_EXECUTOR_KEY` | Manager Buddy Executor | Update stage and status fields; `send_email` from Buddy's mailbox; merge | Delete, settings, data model. Never given to the model |
| Admin key | Admin | Run `setup-crm.mjs` once | Not stored on the server after setup |

## 5. Phases

Durations assume one developer and match the proposal's exit criteria. Soak time is calendar time, not build time.

### Phase 0. Decisions and facts (2 to 3 days)

- Answer the proposal's five decisions. Add a sixth: two keys as in section 4.
- Confirm in production: Anthropic key set, the real API names of Applications and Email Templates, the stage field name and values, the Postgres image.
- Create Buddy's mailbox and connect it in the CRM, owned by an admin.
- Local CRM running from this branch for development (section 6).

### Phase 1. Foundation, no AI (1 week build, 1 week soak)

- Package skeleton, config, Dockerfile, build workflow, `paths-ignore` for the CRM build.
- `setup-crm.mjs`: Buddy Tasks, Buddy Approvals, Buddy Memory, Buddy Runs (unique run key field), both roles and keys.
- Scheduler with run keys, catch-up, kill switch (a Buddy Memory record `paused = true`, checked before every run), quiet hours.
- Webhook receiver, verified with a live `message.created` test (issue 7).
- Hourly pipeline snapshot email to the team: counts by stage from `groupBy`, sent with the executor key from Buddy's mailbox to team addresses only.
- Admin API on localhost only: status, pause, run a job now.
- Tests: run key dedupe, catch-up, webhook signature and replay, kill switch.

Done when: a week on the server with no missed or doubled run, checked against Buddy Runs.

### Phase 2. Agent (1 to 2 weeks build, 2 weeks use)

- Upgrade the CRM first, one minor at a time with a backup (`FLOLABS.md` §8), then run the adapter contract tests.
- Agent loop with the read-only allowlist, step limit, daily budget.
- Email questions: read-only, answer to the allowlisted address (issue 4). Example cases from the proposal: "How many people booked a Saturday meeting this week, and where did they come from?", "Who replied this week and hasn't heard back?"
- Morning briefing and weekly report: numbers from plain queries, Claude writes the summary.
- Eval set: 30 real questions with known answers from the CRM, run before every prompt or model change.

Done when: the team uses the briefing daily for 2 weeks and the eval set passes.

### Phase 3. Tasks and approvals (1 to 2 weeks)

- Buddy Tasks: picked up by a webhook on create plus a sweep for "check again on" dates.
- Proposals go to Buddy Approvals with the reason and a preview. The executor runs only approvals decided by an allowlisted member (issue 3) and re-checks send rules in code (issue 15).
- Example task: "Chase everyone who got the agreement more than a week ago."

Done when: assigned tasks get done or escalated, and no approval ran without a human decision (checked against `updatedBy`).

### Phase 4. Pipeline jobs (2 to 3 weeks, one job at a time)

- Order: reply triage, stuck applicants, form follow-through, agreements, clean-up.
- Each job starts as ask-first. Track approved-unchanged rate per job in Buddy Runs; a job moves up only after 2 weeks at 90% or more, and only for actions that don't reach an applicant or decide an outcome.
- DPIA before anything that ranks or screens.

### Phase 5. Memory search (2 weeks)

- pgvector (issue 11), local embedding model, `search_memory` tool.
- Calendly and Zoom through n8n.

Done when: "who mentioned X" is right on a test set.

## 6. Running this branch locally

For building and testing Buddy against a real CRM.

```bash
yarn install
```

```bash
bash packages/twenty-utils/setup-dev-env.sh
```

```bash
yarn start
```

Front on `http://localhost:3001`, server on `http://localhost:3000`, `/mcp` on the server. Log in with "Continue with Email" and the prefilled credentials. Set `ANTHROPIC_API_KEY` in `packages/twenty-server/.env` or in Admin Panel → AI for the chatbot.

## Related

- `agent.md`: the proposal.
- `crm-manager-agent-plan.md`: what the CRM already has, market research, compliance.
- `ai-tools-and-n8n-plan.md`: the CRM's APIs and the chatbot's tools.
