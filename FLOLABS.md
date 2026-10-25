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

## Build

`.github/workflows/flolabs-build-image.yaml` builds the Docker image on every push to `main` and publishes it to `ghcr.io/flolabsinnovationsgroup/crm` (tags `main` and the commit SHA).

The upstream CI workflows are parked in `.github/upstream-workflows-disabled/` because they rely on Twenty's own infrastructure.

## Updating from upstream

1. Fetch the new upstream tag.
2. Replace the tree with the new upstream source on a branch.
3. Re-apply our commits (`git cherry-pick`), fix conflicts, then test before deploying.

Only move up one minor version at a time, and back up the database first: the server runs database migrations on start.

## License

Twenty is AGPLv3, with some files under Twenty's commercial license (marked `/* @license Enterprise */`). Keep the `LICENSE` file and upstream copyright notices. Do not enable enterprise-licensed features without a Twenty Enterprise subscription.
