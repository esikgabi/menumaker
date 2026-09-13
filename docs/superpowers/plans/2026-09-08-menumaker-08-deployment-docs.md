# MenuMaker Phase 8: Production Deployment Documentation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document how to deploy MenuMaker to the target production environment (Docker Compose on a Raspberry Pi 5 via openmediavault), including Google OAuth credential setup, required environment variables, first-run migration behavior, and basic backup guidance for the Postgres volume. This is a documentation-only phase — no application code changes.

**Depends on:** Phase 1 (`Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, README's existing "Development" section).

---

### Task 1: Deployment section in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Deployment section**

Append to `README.md` (after the existing "Development" section from Phase 1):

```markdown
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
```

- [ ] **Step 2: Verify the doc against the actual Compose/env files**

Run: `grep -E "POSTGRES_PASSWORD|NEXTAUTH_URL|NEXTAUTH_SECRET|GOOGLE_CLIENT" docker-compose.yml`
Expected: every variable named in the README's table appears in `docker-compose.yml`'s `app`/`postgres` service `environment` blocks (from Phase 1) — confirms no drift between the doc and the actual compose file before committing.

Run: `grep -E "ENABLE_MOCK_AUTH" docker-compose.yml`
Expected: no output — confirms `ENABLE_MOCK_AUTH` is genuinely absent from the production compose file, matching the doc's claim.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add production deployment guide for Pi/openmediavault"
```

---

## Self-Review Notes

- **Spec coverage:** "Deployment: docker-compose.yml with app + postgres... deployable via openmediavault's Docker/Compose UI on the Pi" — documented end-to-end: Google OAuth client creation (required since spec mandates Google-only auth with no password storage), environment variable reference matching exactly what Phase 1's `docker-compose.yml` consumes, first-run migration behavior (already automatic via Phase 1's `docker-entrypoint.sh`, just documented here), update procedure, and backup/restore commands for the named Postgres volume.
- **No code changes:** this phase is documentation-only; Step 2's `grep` checks are the "test" for a docs phase — they verify the documented variables actually match the real compose file rather than drifting from it.
- **This is the final planned phase.** Phases 1–8 now cover every item in the spec's Scope, Screens, Error Handling, and Testing Strategy sections.
