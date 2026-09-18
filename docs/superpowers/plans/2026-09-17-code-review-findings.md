# Code Review Findings — 2026-09-17

Repo-wide review: correctness/robustness pass + ponytail over-engineering audit.
Full fix plan: `2026-09-17-fix-code-review-issues.md`.

## A. Correctness & robustness (ranked by impact)

1. **"Today" and week boundaries are computed in UTC, not the server's local time** —
   `src/lib/plan.ts:3-33`. `toDateKey()` slices `toISOString()` (UTC) and
   `getWeekDateKeys()` uses `getUTCDay()`. For any user whose timezone is not
   UTC, "today" flips at UTC midnight, not local midnight: a Budapest user
   (UTC+2) at 22:00–23:59 local sees yesterday as today; a New York user (UTC−4)
   at 00:00–03:59 local sees today as yesterday. Symptoms: the plan window,
   the auto cooked/skipped transition (`transitionPastPlannedEntries`,
   `src/lib/plan.ts:98`), and history week-grouping are off by a day for up to
   |UTC offset| hours each day. Note `toDateKey` is *correct* for dates read
   back from the `@db.Date` column (Prisma returns UTC-midnight instants) —
   the bug is only in deriving "now" from a wall clock. Fix: add a
   local-calendar key helper for "now" and build the week from local date
   parts; set `TZ` explicitly in `docker-compose.yml` (see #10).

2. **`notEnoughMeals` warning hardcodes 7 days** — `src/app/plan/page.tsx:55`
   (`mainMeals.length < 7`) while the window is today..Sunday (1–7 days). On
   Sunday with 6 mains the warning shows although no day can repeat. The i18n
   strings also bake in "7 days"/"7 napra" (`messages/en.json:51`,
   `messages/hu.json:51`). Fix: compare against `futureWeek.length` and
   parameterize the message with the day count.

3. **Invite codes are 32-bit with unbounded online retry** —
   `src/lib/household.ts:4-11`. `crypto.randomUUID().slice(0, 8)` is 8 hex
   chars = 16^8 ≈ 4.3e9 (the ponytail comment claims ~2.8e12, which is base-36
   math, not hex). An attacker who signs in with one account can retry
   arbitrarily on `/onboarding` (invalid code leaves them household-less, so
   the page stays usable) — 4.3e9 lookups is brute-forceable over time with
   several accounts. Fix: 12 hex chars (16^12 ≈ 2.8e14) + correct the comment.

4. **Onboarding Server Actions skip guards the page provides** —
   `src/app/onboarding/actions.ts`. Neither `createHouseholdAction` nor
   `joinHouseholdAction` checks that the user has *no* household (only the
   page's `requireSessionNoHousehold` does); a user in household A can POST and
   be moved to household B, orphaning A. `createHouseholdAction` also only
   checks non-empty — no `householdNameSchema` (the rename path validates,
   create doesn't; the input has no `maxLength`).

5. **`updateMeal` deletes all tags then recreates them, non-atomically** —
   `src/lib/meal.ts:54-76`. If the create fails after the `deleteMany`, the
   meal keeps its old tags gone. The ponytail comment there also describes a
   strategy (scoped `updateMany`) the code doesn't implement. Fix: wrap
   check + delete + update in `prisma.$transaction`, fix the comment.

6. **Deleting a meal leaves anonymous cooked-history rows** — schema has
   `PlanEntry.mealId ON DELETE SET NULL` (intentional,
   `prisma/migrations/20260909072518_init/migration.sql:104`), so
   `deleteMeal` can't crash — but cooked entries referencing the deleted meal
   then render with an empty name in `/history`
   (`src/app/history/page.tsx:30`). Fix: filter meal-less cooked entries in
   `listCookedHistory` (`src/lib/plan.ts:216`).

7. **Settings page bypasses the lib layer and 500s on a stale session** —
   `src/app/settings/page.tsx:13-17` calls raw
   `prisma.household.findUniqueOrThrow` (violates the "logic in `src/lib`"
   convention) and throws if the household vanished concurrently (last member
   left). Fix: `getHousehold()` in `src/lib/household.ts`, redirect to
   `/onboarding` when null.

8. **`settings-view` tag list can double-add** —
   `src/app/settings/settings-view.tsx:53` appends the upserted tag without a
   duplicate check (the meal-form equivalent dedupes at
   `src/app/meals/meal-form.tsx:53`); an existing tag returns the same row →
   duplicate React keys.

9. **`prisma.config.ts` imports an undeclared dependency** —
   `prisma.config.ts:4` `import "dotenv/config"`; `dotenv` is not in
   `package.json`, it only resolves via transitive hoisting
   (prisma → @prisma/config → c12 → dotenv). Works today, breaks on any
   dependency-tree change. Fix: `npm i -D dotenv` (the generated file's own
   comment says to install it).

10. **Dev and prod run with different "local" times** — dev machines use the
    host TZ; the prod container (`docker-compose.yml`, `node:22-alpine`)
    defaults to UTC. After fix #1 ("local" dates), dev and prod would
    disagree. Fix: `TZ: ${TZ:-Europe/Budapest}` in compose + `.env.example`;
    ponytail comment: single server TZ, per-user TZ is the upgrade path for
    multi-timezone households.

11. **Google button renders even without `GOOGLE_CLIENT_ID`** —
    `src/app/signin/page.tsx:20`; clicking errors cryptically (README documents
    this). Low: hide the button when a `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set,
    or leave as documented. Optional.

12. **`/history` shows raw ISO dates** — `t('weekOf', { date: weekStartKey })`
    (`src/app/history/page.tsx:24`) prints `2026-09-07` unformatted in both
    locales. Optional i18n polish.

13. **`package.json` name is still `menumaker-scaffold`** — cosmetic.

## B. Over-engineering audit (ponytail, ranked)

1. `delete` `src/components/ui/dropdown-menu.tsx` (201 lines) + the
   `@radix-ui/react-dropdown-menu` dependency. No file outside
   `components/ui` imports it. Replacement: nothing.
2. `delete` `tests/unit/sanity.test.ts` (11 lines). A `2+3 === 5` scaffold
   leftover; the real suites prove the runner works. Add back only if the
   vitest setup itself is ever questioned.
3. `yagni` `createTagAction` is duplicated in `src/app/meals/actions.ts:38`
   and `src/app/settings/actions.ts:22` (identical 4-line bodies). Both are
   kept: colocated per-route actions are this repo's convention and the body
   is one call. No action.

**net: −212 lines, −1 dep possible.**

## Accepted as-is (deliberate simplifications, no action)

- `assertMockAuthSafe` startup guard — keep, it's the prod safety valve.
- Session callback's per-request `prisma.user.findUnique`
  (`src/lib/auth.ts:82-92`) — one index hit per render, fine at household
  scale; add a ponytail comment if it ever shows up in profiling.
- `transitionPastPlannedEntries` write-on-read on every `/plan` + `/history`
  load — idempotent, two `updateMany`s; the cheap version of a cron job.
- Invite-code no-collision-check, `renameHousehold`/`leaveHousehold`
  no-existence-checks, sequential integration tests — all already marked with
  `ponytail:` comments and documented ceilings; unchanged.
- Generate button disabled when there are zero mains even if soups exist
  (`src/app/plan/page.tsx:54`) — mains are the required category; soup-only
  households are an edge not worth a second button.
- `Session` Prisma table unused under JWT strategy — required by
  `@auth/prisma-adapter`'s standard table set; keep.