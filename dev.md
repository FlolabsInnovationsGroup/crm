# Running FloLabs CRM locally

This guide takes you from a fresh machine to the CRM running on your laptop, with demo data, so you can change code and test it safely. For what the product does and how production works, see `FLOLABS.md`. For coding conventions, see `CLAUDE.md`.

**Golden rule:** local development never touches production. Do not point your local server at the production database, do not use production API keys, and do not connect the `hr@` mailbox to your local CRM.

## 1. What you need

| Tool | Version | Notes |
|---|---|---|
| Git | any recent | |
| Node.js | 24 (`.nvmrc` says `24.16.0`) | Install with `nvm install` from the repo folder. |
| Yarn | 4.13 | Comes with Node through Corepack: `corepack enable`. Do not install Yarn 1 globally. |
| Docker | Docker Desktop or Docker Engine with Compose | Runs PostgreSQL 16 and Redis 7. Alternatively install PostgreSQL 16 and Redis locally. |
| RAM | 16 GB recommended | The server build and the type checks use a lot of memory; 8 GB works but is tight. |
| Disk | at least 15 GB free | `node_modules` alone is about 5 GB, plus builds and Docker images. |

**Windows:** use WSL 2 with Ubuntu, and Docker Desktop with the WSL integration turned on. Clone the repository **inside** the Linux file system (for example `~/code/crm`), not under `/mnt/c/...`: installs and builds are many times slower on the Windows drive. Run every command below in the Ubuntu terminal.

**macOS:** install Node with `nvm` and Docker Desktop; everything else is the same.

## 2. Get the code

The repository is private. Ask an admin of the `FlolabsInnovationsGroup` GitHub organization for access first.

```bash
git clone https://github.com/FlolabsInnovationsGroup/crm.git
cd crm
nvm install          # reads .nvmrc and installs Node 24
nvm use
corepack enable      # gives you the Yarn version the repo expects
yarn install         # 5 to 15 minutes the first time
```

## 3. Start the database and create the config files

One script starts PostgreSQL and Redis, creates the `default` and `test` databases, copies `.env.example` to `.env` for the front and the server, and creates the database schema:

```bash
bash packages/twenty-utils/setup-dev-env.sh            # uses local services, or Docker if they are missing
bash packages/twenty-utils/setup-dev-env.sh --docker   # force Docker
```

It is safe to run again. Other modes:

```bash
bash packages/twenty-utils/setup-dev-env.sh --down     # stop PostgreSQL and Redis
bash packages/twenty-utils/setup-dev-env.sh --reset    # wipe local data and start clean
```

The defaults in the created files work as they are:

| File | Important values |
|---|---|
| `packages/twenty-server/.env` | `PG_DATABASE_URL=postgres://postgres:postgres@localhost:5432/default`, `REDIS_URL=redis://localhost:6379`, `FRONTEND_URL=http://localhost:3001`, `SIGN_IN_PREFILLED=true` |
| `packages/twenty-front/.env` | `REACT_APP_SERVER_BASE_URL=http://localhost:3000` |

Change `APP_SECRET` in the server `.env` to any long random string. The `.env` files are ignored by Git; never commit them.

## 4. Load demo data

```bash
npx nx build twenty-shared             # shared code used by both front and server
npx nx database:reset twenty-server    # wipes the local database and seeds demo data
```

The seed creates a demo workspace (Apple) with sample people, companies, emails and an admin user:

- Email: `tim@apple.dev`
- Password: `tim@apple.dev`

Skip `database:reset` if you prefer an empty database: you then create your own workspace on first sign-in.

## 5. Run it

```bash
yarn start
```

This starts three processes together:

| Process | Address | What it is |
|---|---|---|
| Front | http://localhost:3001 | The web app (Vite, reloads on save). |
| Server | http://localhost:3000 | API, GraphQL and public form pages (reloads on save). |
| Worker | none | Background jobs: email sync, workflows, notifications. |

Open http://localhost:3001, click **Continue with Email**, and sign in with the prefilled `tim@apple.dev` credentials.

The first start compiles everything and can take several minutes. To run the parts separately, in three terminals:

```bash
npx nx start twenty-server
npx nx start twenty-front
npx nx run twenty-server:worker
```

Stop with `Ctrl+C`. Stop the database with `bash packages/twenty-utils/setup-dev-env.sh --down`.

## 6. Trying the FloLabs features locally

The demo workspace is plain Twenty data. Some FloLabs features need objects that exist only in our production workspace, so create them locally:

**Forms (form builder, Forms tab, public forms)**

1. In the local CRM go to **Settings → Developers → API keys** and create a key.
2. Run, with that key:

   ```bash
   TWENTY_URL=http://localhost:3000 TWENTY_TOKEN=<local api key> node packages/twenty-utils/flolabs/setup-forms.mjs
   ```

3. Reload the app. **Form builder** appears in the sidebar. Our real form definitions are in `packages/twenty-utils/flolabs/forms/` if you need realistic examples.

Public form pages open at `http://localhost:3000/forms/<workspaceId>/<formId>` once a form is published.

**Email templates (Insert template in the composer)**

In **Settings → Data model**, create an object named `emailTemplate` (plural `emailTemplates`) with these fields:

| Field name | Type |
|---|---|
| `subject` | Text |
| `body` | Rich text |
| `bodyHtml` | Text |

Add a few records. The composer's **Template** picker inserts `body`, using `{{firstName}}` and `{{lastName}}` from the recipient.

**Email and the Team inbox**

The demo mailboxes are fake: you can read the seeded threads, but sending from them fails. To test real sending, connect your own test mailbox under **Settings → Accounts → Emails** (IMAP and SMTP). Send only to your own addresses or to `+crmtest` addresses, never to real applicants.

**Mailbox sharing:** as `tim@apple.dev`, open **Settings → Members → Mailboxes** and switch members on for a mailbox. Sign in as another seeded user to check they can send from it.

**AI assistant:** needs an Anthropic API key in **Admin Panel → AI** on your local instance. Use your own key, never the production one.

## 7. Checks before you push

Run these for the packages you changed (see `CLAUDE.md` for more):

```bash
npx jest path/to/file.test.ts --config=packages/twenty-front/jest.config.mjs   # one front test
npx jest path/to/file.spec.ts --config=packages/twenty-server/jest.config.mjs  # one server test
npx nx lint:diff-with-main twenty-front --configuration=fix                     # lint what you changed
npx nx lint:diff-with-main twenty-server --configuration=fix
cd packages/twenty-server && npx tsgo -p tsconfig.json --noEmit                 # type check, repeat in packages/twenty-front
```

After changing the GraphQL API on the server, start the server and regenerate the front types:

```bash
npx nx run twenty-front:graphql:generate --configuration=metadata   # metadata API (/metadata)
npx nx run twenty-front:graphql:generate                            # data API (/graphql)
```

After changing `packages/twenty-shared`, rebuild it: `npx nx build twenty-shared --skip-nx-cache`.

## 8. Sending your change

1. Create a branch: `git checkout -b fix/short-description`.
2. Commit in small, focused commits. Commit messages must not contain AI attribution lines (CI rejects them). Do not commit `.env` files or the translation catalogs under `locales/`.
3. Push the branch and open a pull request into `main`. `main` is protected: direct pushes are refused and a pull request needs approvals before it can be merged.
4. After the merge, GitHub builds the image (about 15 minutes). The **Deploy FloLabs CRM** run then waits for an admin to approve it before production changes. See `FLOLABS.md` → Build and deploy.

## 9. When something goes wrong

| Problem | Fix |
|---|---|
| `yarn: command not found` or the wrong Yarn version | Run `corepack enable` and open a new terminal. |
| `ECONNREFUSED 127.0.0.1:5432` or `:6379` | PostgreSQL or Redis is not running: `bash packages/twenty-utils/setup-dev-env.sh`. |
| Port 3000 or 3001 already in use | Another process is running. Stop it, or find it with `lsof -i :3000`. |
| Type errors or test failures right after switching branches | `twenty-shared` is stale: `npx nx build twenty-shared --skip-nx-cache`. |
| Nx says everything passed but you doubt it | Nx may serve a cached result. Run `npx tsgo -p tsconfig.json --noEmit` inside the package. |
| The build or type check is killed, or "JavaScript heap out of memory" | Close other apps and set `NODE_OPTIONS=--max-old-space-size=8192`. For `tsgo`, add `GOMEMLIMIT=4500MiB` in front of the command. |
| Very slow installs on Windows | The repository is under `/mnt/c`. Clone it again inside the WSL home folder. |
| Database is in a strange state | `npx nx database:reset twenty-server` (wipes local data) or `setup-dev-env.sh --reset`. |
| The app shows old code | Hard refresh the browser (`Ctrl+Shift+R`); for server changes wait for "Nest application successfully started". |
