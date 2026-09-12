# menumaker
MenuMaker helps a household decide what to cook next. It tracks meals and tags
(child favourite, healthy, fast to make, ...), records cooking history, and
generates a weekly meal plan that avoids recent repeats and balances tags.

## Features

- **Google sign-in** (Auth.js/NextAuth v4), no passwords stored.
- **Households**: create one or join via invite code; meals/tags/plans are
  scoped per household.
- **Weekly plan**: generates a plan for today through the end of the current
  week, with independent Main and Soup slots per day. Main uses the
  recency-avoidance + tag-balancing algorithm; Soup uses recency-avoidance
  only (scoped to soup-category meals) and can be left empty ("None").
  Swap either slot from a dropdown; past days auto-transition to
  "cooked"/"skipped" independently per slot.
- **Meals & tags**: CRUD for meals, tag them, categorize each as Soup or
  Main, filter by tag or category.
- **History**: read-only view of past cooked/skipped meals, grouped by week.
- **Household settings**: rename household, invite-link/code, member list,
  leave household, rename/delete tags, sign out.
- **i18n**: English and Hungarian (`next-intl`), locale follows the signed-in
  user, a cookie, or the browser's `Accept-Language`.

## Development

1. Copy `.env.example` to `.env.local` and adjust as needed.
2. Start a local Postgres:
   ```bash
   docker run -d --name menumaker-dev-db \
     -e POSTGRES_USER=menumaker -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=menumaker \
     -p 5432:5432 postgres:16-alpine
   ```
3. Install dependencies and run migrations:
   ```bash
   npm install
   npx prisma migrate dev
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Run unit tests:
   ```bash
   npm run test:unit
   ```
6. Run integration tests (spins up a throwaway Postgres via Docker):
   ```bash
   npm run test:integration
   ```
7. Run end-to-end tests (starts the dev server automatically):
   ```bash
   npm run test:e2e
   ```
8. Lint:
   ```bash
   npm run lint
   ```

### Auth notes

- `.env.local` should have `ENABLE_MOCK_AUTH=true` and `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` so `npm run dev` shows a "Dev login" form on `/signin` (type any name/email, no Google credentials needed).
- **`npm run build` will fail while those two flags are set** — it's the production safety guard doing its job (the app refuses to start with mock auth enabled when `NODE_ENV=production`, and `next build` sets that). Unset both flags in `.env.local` before running a local production build; leave them set for day-to-day `npm run dev` work.
- Real Google sign-in requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env.local`; without them the Google button will error, but dev-login still works.

## Deployment (Raspberry Pi 5 / openmediavault)

MenuMaker runs as two Docker containers defined in `docker-compose.yml`: `app` (the Next.js server) and `postgres` (PostgreSQL 16 with a named volume for persistence).

### 1. Create a Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project, then go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URI: `https://<your-domain-or-pi-ip>/api/auth/callback/google`.
4. Copy the generated **Client ID** and **Client Secret** — these become `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` below.

### 2. Prepare environment variables

Copy `.env.example` to `.env` in the directory containing `docker-compose.yml` on the Pi, and set:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | a strong random password (e.g. `openssl rand -base64 24`) |
| `NEXTAUTH_URL` | the public URL MenuMaker will be reachable at, e.g. `https://menumaker.example.com` or `http://<pi-lan-ip>:3000` |
| `NEXTAUTH_SECRET` | a random secret, generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 1 |

Do **not** set `ENABLE_MOCK_AUTH` or `NEXT_PUBLIC_ENABLE_MOCK_AUTH` in this file — the app throws a startup error if `ENABLE_MOCK_AUTH=true` is combined with `NODE_ENV=production`, and `docker-compose.yml` already hardcodes `NODE_ENV=production` for the `app` service.

### 3. Deploy via openmediavault's Compose UI

1. In openmediavault, install the **Compose** plugin if not already present (Services → Compose).
2. Create a new Compose project, pointing at (or pasting the contents of) this repo's `docker-compose.yml`, in the same directory as your `.env` file from step 2 (Compose automatically loads `.env` for variable substitution).
3. Deploy the project ("Up"). On first start, `docker-entrypoint.sh` runs `prisma migrate deploy` against the `postgres` service before starting the Next.js server — no manual migration step is needed.
4. Once running, visit `NEXTAUTH_URL` in a browser and sign in with Google to confirm the deployment works end-to-end.

### 4. Updating to a new version

```bash
git pull
docker compose build app
docker compose up -d
```

The entrypoint re-runs `prisma migrate deploy` on every restart, applying any new migrations automatically; already-applied migrations are no-ops.

### 5. Backups

The `postgres` service stores all data in the named volume `postgres_data`. To back it up:

```bash
docker compose exec postgres pg_dump -U menumaker menumaker > menumaker-backup-$(date +%F).sql
```

To restore into a fresh volume:

```bash
docker compose exec -T postgres psql -U menumaker menumaker < menumaker-backup-2026-01-01.sql
```

Schedule the `pg_dump` command via openmediavault's built-in cron/scheduled-tasks UI for regular backups.

