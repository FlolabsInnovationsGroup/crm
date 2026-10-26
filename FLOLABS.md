# FloLabs CRM

FloLabs' own CRM, a fork of [Twenty](https://github.com/twentyhq/twenty).

## Base version

- Upstream: `twentyhq/twenty`, tag `twenty/v2.48.1` (commit `9dc41d8`).
- The first commit of this repo is the unmodified upstream source. Every FloLabs change is a separate commit on top, so `git diff <first commit>..main` shows exactly what we changed.
- Production (`crm.flolabsinnovations.com`, Hetzner) runs the official `twentycrm/twenty:v2.48.1` image until a build of this repo has been tested.

## What we changed

- **Reply all** in email threads (Twenty only replies to the sender).
- **Insert a template** in the email composer, from the `emailTemplate` object, with `{{firstName}}` / `{{lastName}}` filled from the recipient.
- **Branding**: the product name is `APP_NAME` in `packages/twenty-front/src/modules/app/constants/AppName.ts`.
- **Form builder** (sidebar → Form builder): public forms with conditions, CRM field mapping, file uploads, hidden UTM fields, colors/fonts/RTL and custom CSS. See below.

## Forms

- One-time setup per workspace: `TWENTY_URL=https://crm.example.com TWENTY_TOKEN=<admin API key> node packages/twenty-utils/flolabs/setup-forms.mjs`. It creates the `crmForm` (Forms) and `formSubmission` (Form submissions) objects and is safe to run again.
- Public page: `/forms/<workspaceId>/<formId>`. Embed: `<script src=".../forms/<workspaceId>/<formId>/embed.js" async></script>`. Only `PUBLISHED` forms are served.
- A submission upserts the person by email (case-insensitive), stores every answer on a Form submission, and attaches uploaded files to the person. If the CRM rejects a mapped value, the person is saved with the email only and the raw answers are still kept.
- Automations: a workflow triggered on "Form submission created" can send the confirmation email or notify the team.
- Code: `packages/twenty-shared/src/utils/public-form` (schema, rules, page renderer), `packages/twenty-server/src/modules/public-form` (endpoints), `packages/twenty-front/src/modules/form-builder` (builder UI).

## Build

`.github/workflows/flolabs-build-image.yaml` builds the Docker image on every push to `main` and publishes it to `ghcr.io/flolabsinnovationsgroup/crm` (tags `main` and the commit SHA).

The upstream CI workflows are parked in `.github/upstream-workflows-disabled/` because they rely on Twenty's own infrastructure.

## Deploying

Every successful image build on `main` starts **Deploy FloLabs CRM**, which waits for approval in the `production` environment (GitHub → Actions → the run → Review deployments → Approve). It then runs `/opt/flolabs-crm/deploy.sh <sha>` on the server through an SSH key that can only run that script: database backup, image switch, health check, automatic rollback if unhealthy. To deploy a specific commit, run the workflow manually with its SHA.

## Updating from upstream

1. Fetch the new upstream tag.
2. Replace the tree with the new upstream source on a branch.
3. Re-apply our commits (`git cherry-pick`), fix conflicts, then test before deploying.

Only move up one minor version at a time, and back up the database first: the server runs database migrations on start.

## License

Twenty is AGPLv3, with some files under Twenty's commercial license (marked `/* @license Enterprise */`). Keep the `LICENSE` file and upstream copyright notices. Do not enable enterprise-licensed features without a Twenty Enterprise subscription.
