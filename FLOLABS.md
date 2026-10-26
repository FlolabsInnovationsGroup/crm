# FloLabs CRM

The CRM of FloLabs Innovations Group, at **https://crm.flolabsinnovations.com**. It replaces HubSpot for recruiting interns: applicants, their emails, forms, tasks and notes all live here.

FloLabs CRM is our own fork of [Twenty](https://github.com/twentyhq/twenty), an open-source CRM. This file is the complete documentation: what the product does, how to use it, what we added on top of Twenty, how it is hosted and what that costs, and how to build, deploy and maintain it.

Figures marked "as of" were checked on 26 Oct 2026.

## Contents

1. [Overview](#1-overview)
2. [Using the CRM](#2-using-the-crm)
3. [Forms](#3-forms)
4. [What we added on top of Twenty](#4-what-we-added-on-top-of-twenty)
5. [Hosting: why Hetzner and not AWS](#5-hosting-why-hetzner-and-not-aws)
6. [Architecture](#6-architecture)
7. [Build and deploy](#7-build-and-deploy)
8. [Operations](#8-operations)
9. [Development](#9-development)
10. [License](#10-license)

## 1. Overview

| | |
|---|---|
| URL | https://crm.flolabsinnovations.com |
| Base | Twenty `v2.48.1` (tag `twenty/v2.48.1`, commit `9dc41d8`) |
| Repository | `FlolabsInnovationsGroup/crm` |
| Server | Hetzner Cloud CPX32, Nuremberg, `flolabs-crm-01` |
| Image | `ghcr.io/flolabsinnovationsgroup/crm`, one tag per commit |
| Replaces | HubSpot (moved to the Free plan on 27 Oct 2026) |

Data imported from HubSpot, as of 26 Oct 2026:

| Object | Records |
|---|---|
| People | 42,975 |
| Applications | 42,371 |
| Attachments (CVs and files) | 42,200 |
| Emails / email threads | 43,228 / 30,048 |
| Notes | 3,211 |
| Tasks | 379 |
| Email templates | 73 |

## 2. Using the CRM

### Signing in and the team

Sign in at https://crm.flolabsinnovations.com. Invite teammates from **Settings → Members**. Each member connects their own mailbox under **Settings → Accounts**, and can connect several accounts (for example a personal and a shared mailbox).

### People and applicants

- **People** holds every applicant and contact. Recruiting fields on each person:
  - `Stage`: where the applicant is in the pipeline (25 stages, for example `INTERESTED`).
  - `Applicant source`: where they came from (21 options), with `Other source details` and `Referred by`.
  - `Positions applied for`: one or more of 39 positions.
  - `Education`, `City`, `State`, `Country`, `LinkedIn`, `Phones`, `Reference 1`, `Reference 2`.
  - `Safe senders confirmed`: whether they whitelisted our emails.
- **Applications** holds the application records imported from HubSpot.
- Use the view bar (filter, sort, group by `Stage`) to build lists, then save them as views.

The person page has these tabs:

| Tab | What it shows |
|---|---|
| **Forms** (opens first) | Every published form, with this person's answers, or "Not answered yet". See [Forms tab](#the-forms-tab-on-a-person). |
| Timeline | Everything that happened: emails, form submissions, notes, tasks, field changes. |
| Tasks, Notes, Files | As in Twenty. Files include CVs uploaded through forms. |
| Emails, Calendar | Messages and events from the connected accounts. |

### Email

- Open a person and press **Send Email**, or reply from any thread.
- **Reply** answers the sender. **Reply all** keeps everyone on the thread.
- **Insert template** in the composer lists the records of the `Email Templates` object. `{{firstName}}` and `{{lastName}}` are filled from the recipient.
- Every email preview shows the time it was received. Emails whose headers claim a date in the future are shown at the time we actually received them.

### Team inbox

Sidebar → **Team inbox**: email threads from every connected mailbox, newest first.

- Tabs: **All**, **Unread (n)**, **Received**, **Sent**.
- Opening a thread marks it read. The icon on each row marks it unread again. **Mark all as read** clears the list.
- Read state is **per person**: what I read stays unread for my colleagues.
- Only replies from outside make a thread unread. Our own emails, including automated reminders, never do.
- On a person's first visit, older mail counts as read, so nobody starts with 30,000 unread threads.
- The sidebar item shows the unread count and refreshes every minute.

### Notifications

Sidebar → **Notifications**, with an unread count. It lists:

- replies to our emails,
- new form submissions,
- tasks assigned to you.

Each item leads with the person's name and opens the record. Read state is stored on the server, so it follows you across devices.

### AI assistant

Sidebar → **AI**. Chat with Claude about the CRM data: find people, summarize a thread, draft an email. It calls the product "FloLabs CRM" and knows our stages, forms and form submissions.

The Anthropic API key is entered by an admin in **Admin Panel → AI → Anthropic**. It is never stored in this repository.

### Workflows

Twenty's workflow engine (Sidebar → **Workflows**) sends emails and updates records on triggers such as "Form submission created" or a stage change. Workflows stay **off** until the team turns them on after the HubSpot switch-over. Test only with internal `+crmtest` addresses, never with real applicants.

### Calendar

Each member can connect several Google or Microsoft calendars. This needs Google and Microsoft OAuth apps configured on the server (`AUTH_GOOGLE_*`, `CALENDAR_PROVIDER_GOOGLE_ENABLED`, `AUTH_MICROSOFT_*`). Interviews are booked through Calendly, which is linked to Zoom; a Calendly integration is a possible next step.

## 3. Forms

FloLabs CRM has its own form builder, built to replace Fillout and the HubSpot forms. A submission lands directly on the person in the CRM.

### Building a form

Sidebar → **Form builder** → **New form**. The editor has a live preview and these tabs:

| Tab | What it does |
|---|---|
| **Fields** | Add and order questions and blocks. Each question can be mapped to a person field (`Stage`, `Positions applied for`, …). |
| **Logic** | Show or hide questions and whole pages, make a question required only in some cases, validation rules, calculated values, different endings, after-submit actions. |
| **Design** | Layout (card, plain, or one question per screen), theme presets, colors, fonts (including Arabic fonts such as Cairo and Tajawal), logo, cover and background images, dark mode that follows the visitor's device, right-to-left text, progress bar. |
| **Code** | Custom HTML, CSS and JavaScript for the page. |
| **Settings** | Title and introduction, message or redirect after submitting, language of built-in texts (English or Arabic), default phone country, "Before sending" review page, "First page button" label. |
| **Share** | Direct link, embed script (resizes itself and passes UTM parameters), iframe embed. |
| **Responses** | Every submission in a table with CSV export, plus views, starts, completion rate and drop-off per step. |

**Question types:** short text, long text, email, phone, number, URL, date, time, single choice (buttons or dropdown), multiple choice, yes/no, rating, scale and NPS, slider, matrix, checkbox, consent, address, file upload, signature, hidden (for UTM or prefilled values).

**Layout blocks:** heading, paragraph (supports `**bold**`, `[links](https://…)` and bare https links), image (https URL), page break.

**Logic:** conditions on any earlier answer, grouped with "all" or "any". Operators: equals, not equals, contains, does not contain, is empty, is not empty, greater or less than, starts or ends with, is any of. A condition on a page break hides the whole page, which is how branching forms work.

**After-submit actions:** set person values (for example `Stage = INTERESTED`), create a task, notify the team, send an automatic reply. Each action can have its own condition.

### Publishing and sharing

- The status badge at the top of the editor switches a form between **Draft** and **Published**. Only published forms are served; a draft link shows "Form not available".
- Public page: `https://crm.flolabsinnovations.com/forms/<workspaceId>/<formId>`.
- Embed on a website: `<script src="https://crm.flolabsinnovations.com/forms/<workspaceId>/<formId>/embed.js" async></script>`.
- **Prefill** from a link: questions with a prefill key read it from the URL, for example `?email=jane@example.com&first_name=Jane`. Use this in email templates so applicants do not retype their email.

### What happens on submit

1. The person is found by email (case-insensitive) or created.
2. Mapped answers are written to the person's fields. If the CRM rejects a value, the person is still saved and the raw answers are kept.
3. All answers are stored on a **Form submission** record linked to the form and the person.
4. Uploaded files are attached to the person, named `<question>: <file name>`.
5. After-submit actions run, a notification is created, and the submission appears on the person's timeline.

### The Forms tab on a person

Lists every published form, answered ones first:

- **Answered**: open by default, with the date, answers grouped by page, file links, and calculated values. Questions from branches the person never saw are hidden.
- **Not answered yet**: every question with an empty answer, so you can see what is missing.
- Several submissions of the same form: a picker switches between them.
- Draft forms appear only once this person has answered them.

### Our forms

Definitions are versioned in `packages/twenty-utils/flolabs/forms/` and were created in production on 26 Oct 2026.

| Form | Status | Sent in email template | Replaces |
|---|---|---|---|
| Internship Application | Published | (application page) | HubSpot application form |
| Websites & Presentations | Published | **Contacted** | Fillout `besSHDQpaHus` |
| Meeting Recordings | Published | **BEFORE MEETING** | Fillout `wqyLXfXzWGus` |
| General Masterclass | Published | **ATTENDED + MASTERCLASSES** | Fillout `vDSyt4YMnTus` |
| Self-Assessment | Draft | not used yet | Fillout `e7bTE8V2GUus` |
| Skills & Experience | Draft | not used yet | Fillout `bDXSZ1AEWtus` |
| General Questions | Draft | not used yet | Fillout `8bYTspLnX4us` |

Notes:

- The three published Fillout replacements start with contact details (prefilled from `email`, `first_name`, `last_name`), end with an agreement page and a review page, and set `Stage = INTERESTED` on submit.
- Images in these forms still load from `images.fillout.com`. Move them to our own storage before cancelling Fillout.
- The application form maps every HubSpot field to its CRM field, and accepts CVs as PDF, DOC or DOCX up to 10 MB.

## 4. What we added on top of Twenty

The first commit of this repository is the unmodified Twenty `v2.48.1` source. Every FloLabs change is a separate commit on top, so `git log 5b44c917..main` (or `git diff <first commit>..main`) shows exactly what we changed.

| Area | Added | Twenty `v2.48.1` |
|---|---|---|
| Branding | Product name, logo, app icons, emails, AI prompts and every visible text say **FloLabs CRM** / FloLabs Innovations Group. | Twenty branding. |
| Email | **Reply all**; **Insert template** with `{{firstName}}` / `{{lastName}}`; time on every preview; protection against future-dated IMAP headers. | Reply to sender only, no templates. |
| Team inbox | One inbox for all mailboxes, Unread / Received / Sent tabs, per-person read and unread state, unread count in the sidebar. | No shared inbox, no read state. |
| Notifications | Feed of replies, form submissions and assigned tasks, with server-side read state. | None. |
| Forms | Full form builder (see [Forms](#3-forms)): 21 question types, logic, calculations, endings, actions, design and code tabs, responses and analytics, public pages, embed, prefill, Arabic and RTL, review page, image blocks. | No public forms. |
| Person page | **Forms** tab with every form's questions and answers; form submissions on the timeline. | Not available. |
| Avatars | Gravatar photo for people without an avatar. | Initials only. |
| AI assistant | Knows FloLabs stages, forms and submissions; always says "FloLabs CRM". | Generic prompt. |
| Delivery | Docker image built on GitHub Actions, approval-gated deploys with backup, health check and automatic rollback. | Official image only. |

Main code locations:

| Feature | Code |
|---|---|
| Form schema, logic engine, page renderer | `packages/twenty-shared/src/utils/public-form` |
| Form endpoints and submit handling | `packages/twenty-server/src/modules/public-form` |
| Form builder and Forms tab | `packages/twenty-front/src/modules/form-builder` |
| Forms tab widget | `packages/twenty-front/src/modules/page-layout/widgets/form-submissions` |
| Team inbox read state | `packages/twenty-server/src/engine/core-modules/messaging` |
| Team inbox UI | `packages/twenty-front/src/modules/team-inbox` |
| Notifications UI | `packages/twenty-front/src/modules/notifications` |
| Product name | `packages/twenty-front/src/modules/app/constants/AppName.ts` |
| Forms tab upgrade command | `packages/twenty-server/src/database/commands/upgrade-version-command/2-48/` |
| Deploy script, forms setup, form definitions | `packages/twenty-utils/flolabs/` |

## 5. Hosting: why Hetzner and not AWS

### Decision

We host on one **Hetzner Cloud CPX32** server in Nuremberg, decided on 25 Oct 2026, instead of the AWS design drafted on 24 Oct.

### Monthly cost

**Hetzner, as billed on our account (USD, after Hetzner's June 2026 price change):**

| Item | Per month |
|---|---|
| CPX32: 4 vCPU, 8 GB RAM, 160 GB disk, 20 TB traffic | $41.99 |
| Primary IPv4 | $0.60 |
| Automatic backups (20% of the server, 7 daily copies) | $8.40 |
| **Total** | **≈ $51** (≈ $612 a year) |
| Optional: Storage Box BX11 for off-site database copies | ≈ €3.81 |

The frontend is served from the same server, so there is no frontend hosting bill. Prices exclude VAT.

**AWS, the design we did not choose (us-east-1, on-demand list prices):**

| Item | Per month |
|---|---|
| EC2 `t4g.large`: 2 vCPU (burstable), 8 GB RAM | $49 |
| EBS gp3, 50 GB | $4 |
| Public IPv4 | $4 |
| RDS PostgreSQL `db.t4g.medium`, single-AZ | $47 |
| RDS storage, 50 GB | $6 |
| S3 for attachments | $1 |
| Data transfer out | $5 |
| Vercel Pro for the frontend | $20 |
| **Total** | **≈ $136** (≈ $1,632 a year) |

Other AWS options we priced:

| Option | Per month |
|---|---|
| Lean: one EC2 running everything in Docker (same design as our Hetzner server, but 2 burstable vCPU and 50 GB) | ≈ $60 |
| The design above with 1-year reservations | ≈ $110 |
| Fully managed: ECS Fargate + RDS + ElastiCache + load balancer | ≈ $220 |

Frankfurt (`eu-central-1`), the AWS region closest to our servers, costs about 10 to 15% more than `us-east-1`: for example RDS `db.t4g.large` is about $94 a month in us-east-1 and $109 in Frankfurt.

**Difference:** Hetzner saves about **$85 a month (≈ $1,000 a year)** against the AWS design, and gives twice the vCPUs and three times the disk of the lean AWS option for a similar price.

### Why Hetzner

1. **Cost.** About a third of the AWS design, with a flat, predictable bill. 20 TB of traffic is included, while AWS charges for data leaving the cloud.
2. **More server for the money.** 4 vCPUs instead of 2 burstable ones, and 160 GB of disk for the database and files.
3. **Our servers are already there.** n8n, Plesk and SkillSpector run on Hetzner, in the same Nuremberg location. One provider, one bill, one console, and the team already knows how to run it.
4. **The workload is small.** One workspace, a few team members, about 43,000 people. One server handles it easily; AWS's managed services solve problems we do not have yet.

### What we gave up, and how we cover it

| AWS would give us | How we cover it on Hetzner |
|---|---|
| Managed database backups and point-in-time restore (RDS) | Hetzner daily server backups (7 kept) and a `pg_dumpall` before every deploy (10 kept). Adding the Storage Box gives an off-site copy. |
| Automatic failover (multi-AZ) | None. If the server fails, we restore the latest backup to a new server; a few hours of downtime is acceptable for an internal CRM. |
| Database and OS patching done for us | We update the server ourselves; the database runs in Docker and is upgraded with each CRM release. |

**When to reconsider AWS:** if the CRM becomes customer-facing, needs high availability, or a client requires AWS for compliance.

## 6. Architecture

```
Browser ──HTTPS──> Caddy (TLS, crm.flolabsinnovations.com)
                     │
                     └──> server  (FloLabs CRM image: API + web app + public forms)
                            │        worker (same image: email sync, workflows, jobs)
                            ├──> db     PostgreSQL
                            └──> redis  cache and job queue
```

- Everything runs with Docker Compose in `/opt/flolabs-crm` on `flolabs-crm-01` (Ubuntu).
- The `server` and `worker` containers use the image tag pinned in `docker-compose.override.yml`. Deploys only change that tag.
- Caddy terminates TLS and renews certificates automatically.
- Uploaded files are stored on the server's disk, inside the backups.
- Secrets (database password, app secret, OAuth and API keys) live only in the server's environment file and in Admin Panel settings. Never commit them.

## 7. Build and deploy

### Build

`.github/workflows/flolabs-build-image.yaml` builds the Docker image on every push to `main` and publishes it to `ghcr.io/flolabsinnovationsgroup/crm` with the tags `main` and the commit SHA. A build takes about 15 minutes.

Changes only to `FLOLABS.md`, `packages/twenty-utils/flolabs/**` or the deploy workflow skip the build. The upstream Twenty CI workflows are parked in `.github/upstream-workflows-disabled/` because they rely on Twenty's own infrastructure.

### Deploy

1. A successful build starts **Deploy FloLabs CRM**, which waits for approval.
2. Approve it in GitHub → Actions → the run → **Review deployments** → `production` → **Approve**.
3. The workflow connects over SSH with a key that can only run `/opt/flolabs-crm/deploy.sh <sha>`. The script:
   - takes a lock so two deploys never overlap;
   - pulls the image;
   - backs up the whole database to `backups/pre-deploy-<date>-<sha>.sql.gz` and checks the archive;
   - switches `server` and `worker` to the new image;
   - waits for the container health check, then checks `/healthz` through Caddy;
   - **rolls back automatically** to the previous image if either check fails;
   - keeps the 10 most recent backups.
4. On start, the server runs database migrations and our upgrade commands (for example, adding the Forms tab).

To deploy or roll back to a specific commit, run **Deploy FloLabs CRM** manually with its full SHA (its image must exist).

## 8. Operations

### Backups and restore

- **Hetzner backups:** daily image of the whole server, 7 kept. Restore from the Hetzner console (Server → Backups), or create a new server from a backup.
- **Pre-deploy dumps:** `/opt/flolabs-crm/backups/pre-deploy-*.sql.gz`, a full `pg_dumpall` before each deploy.
- To restore a dump, stop `server` and `worker` first, and restore into an empty database. Test the restore on a copy before touching production.
- Before any manual change to production data, take a dump first.

### Rules we keep

- Never commit secrets. API keys are created in **Settings → APIs** and deleted when no longer needed.
- The HubSpot private app is read-only for migration; never use it for writes.
- Test emails go only to internal `+crmtest` addresses, never to applicants.
- Workflows stay off until the team activates them.
- Every production change goes through the approval-gated deploy.

### Updating from upstream Twenty

1. Fetch the new upstream tag.
2. Replace the tree with the new upstream source on a branch.
3. Re-apply our commits (`git cherry-pick`), fix conflicts, test, then deploy.

Move up one minor version at a time and back up the database first: the server runs migrations on start.

## 9. Development

See `CLAUDE.md` for commands and conventions. In short:

```bash
bash packages/twenty-utils/setup-dev-env.sh   # Postgres, Redis and database
yarn start                                    # front, server and worker
npx nx build twenty-shared                    # after changing twenty-shared
npx jest <file> --config=packages/<pkg>/jest.config.mjs
```

- **Forms objects:** a new workspace needs the `crmForm` (Forms) and `formSubmission` (Form submissions) objects. Create them once with `TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<admin API key> node packages/twenty-utils/flolabs/setup-forms.mjs`; running it again is safe.
- **Upgrade commands:** add them only under the current version folder (`2-48`) with a timestamp newer than every existing one; see `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- **Commits:** one focused commit per change, no translation catalogs unless translations are the task.

## 10. License

Twenty is AGPLv3, with some files under Twenty's commercial license (marked `/* @license Enterprise */`). Keep the `LICENSE` file and upstream copyright notices. Do not enable Enterprise-licensed features without a Twenty Enterprise subscription. Because the CRM is used over a network, AGPLv3 requires us to offer our modified source to its users.

### Price sources

- Hetzner: our Hetzner Cloud console, 25 Oct 2026.
- EC2 `t4g.large` us-east-1, $0.0672 an hour: https://calculator.holori.com/aws/ec2/t4g.large/us-east-1
- RDS `db.t4g.large` by region: https://www.bytebase.com/dbcost/rds/instance/db.t4g.large/
