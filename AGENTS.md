# AGENTS.md

Guidance for coding agents (and humans) working in this repo.

## What this is

MenuMaker: a Next.js 14 (App Router) web app that helps a household plan its
weekly meals. See `TASK.md` for the original product brief and
`docs/superpowers/plans/` for the phased implementation plans this codebase
was built from (historical design record — all 8 phases are implemented).

## Stack

- Next.js 14 (App Router, Server Actions) + React 18 + TypeScript (`strict`).
- Prisma 6 + PostgreSQL.
- Auth.js / NextAuth v4 with `@auth/prisma-adapter`, JWT session strategy
  (JWT, not database sessions, because the dev Credentials provider requires
  it — see `src/lib/auth.ts`).
- `next-intl` for i18n (English + Hungarian), no locale-prefixed routing.
- Tailwind CSS + shadcn/ui (components copied into `src/components/ui`, not a
  runtime dependency — style "new-york", see `components.json`).
- Zod for input validation.
- Vitest (unit + integration), Playwright (e2e).

## Layout

```
src/
  app/            Route segments (page.tsx + colocated actions.ts + client components)
  components/     Shared components; components/ui = shadcn primitives
  i18n/           next-intl config + locale resolution
  lib/            Business logic (Prisma-backed), imported by actions.ts files
  types/          NextAuth type augmentation
  middleware.ts   Route protection (redirects unauthenticated users)
prisma/schema.prisma
messages/{en,hu}.json
tests/{unit,integration,e2e}/
docs/superpowers/plans/   Phase-by-phase implementation plans (reference only)
```

**Convention**: `app/**/actions.ts` are thin Server Actions that call into
`src/lib/*.ts` for the actual logic (validation, Prisma queries, household
scoping). Put new business logic in `src/lib`, keep it unit-testable without
a request context, and keep it scoped to `householdId`.

## Data model (`prisma/schema.prisma`)

`Household` 1—N `User`, `Meal`, `Tag`, `PlanEntry`. `Meal` N—N `Tag` via
`MealTag`. Every `Meal` has a `category` (`soup` | `main`, `MealCategory`
enum). `PlanEntry` has one row per `(householdId, date, category)` — main
and soup are tracked and overridden independently — and a
`planned | cooked | skipped` status. `/plan` and "Generate week" are
restricted to `[today, end of current week]`
(`getFutureWeekDateKeys` in `src/lib/plan.ts`); days before today are never
shown or regenerated. Auth.js tables (`Account`, `Session`,
`VerificationToken`) are standard Prisma-adapter tables.

## Running checks before committing

```bash
npm run lint
npm run test:unit
npm run test:integration   # needs Docker
npm run test:e2e           # starts dev server itself
```

There's no Prettier config — formatting relies on ESLint
(`next/core-web-vitals`, `next/typescript`) only.

## Conventions specific to this repo

- **`ponytail:` comments** mark deliberate simplifications with a known
  ceiling and upgrade path (e.g. sequential integration tests against a
  shared DB, invite-code collision retry). Grep for `ponytail:` before
  "fixing" something that looks too simple — it may be intentional; extend
  the comment rather than deleting it if you raise the ceiling.
- **Auth safety guard**: `src/lib/auth-guard.ts` (`assertMockAuthSafe()`)
  throws if `ENABLE_MOCK_AUTH=true` with `NODE_ENV=production`. Don't remove
  or weaken this — it's what stops mock auth from ever running in prod.
- **Household scoping**: every Prisma read/write in `src/lib` for
  meals/tags/plan entries filters by `householdId` from the session. When
  adding a feature, follow the same pattern — never trust a client-supplied
  household id.
- **Weekly plan algorithm** (`src/lib/plan.ts`): pure function
  `generateWeeklyPlan()` is unit-tested without a DB; DB orchestration
  (`generateAndSaveWeeklyPlan`, `getOrCreateWeekPlan`, etc.) wraps it. Keep
  that split when changing the algorithm — it's what makes it testable.
  `generateAndSaveWeeklyPlan` calls the pure function once per
  `MealCategory` (main gets tag balancing, soup doesn't) — adding a new
  category later is one more enum value + one more pass, not a schema
  change.
- **i18n**: add new user-facing strings to both `messages/en.json` and
  `messages/hu.json` with the same key.
