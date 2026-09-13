# MenuMaker Phase 1: Project Scaffold & Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js 14 + TypeScript + Tailwind + shadcn/ui + Prisma/PostgreSQL project skeleton, protected-route navigation shell (stub pages), Vitest test runner, and Docker Compose deployment files, so every later phase has a working app to build on.

**Architecture:** Single Next.js 14 App Router project (`app/` under `src/`) combining frontend and backend. Prisma ORM against PostgreSQL. shadcn/ui components copied into the repo (no runtime dependency on a UI package). Docker multi-stage build with `output: 'standalone'`. Vitest for unit/integration tests (added starting Phase 3), Playwright for E2E (added Phase 6).

**Tech Stack:** Next.js 14.2.35, React 18.3.1, TypeScript 5.9.3, Tailwind CSS 3.4.19, shadcn/ui (CLI 4.x), Prisma 6.19.3 / @prisma/client 6.19.3, PostgreSQL 16, Vitest 1.6.1, Docker Compose v2.

---

## Prerequisite check

- [ ] **Step 0: Verify local tooling**

Run: `node -v && npm -v && docker --version && docker compose version`
Expected: Node >= 18.18 (any LTS is fine — the Docker image will pin Node 20 independently of your host), npm 9+, Docker and Compose v2 available.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: entire project via `create-next-app` (package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.js, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, .eslintrc.json, .gitignore)

- [ ] **Step 1: Run create-next-app into the current repo**

The repo already has `README.md`, `TASK.md`, `docs/`. Scaffold into a temp dir then merge, to avoid `create-next-app` refusing a non-empty directory.

Run:
```bash
npx create-next-app@14.2.35 /tmp/menumaker-scaffold \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm
```
Expected: command completes, `/tmp/menumaker-scaffold` contains a full Next.js project.

- [ ] **Step 2: Merge scaffold into the repo**

Run (from repo root):
```bash
cp -R /tmp/menumaker-scaffold/. .
rm -rf /tmp/menumaker-scaffold
```
This overwrites nothing important (README.md and TASK.md will be overwritten by the scaffold's own README — restore ours next).

- [ ] **Step 3: Restore project README and TASK docs**

Run: `git status`
Expected: `README.md` shows as modified. Revert it and keep the original content plus a short "Development" section (added in a later step).

- [ ] **Step 4: Verify the app boots**

Run: `npm run dev &` then `sleep 3 && curl -sf http://localhost:3000 | head -c 200; kill %1`
Expected: HTML output containing `<!DOCTYPE html>`, process exits cleanly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 app with TypeScript, Tailwind, App Router"
```

---

### Task 2: Configure Next.js for standalone Docker output

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: Set standalone output**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds, `.next/standalone` directory is created.

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "chore: enable standalone Next.js output for Docker"
```

---

### Task 3: Add shadcn/ui

**Files:**
- Create: `components.json`
- Modify: `tailwind.config.ts`, `src/app/globals.css`
- Create: `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`

- [ ] **Step 1: Run shadcn init**

Run: `npx shadcn@latest init -y -d`
Expected: prompts auto-accepted with defaults (`-d` uses defaults: New York style, Slate base color, CSS variables). Creates `components.json`, updates `tailwind.config.ts` and `src/app/globals.css`, adds `src/lib/utils.ts`.

If the CLI prompts interactively despite `-y -d`, answer:
- TypeScript: yes
- Style: New York
- Base color: Slate
- CSS variables: yes

- [ ] **Step 2: Add base components used across the app**

Run: `npx shadcn@latest add button card input label dropdown-menu dialog select badge`
Expected: files created under `src/components/ui/`.

- [ ] **Step 3: Add supporting dependencies (installed automatically by the CLI, verify)**

Run: `cat package.json | grep -E "class-variance-authority|clsx|tailwind-merge|lucide-react|@radix-ui"`
Expected: entries present (added automatically by `shadcn add`).

- [ ] **Step 4: Verify build still passes**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui component library"
```

---

### Task 4: Add Prisma with PostgreSQL and the full v1 schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env` and `.env.local` are ignored — create-next-app already ignores `.env*.local`; add plain `.env`)

- [ ] **Step 1: Install Prisma**

Run: `npm install @prisma/client@6.19.3 && npm install -D prisma@6.19.3`

- [ ] **Step 2: Initialize Prisma**

Run: `npx prisma init --datasource-provider postgresql`
Expected: creates `prisma/schema.prisma` and `.env` with a `DATABASE_URL` placeholder.

- [ ] **Step 3: Replace generated schema with the full v1 data model**

Replace the contents of `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Household {
  id          String      @id @default(cuid())
  name        String
  inviteCode  String      @unique
  createdAt   DateTime    @default(now())
  users       User[]
  meals       Meal[]
  tags        Tag[]
  planEntries PlanEntry[]
}

model User {
  id            String      @id @default(cuid())
  googleId      String?     @unique
  email         String      @unique
  name          String?
  locale        String      @default("en")
  householdId   String?
  household     Household?  @relation(fields: [householdId], references: [id])
  createdMeals  Meal[]      @relation("MealCreatedBy")
  createdAt     DateTime    @default(now())
}

model Meal {
  id            String      @id @default(cuid())
  householdId   String
  household     Household   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name          String
  note          String?
  createdById   String?
  createdBy     User?       @relation("MealCreatedBy", fields: [createdById], references: [id])
  tags          MealTag[]
  planEntries   PlanEntry[]
  createdAt     DateTime    @default(now())
}

model Tag {
  id            String      @id @default(cuid())
  householdId   String
  household     Household   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name          String
  meals         MealTag[]

  @@unique([householdId, name])
}

model MealTag {
  mealId String
  tagId  String
  meal   Meal @relation(fields: [mealId], references: [id], onDelete: Cascade)
  tag    Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([mealId, tagId])
}

enum PlanEntryStatus {
  planned
  cooked
  skipped
}

model PlanEntry {
  id          String          @id @default(cuid())
  householdId String
  household   Household       @relation(fields: [householdId], references: [id], onDelete: Cascade)
  date        DateTime        @db.Date
  mealId      String?
  meal        Meal?           @relation(fields: [mealId], references: [id])
  status      PlanEntryStatus @default(planned)

  @@unique([householdId, date])
}
```

- [ ] **Step 4: Point `.env` at a local dev Postgres and start one**

Run:
```bash
docker run -d --name menumaker-dev-db \
  -e POSTGRES_USER=menumaker -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=menumaker \
  -p 5432:5432 postgres:16-alpine
```

Edit `.env`:
```
DATABASE_URL="postgresql://menumaker:devpass@localhost:5432/menumaker?schema=public"
```

- [ ] **Step 5: Run the first migration**

Run: `npx prisma migrate dev --name init`
Expected: `prisma/migrations/<timestamp>_init/migration.sql` created, applied successfully, Prisma Client generated.

- [ ] **Step 6: Add the Prisma client singleton**

Create `src/lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 7: Create `.env.example`**

```
# Local dev database (see README for `docker run` command to start one)
DATABASE_URL="postgresql://menumaker:devpass@localhost:5432/menumaker?schema=public"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-openssl-rand--base64-32-output"

# Google OAuth (optional locally if ENABLE_MOCK_AUTH=true)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Local dev only: enables a "type any name/email" credentials login, bypassing Google.
# Never set this to true in production — the app refuses to start if it detects that.
ENABLE_MOCK_AUTH=true
```

- [ ] **Step 8: Verify `.gitignore` covers env files**

Run: `grep -E "^\.env" .gitignore`
Expected: at least `.env*.local` present (added by create-next-app). Add a plain `.env` line if missing:

```
.env
```

- [ ] **Step 9: Verify Prisma Client works end-to-end**

Run:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.household.count().then((n) => { console.log('households:', n); process.exit(0); });
"
```
Expected: `households: 0`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and client for MenuMaker data model"
```

---

### Task 5: Navigation shell with protected-route stub pages

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/app/plan/page.tsx`, `src/app/meals/page.tsx`, `src/app/history/page.tsx`, `src/app/settings/page.tsx`, `src/components/nav.tsx`

These stub pages exist so routing/navigation works end-to-end now; Phases 2–7 replace their contents.

- [ ] **Step 1: Root layout with a simple top nav**

`src/components/nav.tsx`:
```tsx
import Link from 'next/link';

const links = [
  { href: '/plan', label: 'Weekly Plan' },
  { href: '/meals', label: 'Meals' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-4">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MenuMaker',
  description: 'Plan your family dinner menu',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Nav />
        <main className="p-4">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Home page redirects to the plan (until Phase 2 adds auth-aware redirect logic)**

`src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/plan');
}
```

- [ ] **Step 3: Stub pages**

`src/app/plan/page.tsx`:
```tsx
export default function PlanPage() {
  return <h1 className="text-2xl font-bold">Weekly Plan</h1>;
}
```

`src/app/meals/page.tsx`:
```tsx
export default function MealsPage() {
  return <h1 className="text-2xl font-bold">Meals</h1>;
}
```

`src/app/history/page.tsx`:
```tsx
export default function HistoryPage() {
  return <h1 className="text-2xl font-bold">History</h1>;
}
```

`src/app/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return <h1 className="text-2xl font-bold">Household Settings</h1>;
}
```

- [ ] **Step 4: Verify navigation manually**

Run: `npm run dev`
Visit `http://localhost:3000` in a browser — expect a redirect to `/plan` showing "Weekly Plan", with a nav bar linking to all four stub pages.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add navigation shell and stub pages for all v1 screens"
```

---

### Task 6: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)
- Create: `tests/unit/sanity.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@1.6.1`

- [ ] **Step 2: Configure Vitest**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add to `"scripts"`:
```json
"test:unit": "vitest run tests/unit",
"test:unit:watch": "vitest tests/unit"
```

- [ ] **Step 4: Write a failing sanity test**

`tests/unit/sanity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

function add(a: number, b: number) {
  return a - b; // intentionally wrong, to prove the test can fail
}

describe('sanity', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npm run test:unit`
Expected: FAIL — `expect(received).toBe(expected)` with `received: -1`.

- [ ] **Step 6: Fix the implementation**

```ts
function add(a: number, b: number) {
  return a + b;
}
```

- [ ] **Step 7: Run it and confirm it passes**

Run: `npm run test:unit`
Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add Vitest runner with a sanity test"
```

---

### Task 7: Dockerfile and Compose files

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.test.yml`

- [ ] **Step 1: Write the Dockerfile (multi-stage, Alpine, standalone output)**

`Dockerfile`:
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

- [ ] **Step 2: Write the entrypoint that runs migrations before starting the server**

`docker-entrypoint.sh`:
```bash
#!/bin/sh
set -e
npx prisma migrate deploy
exec node server.js
```

- [ ] **Step 3: Write `.dockerignore`**

```
node_modules
.next
.git
*.md
tests
docs
```

- [ ] **Step 4: Write the production Compose file**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: menumaker
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: menumaker
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U menumaker"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://menumaker:${POSTGRES_PASSWORD}@postgres:5432/menumaker
      NEXTAUTH_URL: ${NEXTAUTH_URL}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      NODE_ENV: production
    ports:
      - '3000:3000'

volumes:
  postgres_data:
```

Note: `ENABLE_MOCK_AUTH` is deliberately absent here — it is never set in production.

- [ ] **Step 5: Write the ephemeral test-database Compose file (used by integration tests from Phase 3 onward)**

`docker-compose.test.yml`:
```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    ports:
      - '5433:5432'
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: menumaker_test
    tmpfs:
      - /var/lib/postgresql/data
```

`tmpfs` keeps test data in memory so each run starts clean without manual teardown.

- [ ] **Step 6: Validate Compose files parse**

Run: `docker compose -f docker-compose.yml config > /dev/null && echo OK`
Run: `docker compose -f docker-compose.test.yml config > /dev/null && echo OK`
Expected: both print `OK`. (`docker-compose.yml` will warn about unset `${POSTGRES_PASSWORD}` etc. — that's expected until real env vars are supplied at deploy time; the warning does not fail the command.)

- [ ] **Step 7: Build the Docker image locally**

Run: `docker build -t menumaker:local .`
Expected: image builds successfully (this validates the Dockerfile end-to-end, including `prisma generate` and `next build`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add Dockerfile and docker-compose files for deployment and testing"
```

---

### Task 8: README setup instructions (local dev section only — full deployment docs land in Phase 8)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Development section**

Append to `README.md`:
```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add local development setup instructions"
```

---

## Self-Review Notes

- **Spec coverage:** Framework (Next.js 14 App Router), UI components (shadcn/ui), ORM/DB (Prisma/Postgres), Docker Compose with `app` + `postgres` services — all covered. Data model fully captured in `prisma/schema.prisma`, matching the spec's Household/User/Meal/Tag/MealTag/PlanEntry entities exactly, including the `PlanEntryStatus` enum (`planned | cooked | skipped`).
- **Deferred to later phases:** Auth (Phase 2), i18n (Phase 3), business logic and remaining screens (Phases 3–7), Playwright E2E (Phase 6), production deployment docs (Phase 8).
