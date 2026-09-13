# Meal Categories & Future-Only Plan Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required `soup`/`main` category to `Meal`, split `PlanEntry` into one row per `(date, category)` so soup and main are tracked/overridden independently, and restrict `/plan` viewing + "Generate week" to `[today, end of current week]`.

**Architecture:** Additive Prisma migration (`MealCategory` enum, `Meal.category`, `PlanEntry.category` + new unique constraint). `generateWeeklyPlan` (pure function) is unchanged in shape; `generateAndSaveWeeklyPlan` calls it twice (main pass, soup pass) and writes both. A new `getFutureWeekDateKeys()` helper filters the existing `getWeekDateKeys()` output to `>= today`, used by `/plan`'s page and actions (not by history, which keeps using the full week for grouping). UI: `plan-view.tsx` renders two rows/day; `meal-form.tsx` gets a required category select; `meal-list.tsx` gets a category badge + filter.

**Tech Stack:** Next.js 14 App Router, Prisma 6 + PostgreSQL, Zod, next-intl, Vitest, Playwright, shadcn/ui `Select`.

**Full design spec:** `docs/superpowers/specs/2026-09-12-meal-categories-and-future-plan-window-design.md` — read it before starting; this plan implements it task-by-task.

---

## Task-file map

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `MealCategory` enum; `Meal.category`; `PlanEntry.category` + new `@@unique` |
| `prisma/migrations/<ts>_add_meal_category/migration.sql` | New migration (generated) |
| `src/lib/meal.ts` | `mealInputSchema` gains `category`; `createMeal`/`updateMeal`/`listMeals` pass it through |
| `src/lib/plan.ts` | `PlanMeal`/`CookedHistoryEntry` gain `category`; `getFutureWeekDateKeys()`; `getOrCreateWeekPlan`, `generateAndSaveWeeklyPlan`, `setPlanEntryMeal`, `listCookedHistory` become category-aware |
| `src/app/plan/page.tsx` | Use `getFutureWeekDateKeys`; group entries per day into `{ main, soup }` |
| `src/app/plan/actions.ts` | `overrideDayAction`/`generateWeekAction` pass `category`; use future-only week |
| `src/app/plan/plan-view.tsx` | Two rows/day (Main mandatory, Soup with "None") |
| `src/app/meals/actions.ts` | `parseMealForm` reads `category` from form data |
| `src/app/meals/meal-form.tsx` | Required category `Select` |
| `src/app/meals/meal-list.tsx` | Category badge + `?category=` filter |
| `src/app/meals/page.tsx` | Pass `category` search param through to `listMeals` |
| `src/app/history/page.tsx` | No structural change (already renders one line per `PlanEntry`; now that includes soup rows) — verify only |
| `messages/en.json`, `messages/hu.json` | New keys: category labels, soup "None" option, category field label |
| `tests/unit/plan-dates.test.ts` | Add `getFutureWeekDateKeys` tests |
| `tests/unit/plan-algorithm.test.ts` | No change needed (category filtering happens above this pure function — it already takes a flat `meals`/`cookedHistory` list per call) |
| `tests/unit/meal.test.ts` | `mealInputSchema` category tests |
| `tests/integration/plan.test.ts` | Category-aware assertions: per-day main+soup rows, independent override/cooked-immutability |
| `tests/integration/plan-history.test.ts` | Assert `category` present on returned entries |
| `tests/integration/meal.test.ts` | `createMeal`/`updateMeal` category persistence |
| `tests/e2e/happy-path.spec.ts` | Extend to add a soup meal, assert both slots render |

---

## Phase 1 — Data model & pure logic (no UI)

### Task 1: Prisma schema — `MealCategory` enum + columns

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the enum and columns**

In `prisma/schema.prisma`, add a new enum right after `enum PlanEntryStatus { ... }` (around line 107):

```prisma
enum MealCategory {
  soup
  main
}
```

Modify the `Meal` model to add `category`:

```prisma
model Meal {
  id            String      @id @default(cuid())
  householdId   String
  household     Household   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name          String
  note          String?
  category      MealCategory @default(main)
  createdById   String?
  createdBy     User?       @relation("MealCreatedBy", fields: [createdById], references: [id])
  tags          MealTag[]
  planEntries   PlanEntry[]
  createdAt     DateTime    @default(now())
}
```

Modify the `PlanEntry` model — add `category` (no default) and replace the unique constraint:

```prisma
model PlanEntry {
  id          String          @id @default(cuid())
  householdId String
  household   Household       @relation(fields: [householdId], references: [id], onDelete: Cascade)
  date        DateTime        @db.Date
  category    MealCategory
  mealId      String?
  meal        Meal?           @relation(fields: [mealId], references: [id])
  status      PlanEntryStatus @default(planned)

  @@unique([householdId, date, category])
}
```

- [ ] **Step 2: Generate the migration**

Run (dev DB container `menumaker-dev-db` must be up — it already is per `docker ps`):

```bash
npx prisma migrate dev --name add_meal_category
```

When prompted about the new required `PlanEntry.category` column with existing rows, Prisma will ask how to handle it — since there's no data loss risk (dev DB only, no production data), if prompted for a default value for backfilling existing rows, supply `main`. If Prisma generates the migration without prompting (e.g. because the table happens to be empty), open the generated `prisma/migrations/<timestamp>_add_meal_category/migration.sql` and verify/add these two backfill statements so the migration is correct against a populated database too — insert them between the `ALTER TABLE ... ADD COLUMN` statements and the `CREATE UNIQUE INDEX` statement:

```sql
-- AlterTable
ALTER TABLE "Meal" ADD COLUMN "category" "MealCategory" NOT NULL DEFAULT 'main';

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN "category" "MealCategory";
UPDATE "PlanEntry" SET "category" = 'main' WHERE "category" IS NULL;
ALTER TABLE "PlanEntry" ALTER COLUMN "category" SET NOT NULL;

-- DropIndex (old constraint)
DROP INDEX IF EXISTS "PlanEntry_householdId_date_key";

-- CreateIndex (new constraint)
CREATE UNIQUE INDEX "PlanEntry_householdId_date_category_key" ON "PlanEntry"("householdId", "date", "category");
```

Note the enum itself (`CREATE TYPE "MealCategory" AS ENUM ('soup', 'main');`) must also be present near the top of the migration file — Prisma generates this automatically.

- [ ] **Step 3: Verify migration applied cleanly**

```bash
npx prisma migrate status
```

Expected: "Database schema is up to date!"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add MealCategory enum and category columns to Meal/PlanEntry"
```

---

### Task 2: `mealInputSchema` gains required `category`

**Files:**
- Modify: `src/lib/meal.ts`
- Test: `tests/unit/meal.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/meal.test.ts`, add inside the existing `describe('mealInputSchema', ...)` block:

```ts
  it('accepts a valid meal with category "soup"', () => {
    const result = mealInputSchema.safeParse({
      name: 'Tomato Soup',
      note: '',
      tagIds: [],
      category: 'soup',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid meal with category "main"', () => {
    const result = mealInputSchema.safeParse({
      name: 'Spaghetti',
      note: '',
      tagIds: [],
      category: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing category', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category value', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'dessert' });
    expect(result.success).toBe(false);
  });
```

Also update every OTHER existing test in this file that calls `mealInputSchema.safeParse(...)` without a `category` field (the three earlier tests: "accepts a valid meal with tags", "rejects an empty name", "rejects a name over 100 characters", "rejects a note over 500 characters") to add `category: 'main'` to their input object — otherwise they'll start failing once `category` becomes required (except the empty-name/name-too-long/note-too-long tests, which assert `success === false` and stay `false` either way, but add `category: 'main'` anyway so they test the *intended* failure reason, not an incidental one). The "accepts a meal with no note and no tags" test also needs `category: 'main'` added since it currently asserts `success === true`.

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm run test:unit -- tests/unit/meal.test.ts
```

Expected: FAIL on the 4 new tests (schema doesn't have `category` yet, so "rejects a missing category" also incorrectly passes today — check that the two "accepts" tests fail).

- [ ] **Step 3: Update the schema**

In `src/lib/meal.ts`, add the import and field:

```ts
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()),
  category: z.enum(['soup', 'main']),
});

export type MealInput = z.infer<typeof mealInputSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- tests/unit/meal.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meal.ts tests/unit/meal.test.ts
git commit -m "feat: require category on mealInputSchema"
```

---

### Task 3: `createMeal`/`updateMeal`/`listMeals` persist and filter by `category`

**Files:**
- Modify: `src/lib/meal.ts`
- Test: `tests/integration/meal.test.ts`

**Context:** `createMeal`/`updateMeal` currently don't pass `category` to Prisma at all (schema has a DB default of `main`, so this technically "works" but ignores the caller's choice — must be fixed to actually persist it). `listMeals` needs an optional `category` filter alongside the existing `tagId` filter, mirroring the existing pattern exactly.

- [ ] **Step 1: Write the failing tests**

In `tests/integration/meal.test.ts`, add these tests inside `describe('meal CRUD and household isolation', ...)`:

```ts
  it('persists the category chosen at creation', async () => {
    const household = await makeHousehold('O');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;

    const meal = await createMeal(household.id, owner.id, {
      name: 'Chicken Soup',
      note: '',
      tagIds: [],
      category: 'soup',
    });

    expect(meal.category).toBe('soup');
  });

  it('updates the category on an existing meal', async () => {
    const household = await makeHousehold('P');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const meal = await createMeal(household.id, owner.id, {
      name: 'Recategorized',
      note: '',
      tagIds: [],
      category: 'main',
    });

    const updated = await updateMeal(household.id, meal.id, {
      name: 'Recategorized',
      note: '',
      tagIds: [],
      category: 'soup',
    });

    expect(updated?.category).toBe('soup');
  });

  it('filters meals by category', async () => {
    const household = await makeHousehold('Q');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    await createMeal(household.id, owner.id, { name: 'Soup Meal', note: '', tagIds: [], category: 'soup' });
    await createMeal(household.id, owner.id, { name: 'Main Meal', note: '', tagIds: [], category: 'main' });

    const soupMeals = await listMeals(household.id, undefined, 'soup');

    expect(soupMeals).toHaveLength(1);
    expect(soupMeals[0].name).toBe('Soup Meal');
  });
```

All other calls to `createMeal`/`updateMeal` already in this file (and in `tests/integration/plan.test.ts` / `tests/integration/plan-history.test.ts`) omit `category` — once `mealInputSchema`/`createMeal` require it via TypeScript's `MealInput` type, those calls will fail to compile. Update every existing `createMeal(...)` call site across `tests/integration/meal.test.ts`, `tests/integration/plan.test.ts`, and `tests/integration/plan-history.test.ts` to add `category: 'main'` to their input object (find them by searching for `createMeal(` in those three files — there are roughly 15 call sites total). Use `category: 'main'` for all of them; none of the existing plan/history tests care about soup-specific behavior, so `main` keeps them semantically equivalent to today.

- [ ] **Step 2: Run tests to verify new ones fail, others still compile-fail until Step 3**

```bash
npm run test:integration
```

Expected: TypeScript compile error on `listMeals(household.id, undefined, 'soup')` (3rd arg doesn't exist yet) and on `createMeal` calls missing `category` (until you've added it per Step 1's last paragraph) — confirms the tests exercise the not-yet-built code paths.

- [ ] **Step 3: Implement**

In `src/lib/meal.ts`, update `listMeals`, `createMeal`, and `updateMeal`:

```ts
export async function listMeals(householdId: string, tagId?: string, category?: 'soup' | 'main') {
  return prisma.meal.findMany({
    where: {
      householdId,
      ...(tagId ? { tags: { some: { tagId } } } : {}),
      ...(category ? { category } : {}),
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { name: 'asc' },
  });
}
```

```ts
export async function createMeal(householdId: string, createdById: string, input: MealInput) {
  const tagIds = await ownedTagIds(householdId, input.tagIds);
  return prisma.meal.create({
    data: {
      householdId,
      createdById,
      name: input.name,
      note: input.note || null,
      category: input.category,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}
```

```ts
export async function updateMeal(householdId: string, mealId: string, input: MealInput) {
  const owned = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!owned) return null;

  await prisma.mealTag.deleteMany({ where: { mealId } });

  const tagIds = await ownedTagIds(householdId, input.tagIds);

  return prisma.meal.update({
    where: { id: mealId },
    data: {
      name: input.name,
      note: input.note || null,
      category: input.category,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meal.ts tests/integration/meal.test.ts tests/integration/plan.test.ts tests/integration/plan-history.test.ts
git commit -m "feat: persist and filter meals by category"
```

---

### Task 4: `getFutureWeekDateKeys` — the today-onward window filter

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/unit/plan-dates.test.ts`

**Context:** Per the design spec's "Plan Window" section, the filter is `getWeekDateKeys(new Date()).filter((k) => k >= toDateKey(new Date()))`. Wrap this in a named helper so `/plan`'s page and actions don't duplicate the expression, and so it's independently unit-testable against a fixed reference date (the existing `getWeekDateKeys` tests already use fixed reference dates for Monday/Tuesday/Sunday — follow that pattern, but note `getFutureWeekDateKeys` takes no reference-date parameter in production use since "today" is always `new Date()`; to test it deterministically, give it an optional second parameter for injection).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/plan-dates.test.ts`, add:

```ts
describe('getFutureWeekDateKeys', () => {
  it('returns all 7 days when today is Monday', () => {
    const monday = new Date('2026-09-07T00:00:00Z');
    expect(getFutureWeekDateKeys(monday, monday)).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns Tuesday through Sunday when today is Tuesday', () => {
    const tuesday = new Date('2026-09-08T00:00:00Z');
    expect(getFutureWeekDateKeys(tuesday, tuesday)).toEqual([
      '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns Wednesday through Sunday when today is Wednesday', () => {
    const wednesday = new Date('2026-09-09T00:00:00Z');
    expect(getFutureWeekDateKeys(wednesday, wednesday)).toEqual([
      '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns only Sunday when today is Sunday', () => {
    const sunday = new Date('2026-09-13T00:00:00Z');
    expect(getFutureWeekDateKeys(sunday, sunday)).toEqual(['2026-09-13']);
  });

  it('uses the reference date to compute the week but the today date to filter', () => {
    // reference = Monday of the week; today = Thursday of that same week
    const monday = new Date('2026-09-07T00:00:00Z');
    const thursday = new Date('2026-09-10T00:00:00Z');
    expect(getFutureWeekDateKeys(monday, thursday)).toEqual([
      '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });
});
```

Update the import line at the top of the file:

```ts
import { describe, expect, it } from 'vitest';
import { getWeekDateKeys, getFutureWeekDateKeys, toDateKey } from '@/lib/plan';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- tests/unit/plan-dates.test.ts
```

Expected: FAIL with "getFutureWeekDateKeys is not a function" (or import error).

- [ ] **Step 3: Implement**

In `src/lib/plan.ts`, add right after `getWeekDateKeys`:

```ts
/**
 * Returns the date keys of `getWeekDateKeys(reference)` that are `>= today`
 * — i.e. the current Mon-Sun week, restricted to today onward. `today`
 * defaults to `reference` (production call sites always pass `new Date()`
 * for both, since "the week" and "today" are the same instant); the
 * separate parameter exists so tests can pin the week and the cutoff
 * independently.
 */
export function getFutureWeekDateKeys(reference: Date, today: Date = reference): string[] {
  const todayKey = toDateKey(today);
  return getWeekDateKeys(reference).filter((k) => k >= todayKey);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- tests/unit/plan-dates.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts tests/unit/plan-dates.test.ts
git commit -m "feat: add getFutureWeekDateKeys for the today-onward plan window"
```

---

### Task 5: `generateAndSaveWeeklyPlan` runs two category-scoped passes

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/integration/plan.test.ts`

**Context:** This is the core of the feature. `PlanMeal` and `CookedHistoryEntry` need a `category` field so the two passes can filter independently (per the design spec's "Weekly Plan Generation" section). `getOrCreateWeekPlan` must create 2 rows per day (one `main`, one `soup`) instead of 1. `setPlanEntryMeal` must take a `category` parameter and use the new 3-part unique key. `generateWeeklyPlan` itself (the pure function) is unchanged — it's called twice, once per category, with pre-filtered inputs.

- [ ] **Step 1: Write the failing tests**

Replace the entire `describe('getOrCreateWeekPlan', ...)` block in `tests/integration/plan.test.ts` with:

```ts
describe('getOrCreateWeekPlan', () => {
  it('creates a main and soup entry per day for a new week and is idempotent', async () => {
    const { household } = await makeHouseholdWithMeals('A', []);
    const week = getWeekDateKeys(new Date());

    const first = await getOrCreateWeekPlan(household.id, week);
    expect(first).toHaveLength(14); // 7 days x 2 categories
    expect(first.every((e) => e.status === 'planned')).toBe(true);
    expect(first.filter((e) => e.category === 'main')).toHaveLength(7);
    expect(first.filter((e) => e.category === 'soup')).toHaveLength(7);

    const second = await getOrCreateWeekPlan(household.id, week);
    expect(second).toHaveLength(14); // no duplicates created
  });

  it('handles concurrent calls for a brand-new week without throwing', async () => {
    const { household } = await makeHouseholdWithMeals('L', []);
    const week = getWeekDateKeys(new Date());

    const [first, second] = await Promise.all([
      getOrCreateWeekPlan(household.id, week),
      getOrCreateWeekPlan(household.id, week),
    ]);

    expect(first).toHaveLength(14);
    expect(second).toHaveLength(14);
  });
});
```

Update `makeHouseholdWithMeals` (used across this file) to accept an optional category per meal name — change its signature and every call site. Replace:

```ts
async function makeHouseholdWithMeals(suffix: string, mealNames: string[]) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@plan-test.example.com`, name: 'Owner' },
  });
  const household = await createHouseholdWithOwner(`Plan Test Household ${suffix}`, owner.id);
  const meals = [];
  for (const name of mealNames) {
    meals.push(await createMeal(household.id, owner.id, { name, note: '', tagIds: [] }));
  }
  return { household, owner, meals };
}
```

with:

```ts
async function makeHouseholdWithMeals(
  suffix: string,
  mealSpecs: (string | { name: string; category: 'soup' | 'main' })[],
) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@plan-test.example.com`, name: 'Owner' },
  });
  const household = await createHouseholdWithOwner(`Plan Test Household ${suffix}`, owner.id);
  const meals = [];
  for (const spec of mealSpecs) {
    const { name, category } = typeof spec === 'string' ? { name: spec, category: 'main' as const } : spec;
    meals.push(await createMeal(household.id, owner.id, { name, note: '', tagIds: [], category }));
  }
  return { household, owner, meals };
}
```

This keeps every existing call site (which passes plain string arrays like `['Meal 1', 'Meal 2', 'Meal 3']`) working unchanged — they all default to `main`.

Replace `describe('generateAndSaveWeeklyPlan', ...)` with:

```ts
describe('generateAndSaveWeeklyPlan', () => {
  it('assigns main meals for a household and does not touch another household', async () => {
    const { household } = await makeHouseholdWithMeals('B', ['Meal 1', 'Meal 2', 'Meal 3']);
    const { household: otherHousehold } = await makeHouseholdWithMeals('C', ['Other Meal']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.filter((e) => e.category === 'main' && e.mealId !== null).length).toBeGreaterThan(0);

    const otherEntries = await getOrCreateWeekPlan(otherHousehold.id, week);
    expect(otherEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('assigns soup meals independently of main meals', async () => {
    const { household } = await makeHouseholdWithMeals('SOUP1', [
      { name: 'Main A', category: 'main' },
      { name: 'Main B', category: 'main' },
      { name: 'Soup A', category: 'soup' },
      { name: 'Soup B', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    const soupEntries = entries.filter((e) => e.category === 'soup');
    const mainEntries = entries.filter((e) => e.category === 'main');
    expect(soupEntries.every((e) => e.meal?.category === 'soup')).toBe(true);
    expect(mainEntries.every((e) => e.meal?.category === 'main')).toBe(true);
    expect(soupEntries.some((e) => e.mealId !== null)).toBe(true);
  });

  it('leaves soup empty for every day when the household has no soup meals', async () => {
    const { household } = await makeHouseholdWithMeals('SOUP2', ['Main Only']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    const soupEntries = entries.filter((e) => e.category === 'soup');
    expect(soupEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('does not overwrite a day already marked cooked, independently per category', async () => {
    const { household, meals } = await makeHouseholdWithMeals('D', [
      { name: 'Meal X', category: 'main' },
      { name: 'Meal Y', category: 'main' },
      { name: 'Soup X', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    await generateAndSaveWeeklyPlan(household.id, week);

    const mainEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    expect(mainEntry?.mealId).toBe(meals[0].id);
    expect(mainEntry?.status).toBe('cooked');

    // the soup sibling row for the same day is still regenerable
    const soupEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'soup' } },
    });
    expect(soupEntry?.status).toBe('planned');
  });
});
```

Replace `describe('setPlanEntryMeal', ...)` with:

```ts
describe('setPlanEntryMeal', () => {
  it('overrides a day with a chosen meal for the given category', async () => {
    const { household, meals } = await makeHouseholdWithMeals('E', [
      { name: 'Meal 1', category: 'main' },
      { name: 'Meal 2', category: 'main' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[2], 'main', meals[1].id);

    expect(result?.mealId).toBe(meals[1].id);
    expect(result?.category).toBe('main');
  });

  it('overrides a soup slot independently of the main slot on the same day', async () => {
    const { household, meals } = await makeHouseholdWithMeals('SOUP3', [
      { name: 'Main 1', category: 'main' },
      { name: 'Soup 1', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await setPlanEntryMeal(household.id, week[0], 'main', meals[0].id);
    await setPlanEntryMeal(household.id, week[0], 'soup', meals[1].id);

    const mainEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    const soupEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'soup' } },
    });
    expect(mainEntry?.mealId).toBe(meals[0].id);
    expect(soupEntry?.mealId).toBe(meals[1].id);
  });

  it('rejects a meal that belongs to another household', async () => {
    const { household } = await makeHouseholdWithMeals('F', []);
    const { meals: otherMeals } = await makeHouseholdWithMeals('G', ['Foreign Meal']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[0], 'main', otherMeals[0].id);

    expect(result).toBeNull();
  });

  it('rejects an override on a day already marked cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('K', [
      { name: 'Meal 1', category: 'main' },
      { name: 'Meal 2', category: 'main' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    const result = await setPlanEntryMeal(household.id, week[0], 'main', meals[1].id);

    expect(result).toBeNull();
    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    expect(entry?.status).toBe('cooked');
    expect(entry?.mealId).toBe(meals[0].id);
  });
});
```

The `transitionPastPlannedEntries` describe block is unaffected by category (it operates on `status`/`date`/`mealId` regardless of category) — leave it as-is, but update its three `prisma.planEntry.create({ data: { ... } })` calls to add `category: 'main'` since `category` is now a required column with no DB default on `PlanEntry`. Find the three `prisma.planEntry.create` calls in the `transitionPastPlannedEntries` describe block and add `category: 'main',` to each `data` object.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration
```

Expected: compile/runtime failures — `setPlanEntryMeal` doesn't accept a category arg yet, `householdId_date_category` unique key doesn't exist yet on the Prisma client types, `getOrCreateWeekPlan` returns 7 not 14 rows.

- [ ] **Step 3: Implement**

In `src/lib/plan.ts`, update the types:

```ts
export type PlanMeal = { id: string; name: string; tags: string[] };
export type CookedHistoryEntry = { mealId: string; dateKey: string };
```

stays unchanged (these describe a single category's inputs — the caller filters before invoking `generateWeeklyPlan`, per the design spec). `generateWeeklyPlan` itself is unchanged.

Replace `getOrCreateWeekPlan`:

```ts
const MEAL_CATEGORIES = ['main', 'soup'] as const;

/** Ensures a main and soup PlanEntry row exists for every date key in the week, then returns them with meal+tags included. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const missing = weekDateKeys.flatMap((dateKey) =>
    MEAL_CATEGORIES.filter((category) => !existingKeys.has(`${dateKey}:${category}`)).map((category) => ({
      householdId,
      date: new Date(dateKey),
      category,
      status: 'planned' as const,
    })),
  );
  if (missing.length > 0) {
    await prisma.planEntry.createMany({
      data: missing,
      skipDuplicates: true, // concurrent calls for a brand-new week can race; skip rows created by the other call
    });
  }

  return prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: [{ date: 'asc' }, { category: 'asc' }],
  });
}
```

Replace `generateAndSaveWeeklyPlan`:

```ts
/** Regenerates suggestions for every day in the week that is not already `cooked` (immutable history), for both categories independently. */
export async function generateAndSaveWeeklyPlan(householdId: string, weekDateKeys: string[]) {
  const meals = await prisma.meal.findMany({
    where: { householdId },
    include: { tags: { include: { tag: true } } },
  });

  const cookedEntries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked', mealId: { not: null } },
    include: { meal: true },
  });

  await getOrCreateWeekPlan(householdId, weekDateKeys); // ensure rows exist first

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const updates = MEAL_CATEGORIES.flatMap((category) => {
    const categoryMeals: PlanMeal[] = meals
      .filter((m) => m.category === category)
      .map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }));
    const categoryCookedHistory: CookedHistoryEntry[] = cookedEntries
      .filter((e) => e.meal?.category === category)
      .map((e) => ({ mealId: e.mealId!, dateKey: toDateKey(e.date) }));

    const { assignments } = generateWeeklyPlan({
      meals: categoryMeals,
      cookedHistory: categoryCookedHistory,
      weekDateKeys,
    });

    return assignments
      .filter((a) => editableKeys.has(`${a.dateKey}:${category}`))
      .map((a) => ({ dateKey: a.dateKey, category, mealId: a.mealId }));
  });

  await Promise.all(
    updates.map((u) =>
      prisma.planEntry.updateMany({
        where: { householdId, date: new Date(u.dateKey), category: u.category, status: { not: 'cooked' } },
        data: { mealId: u.mealId, status: 'planned' },
      }),
    ),
  );
}
```

Replace `setPlanEntryMeal`:

```ts
/** Per-day, per-category manual override, scoped to the caller's household. Pass `mealId: null` to clear a slot (only valid for optional categories like soup). */
export async function setPlanEntryMeal(
  householdId: string,
  dateKey: string,
  category: 'main' | 'soup',
  mealId: string | null,
) {
  if (mealId !== null) {
    const meal = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
    if (!meal) return null;
  }

  const existing = await prisma.planEntry.findUnique({
    where: { householdId_date_category: { householdId, date: new Date(dateKey), category } },
  });
  if (existing?.status === 'cooked') return null; // never silently un-cook immutable history

  return prisma.planEntry.upsert({
    where: { householdId_date_category: { householdId, date: new Date(dateKey), category } },
    update: { mealId, status: 'planned' },
    create: { householdId, date: new Date(dateKey), category, mealId, status: 'planned' },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts tests/integration/plan.test.ts
git commit -m "feat: generate and override main/soup plan entries independently per category"
```

---

### Task 6: `listCookedHistory` carries `category`; `transitionPastPlannedEntries` unaffected

**Files:**
- Modify: `tests/integration/plan-history.test.ts` (verification only — `listCookedHistory` in `src/lib/plan.ts` needs no code change since it already does `findMany` + `include` without projecting away columns)

**Context:** `listCookedHistory` (src/lib/plan.ts:201-219) returns full `PlanEntry` rows via Prisma's default `findMany`, so `category` is already included in the result with zero code changes — Prisma returns all scalar columns by default. This task is pure verification via a test, per the design spec's note that "no new grouping logic [is] needed since `listCookedHistory` already returns `PlanEntry` rows and now each row already carries its own `category`."

- [ ] **Step 1: Write the verification test**

In `tests/integration/plan-history.test.ts`, add a test inside `describe('listCookedHistory', ...)`:

```ts
  it('returns main and soup entries for the same day as independent rows with their own category', async () => {
    const { household, owner } = await makeHousehold('D');
    const mainMeal = await createMeal(household.id, owner.id, { name: 'Main Dish', note: '', tagIds: [], category: 'main' });
    const soupMeal = await createMeal(household.id, owner.id, { name: 'Soup Dish', note: '', tagIds: [], category: 'soup' });
    const thisWeek = getWeekDateKeys(new Date());

    await prisma.planEntry.createMany({
      data: [
        { householdId: household.id, date: new Date(thisWeek[0]), category: 'main', mealId: mainMeal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(thisWeek[0]), category: 'soup', mealId: soupMeal.id, status: 'cooked' },
      ],
    });

    const weeks = await listCookedHistory(household.id);

    expect(weeks[0].entries).toHaveLength(2);
    const categories = weeks[0].entries.map((e) => e.category).sort();
    expect(categories).toEqual(['main', 'soup']);
  });
```

Also update the two existing `prisma.planEntry.createMany`/`create` calls in this file's other tests to add `category: 'main'` to every data object, and every `createMeal` call to add `category: 'main'` — required now that these are non-optional columns/fields.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:integration
```

Expected: compile error (category field missing on existing calls) until you've applied the "also update" instruction above; once applied, the new test should already pass since no production code changed — confirming the design spec's claim that no new logic is needed.

- [ ] **Step 3: Run again to confirm pass**

```bash
npm run test:integration
```

Expected: all PASS (no production code was changed in this task).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/plan-history.test.ts
git commit -m "test: verify listCookedHistory returns independent main/soup rows with category"
```

---

## Phase 2 — Server Actions & pages wiring

### Task 7: `/plan` page and actions use the future-only window and category-grouped days

**Files:**
- Modify: `src/app/plan/page.tsx`
- Modify: `src/app/plan/actions.ts`

**Context:** `page.tsx` currently maps 7 `PlanEntry` rows (one per day) into `days`. It now needs to: (1) use `getFutureWeekDateKeys` instead of `getWeekDateKeys` for the days actually rendered, (2) group each day's two `PlanEntry` rows (main + soup) into a `{ main, soup }` shape per day, (3) also fetch soup-category meals for the soup `<Select>`'s options. `actions.ts`'s `overrideDayAction` needs a `category` parameter; `generateWeekAction` needs to use the future-only window.

- [ ] **Step 1: Update `src/app/plan/actions.ts`**

```tsx
'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getFutureWeekDateKeys } from '@/lib/plan';

export async function generateWeekAction() {
  const session = await requireHousehold();
  const week = getFutureWeekDateKeys(new Date());
  await generateAndSaveWeeklyPlan(session.user.householdId!, week);
  revalidatePath('/plan');
}

export async function overrideDayAction(dateKey: string, category: 'main' | 'soup', mealId: string | null) {
  const session = await requireHousehold();
  const result = await setPlanEntryMeal(session.user.householdId!, dateKey, category, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/plan');
}
```

- [ ] **Step 2: Update `src/app/plan/page.tsx`**

```tsx
import { requireHousehold } from '@/lib/session';
import { listMeals } from '@/lib/meal';
import { getWeekDateKeys, getFutureWeekDateKeys, getOrCreateWeekPlan, transitionPastPlannedEntries, toDateKey } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { PlanView } from './plan-view';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function PlanPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);

  const fullWeek = getWeekDateKeys(new Date());
  const futureWeek = getFutureWeekDateKeys(new Date());
  const [entries, meals] = await Promise.all([
    getOrCreateWeekPlan(householdId, futureWeek),
    listMeals(householdId),
  ]);

  const entryByKey = new Map(entries.map((e) => [`${toDateKey(e.date)}:${e.category}`, e]));
  const mainMeals = meals.filter((m) => m.category === 'main');
  const soupMeals = meals.filter((m) => m.category === 'soup');

  const days = futureWeek.map((dateKey) => {
    const dayIndex = fullWeek.indexOf(dateKey);
    const mainEntry = entryByKey.get(`${dateKey}:main`);
    const soupEntry = entryByKey.get(`${dateKey}:soup`);
    return {
      dateKey,
      dayName: t(DAY_NAME_KEYS[dayIndex]),
      main: {
        mealId: mainEntry?.mealId ?? null,
        mealName: mainEntry?.meal?.name ?? null,
        tags: mainEntry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
        status: (mainEntry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
      },
      soup: {
        mealId: soupEntry?.mealId ?? null,
        mealName: soupEntry?.meal?.name ?? null,
        tags: soupEntry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
        status: (soupEntry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
      },
    };
  });

  return (
    <PlanView
      days={days}
      mainMeals={mainMeals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      soupMeals={soupMeals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      hasMeals={mainMeals.length > 0}
      notEnoughMeals={mainMeals.length > 0 && mainMeals.length < 7}
      mealCount={mainMeals.length}
    />
  );
}
```

Note `notEnoughMeals`/`mealCount`/`hasMeals` are now scoped to `mainMeals` only, matching the design spec's point that soup having zero candidates is a normal state with no warning (`notEnoughMeals: false` semantics come for free from `generateWeeklyPlan`'s existing empty-array handling; the *warning banner* in the UI should likewise stay main-only).

- [ ] **Step 3: Manually verify via dev server**

```bash
npm run dev
```

Visit `http://localhost:3000/plan` (after signing in via dev login) — this will error until `plan-view.tsx` is updated in Task 8, so this step is just to confirm no server-side crash beyond the expected `PlanView` prop-shape mismatch (which Task 8 fixes). Skip full manual verification until Task 8 is done; proceed to commit this task's file changes together with Task 8 since they're interdependent (page.tsx's new prop shape has no consumer until plan-view.tsx is updated).

- [ ] **Step 4: Do not commit yet** — this task's changes are committed together with Task 8 (next task), since `plan-view.tsx` must be updated in the same commit for the app to type-check and run. Proceed directly to Task 8.

---

### Task 8: `plan-view.tsx` renders two rows per day (Main mandatory, Soup with "None")

**Files:**
- Modify: `src/app/plan/plan-view.tsx`
- Modify: `messages/en.json`, `messages/hu.json`

**Context:** Per the design spec's UI Changes section: Main is a mandatory `Select` (no "none" option, mirrors today's behavior); Soup is a `Select` with an added "None" option that clears the slot (`mealId: null`). Both show independent status badges when cooked/skipped.

- [ ] **Step 1: Add i18n keys**

In `messages/en.json`, inside the `"Plan"` object, add (alongside existing keys like `noMealAssigned`):

```json
    "mainLabel": "Main",
    "soupLabel": "Soup",
    "noneOption": "None",
```

In `messages/hu.json`, inside the `"Plan"` object, add the Hungarian equivalents:

```json
    "mainLabel": "Főétel",
    "soupLabel": "Leves",
    "noneOption": "Nincs",
```

- [ ] **Step 2: Rewrite `plan-view.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generateWeekAction, overrideDayAction } from './actions';

type Meal = { id: string; name: string; tags: string[] };
type SlotEntry = { mealId: string | null; mealName: string | null; tags: string[]; status: 'planned' | 'cooked' | 'skipped' };
type DayEntry = { dateKey: string; dayName: string; main: SlotEntry; soup: SlotEntry };

const NONE_VALUE = '__none__';

export function PlanView({
  days,
  mainMeals,
  soupMeals,
  hasMeals,
  notEnoughMeals,
  mealCount,
}: {
  days: DayEntry[];
  mainMeals: Meal[];
  soupMeals: Meal[];
  hasMeals: boolean;
  notEnoughMeals: boolean;
  mealCount: number;
}) {
  const t = useTranslations('Plan');
  const router = useRouter();
  const [isGenerating, startGenerating] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function handleOverride(dateKey: string, category: 'main' | 'soup', mealId: string | null) {
    const key = `${dateKey}:${category}`;
    setErrorKey(null);
    try {
      await overrideDayAction(dateKey, category, mealId);
      router.refresh();
    } catch {
      setErrorKey(key);
      router.refresh();
    }
  }

  function renderSlot(dateKey: string, category: 'main' | 'soup', slot: SlotEntry, options: Meal[]) {
    const key = `${dateKey}:${category}`;
    const label = category === 'main' ? t('mainLabel') : t('soupLabel');
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
          {slot.status !== 'planned' && (
            <Badge variant={slot.status === 'cooked' ? 'default' : 'secondary'}>
              {slot.status === 'cooked' ? t('statusCooked') : t('statusSkipped')}
            </Badge>
          )}
        </div>
        {slot.status === 'planned' ? (
          <Select
            value={slot.mealId ?? (category === 'soup' ? NONE_VALUE : undefined)}
            onValueChange={(value) =>
              handleOverride(dateKey, category, value === NONE_VALUE ? null : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('noMealAssigned')} />
            </SelectTrigger>
            <SelectContent>
              {category === 'soup' && <SelectItem value={NONE_VALUE}>{t('noneOption')}</SelectItem>}
              {options.map((meal) => (
                <SelectItem key={meal.id} value={meal.id}>
                  {meal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="font-medium">{slot.mealName ?? t('noMealAssigned')}</p>
        )}
        {errorKey === key && <p className="text-sm text-destructive">{t('overrideError')}</p>}
        <div className="flex gap-1">
          {slot.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button
          disabled={!hasMeals || isGenerating}
          onClick={() => startGenerating(async () => { await generateWeekAction(); router.refresh(); })}
        >
          {isGenerating ? t('generatingWeek') : t('generateWeek')}
        </Button>
      </div>

      {!hasMeals && <p className="text-sm text-muted-foreground">{t('noMealsYet')}</p>}
      {hasMeals && notEnoughMeals && (
        <p className="rounded bg-amber-100 p-2 text-sm text-amber-900">
          {t('notEnoughMealsWarning', { count: mealCount })}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <Card key={day.dateKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{day.dayName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {renderSlot(day.dateKey, 'main', day.main, mainMeals)}
              {renderSlot(day.dateKey, 'soup', day.soup, soupMeals)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification with the dev server**

```bash
npm run dev
```

Sign in via dev login at `http://localhost:3000/signin`, create a household, add one `main` meal and one `soup` meal at `/meals` (Task 9 must be done first for the category selector to exist in the form — if Task 9 isn't done yet, skip this manual check and rely on the E2E test in Task 15 instead). Visit `/plan`, confirm two rows per day, generate week, confirm main gets filled and soup shows "None" or a soup meal.

- [ ] **Step 5: Commit (together with Task 7's page.tsx/actions.ts changes)**

```bash
git add src/app/plan/page.tsx src/app/plan/actions.ts src/app/plan/plan-view.tsx messages/en.json messages/hu.json
git commit -m "feat: render independent main/soup rows on /plan, restrict to future-only window"
```

---

### Task 9: Meal form gets a required category select; meal list shows category badge + filter

**Files:**
- Modify: `src/app/meals/actions.ts`
- Modify: `src/app/meals/meal-form.tsx`
- Modify: `src/app/meals/meal-list.tsx`
- Modify: `src/app/meals/page.tsx`
- Modify: `messages/en.json`, `messages/hu.json`

- [ ] **Step 1: Add i18n keys**

In `messages/en.json`, inside `"Meals"`, add:

```json
    "categoryLabel": "Category",
    "categorySoup": "Soup",
    "categoryMain": "Main",
    "allCategories": "All categories",
```

In `messages/hu.json`, inside `"Meals"`, add:

```json
    "categoryLabel": "Kategória",
    "categorySoup": "Leves",
    "categoryMain": "Főétel",
    "allCategories": "Minden kategória",
```

- [ ] **Step 2: Update `src/app/meals/actions.ts`**

```tsx
'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { mealInputSchema, createMeal, updateMeal, deleteMeal, createTag } from '@/lib/meal';

function parseMealForm(formData: FormData) {
  return mealInputSchema.parse({
    name: formData.get('name'),
    note: formData.get('note') ?? '',
    tagIds: formData.getAll('tagIds').map(String),
    category: formData.get('category'),
  });
}

export async function createMealAction(formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  await createMeal(session.user.householdId!, session.user.id, input);
  revalidatePath('/meals');
}

export async function updateMealAction(mealId: string, formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  const result = await updateMeal(session.user.householdId!, mealId, input);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function deleteMealAction(mealId: string) {
  const session = await requireHousehold();
  const result = await deleteMeal(session.user.householdId!, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function createTagAction(name: string) {
  const session = await requireHousehold();
  const tag = await createTag(session.user.householdId!, name);
  revalidatePath('/meals');
  return tag;
}
```

- [ ] **Step 3: Update `src/app/meals/meal-form.tsx`**

Add the category `Select` between the note field and the tags field. Update the type and imports:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createMealAction, updateMealAction, createTagAction } from './actions';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; tags: Tag[] };

export function MealForm({
  meal,
  allTags,
  onClose,
}: {
  meal?: Meal;
  allTags: Tag[];
  onClose: () => void;
}) {
  const t = useTranslations('Meals');
  const [tags, setTags] = useState<Tag[]>(allTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(meal?.tags.map((tg) => tg.id) ?? []);
  const [newTagName, setNewTagName] = useState('');
  const [category, setCategory] = useState<'soup' | 'main'>(meal?.category ?? 'main');

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await createTagAction(newTagName.trim());
    if (tag) {
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
    }
    setNewTagName('');
  }

  async function handleSubmit(formData: FormData) {
    selectedTagIds.forEach((id) => formData.append('tagIds', id));
    formData.set('category', category);
    if (meal) {
      await updateMealAction(meal.id, formData);
    } else {
      await createMealAction(formData);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meal ? t('editMeal') : t('addMeal')}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">{t('nameLabel')}</Label>
            <Input id="name" name="name" defaultValue={meal?.name} required maxLength={100} />
          </div>

          <div>
            <Label htmlFor="note">{t('noteLabel')}</Label>
            <Input id="note" name="note" defaultValue={meal?.note ?? ''} maxLength={500} />
          </div>

          <div>
            <Label htmlFor="category">{t('categoryLabel')}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as 'soup' | 'main')}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">{t('categoryMain')}</SelectItem>
                <SelectItem value="soup">{t('categorySoup')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('tagsLabel')}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder={t('newTagPlaceholder')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={handleAddTag}>
                {t('addTag')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Update `src/app/meals/meal-list.tsx`**

Add a category badge next to tags, and a second `Select` for the category filter, mirroring the existing tag filter's `?tag=` pattern with a new `?category=` param:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deleteMealAction } from './actions';
import { MealForm } from './meal-form';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; tags: Tag[] };

export function MealList({
  meals,
  allTags,
  activeTag,
  activeCategory,
}: {
  meals: Meal[];
  allTags: Tag[];
  activeTag?: string;
  activeCategory?: string;
}) {
  const t = useTranslations('Meals');
  const router = useRouter();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  function buildUrl(nextTag?: string, nextCategory?: string) {
    const params = new URLSearchParams();
    if (nextTag) params.set('tag', nextTag);
    if (nextCategory) params.set('category', nextCategory);
    const query = params.toString();
    return query ? `/meals?${query}` : '/meals';
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Select
            value={activeTag ?? 'all'}
            onValueChange={(value) => router.push(buildUrl(value === 'all' ? undefined : value, activeCategory))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTags')}</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeCategory ?? 'all'}
            onValueChange={(value) => router.push(buildUrl(activeTag, value === 'all' ? undefined : value))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allCategories')}</SelectItem>
              <SelectItem value="main">{t('categoryMain')}</SelectItem>
              <SelectItem value="soup">{t('categorySoup')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setIsAdding(true)}>{t('addMeal')}</Button>
      </div>

      {meals.length === 0 && <p className="text-sm text-muted-foreground">{t('noMeals')}</p>}

      <ul className="flex flex-col gap-2">
        {meals.map((meal) => (
          <li key={meal.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{meal.name}</p>
              {meal.note && <p className="text-sm text-muted-foreground">{meal.note}</p>}
              <div className="mt-1 flex gap-1">
                <Badge variant="default">{meal.category === 'soup' ? t('categorySoup') : t('categoryMain')}</Badge>
                {meal.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMeal(meal)}>
                {t('editMeal')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await deleteMealAction(meal.id);
                  router.refresh();
                }}
              >
                {t('delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {isAdding && (
        <MealForm
          allTags={allTags}
          onClose={() => {
            setIsAdding(false);
            router.refresh();
          }}
        />
      )}

      {editingMeal && (
        <MealForm
          meal={editingMeal}
          allTags={allTags}
          onClose={() => {
            setEditingMeal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update `src/app/meals/page.tsx`**

```tsx
import { requireHousehold } from '@/lib/session';
import { listMeals, listTags } from '@/lib/meal';
import { getTranslations } from 'next-intl/server';
import { MealList } from './meal-list';

export default async function MealsPage({
  searchParams,
}: {
  searchParams: { tag?: string; category?: string };
}) {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Meals');

  const category = searchParams.category === 'soup' || searchParams.category === 'main' ? searchParams.category : undefined;

  const [meals, tags] = await Promise.all([
    listMeals(householdId, searchParams.tag, category),
    listTags(householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <MealList
        meals={meals.map((m) => ({
          id: m.id,
          name: m.name,
          note: m.note,
          category: m.category,
          tags: m.tags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name })),
        }))}
        allTags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeTag={searchParams.tag}
        activeCategory={category}
      />
    </div>
  );
}
```

- [ ] **Step 6: Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual verification**

```bash
npm run dev
```

Visit `/meals`, add a soup meal and a main meal, confirm the category badge shows, confirm the category filter dropdown filters correctly, confirm editing a meal pre-selects its current category.

- [ ] **Step 8: Commit**

```bash
git add src/app/meals messages/en.json messages/hu.json
git commit -m "feat: add required category field to meal form, list badge, and filter"
```

---

## Phase 3 — Tests (unit already covered in Phase 1; integration extension + E2E)

### Task 10: E2E test extension — soup + main slots render after generating a week

**Files:**
- Modify: `tests/e2e/happy-path.spec.ts`

**Context:** Per the design spec's Testing Strategy: "extend the existing happy-path test to add one soup meal and one main meal, generate a week, and assert both slots render." Use the Playwright MCP tools to interactively verify selectors before finalizing the spec file, since the meal form has a new required category field the test must fill in.

- [ ] **Step 1: Use Playwright MCP to explore the updated `/meals` and `/plan` pages interactively**

Start the dev server (`npm run dev` in the background, or reuse if already running), then use `playwright_browser_navigate` to `http://localhost:3000/signin`, sign in via the dev-login form with a throwaway email (e.g. `e2e-explore@example.com`), create a household, go to `/meals`, click "Add meal", and use `playwright_browser_snapshot` to inspect the category `Select`'s accessible name/role so the E2E test's selector matches exactly (e.g. confirm it's reachable via `page.getByRole('dialog').getByLabel('Category')` — if the `Label`/`Select` pairing doesn't expose an accessible label this way because shadcn's `Select` trigger isn't a native `<select>`, note the actual accessible name/role the snapshot reveals and use that in the test instead).

- [ ] **Step 2: Add the category selection to `tests/e2e/happy-path.spec.ts`**

Replace the "add a meal" section (lines 37-42) with two meal additions (one main, one soup), using the exact selector pattern confirmed in Step 1. If the category `Select` is reachable as a combobox by accessible name "Category", the addition looks like:

```ts
  await page.getByRole('link', { name: 'Meals' }).click();
  await page.waitForURL('/meals');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Main Meal');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Main Meal')).toBeVisible();

  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Soup Meal');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Soup' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Soup Meal')).toBeVisible();
```

Adjust the combobox selector to match whatever Step 1's snapshot actually showed (e.g. it may need `page.getByLabel('Category')` directly if the shadcn `Select` associates via `id`/`htmlFor` correctly — verify against the snapshot, don't guess).

Update the "Weekly Plan" section (lines 44-47) to assert both slots render:

```ts
  await page.getByRole('link', { name: 'Weekly Plan' }).click();
  await page.waitForURL('/plan');
  await page.getByRole('button', { name: 'Generate week' }).click();
  await expect(page.getByText('E2E Main Meal').first()).toBeVisible();
  await expect(page.getByText('E2E Soup Meal').first()).toBeVisible();
```

The rest of the test (backdating, checking History) is unaffected by category — leave lines 49-71 as-is, but update the `todayEntry` lookup (line 54-56) to scope to the main category, since there are now two `planned` rows per day and the test's intent ("today's entry that has a meal") should still target one specific row deterministically:

```ts
  const todayEntry = await prisma.planEntry.findFirst({
    where: { householdId, status: 'planned', mealId: { not: null }, category: 'main' },
  });
```

- [ ] **Step 3: Run the E2E test**

```bash
npm run test:e2e -- tests/e2e/happy-path.spec.ts
```

Expected: PASS. If a selector doesn't match, re-run Step 1's exploration to find the correct one — do not guess repeatedly.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/happy-path.spec.ts
git commit -m "test: extend e2e happy path to cover soup and main meal slots"
```

---

### Task 11: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:unit
```

Expected: all PASS.

- [ ] **Step 2: Run all integration tests**

```bash
npm run test:integration
```

Expected: all PASS.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the full E2E suite**

```bash
npm run test:e2e
```

Expected: all PASS.

- [ ] **Step 6: Run a production build**

```bash
npm run build
```

Expected: builds successfully with no type errors.

---

## Phase 4 — Documentation

### Task 12: Update README.md and AGENTS.md with the new features

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `README.md`'s Features list**

Find the "Weekly plan" bullet in the `## Features` section and replace it with:

```markdown
- **Weekly plan**: generates a plan for today through the end of the current
  week, with independent Main and Soup slots per day. Main uses the
  recency-avoidance + tag-balancing algorithm; Soup uses recency-avoidance
  only (scoped to soup-category meals) and can be left empty ("None").
  Swap either slot from a dropdown; past days auto-transition to
  "cooked"/"skipped" independently per slot.
- **Meals & tags**: CRUD for meals, tag them, categorize each as Soup or
  Main, filter by tag or category.
```

Remove the old standalone "Meals & tags" bullet (it's now merged into the replacement above) — find the existing line `- **Meals & tags**: CRUD for meals, tag them, filter by tag.` and delete it since the replacement above supersedes it.

- [ ] **Step 2: Update `AGENTS.md`'s Data model section**

In the `## Data model (\`prisma/schema.prisma\`)` section, update the sentence describing `PlanEntry` and `Meal`:

Find:
```
`Household` 1—N `User`, `Meal`, `Tag`, `PlanEntry`. `Meal` N—N `Tag` via
`MealTag`. `PlanEntry` has `(householdId, date)` uniqueness and a
`planned | cooked | skipped` status. Auth.js tables (`Account`, `Session`,
`VerificationToken`) are standard Prisma-adapter tables.
```

Replace with:
```
`Household` 1—N `User`, `Meal`, `Tag`, `PlanEntry`. `Meal` N—N `Tag` via
`MealTag`. Every `Meal` has a `category` (`soup` | `main`, `MealCategory`
enum). `PlanEntry` has one row per `(householdId, date, category)` — main
and soup are tracked and overridden independently — and a
`planned | cooked | skipped` status. `/plan` and "Generate week" are
restricted to `[today, end of current week]`
(`getFutureWeekDateKeys` in `src/lib/plan.ts`); days before today are never
shown or regenerated. Auth.js tables (`Account`, `Session`,
`VerificationToken`) are standard Prisma-adapter tables.
```

- [ ] **Step 3: Update `AGENTS.md`'s Weekly plan algorithm bullet**

Find:
```
- **Weekly plan algorithm** (`src/lib/plan.ts`): pure function
  `generateWeeklyPlan()` is unit-tested without a DB; DB orchestration
  (`generateAndSaveWeeklyPlan`, `getOrCreateWeekPlan`, etc.) wraps it. Keep
  that split when changing the algorithm — it's what makes it testable.
```

Replace with:
```
- **Weekly plan algorithm** (`src/lib/plan.ts`): pure function
  `generateWeeklyPlan()` is unit-tested without a DB; DB orchestration
  (`generateAndSaveWeeklyPlan`, `getOrCreateWeekPlan`, etc.) wraps it. Keep
  that split when changing the algorithm — it's what makes it testable.
  `generateAndSaveWeeklyPlan` calls the pure function once per
  `MealCategory` (main gets tag balancing, soup doesn't) — adding a new
  category later is one more enum value + one more pass, not a schema
  change.
```

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: document meal categories and future-only plan window"
```

---

## Ceiling / Future Extension (unchanged from design spec — no action needed now)

Adding `dessert` later: one enum value in `prisma/schema.prisma`, one more `MEAL_CATEGORIES` array entry in `src/lib/plan.ts` (the `generateAndSaveWeeklyPlan` loop already iterates the array, so no new pass-writing code is needed — just the array entry and a UI row).
</content>
