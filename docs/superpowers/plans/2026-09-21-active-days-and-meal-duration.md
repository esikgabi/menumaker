# Active Days & Multi-Day Meal Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let households (1) mark specific weekdays as not needing a menu, with a one-off override for the current week, and (2) mark a meal as lasting multiple consecutive days, so weekly plan generation skips off days and spreads multi-day meals across consecutive active days.

**Architecture:** Additive Prisma migration: `Household.activeWeekdays` (`Int[]`, default all 7 days), `Meal.durationDays` (`Int`, default 1), and a new `PlanDayOverride` table (`householdId`, `date`, `active`) for one-off per-date exceptions. A new `resolveActiveDateKeys()` in `src/lib/plan.ts` merges the household's recurring pattern with any date-specific overrides for a given week; `generateAndSaveWeeklyPlan` and `getOrCreateWeekPlan` call it first and only create/generate `PlanEntry` rows for active days. `generateWeeklyPlan` (the pure, unit-tested function) gains multi-day consumption: when it picks a meal, it fills that meal into the next `durationDays - 1` slots in its (already-active-only) `weekDateKeys` input before picking the next meal. UI: Settings gets a 7-day toggle-chip row; `/plan` gets a per-day skip/restore button and collapsed rendering for off days; the meal form gets a "lasts N days" number input.

**Tech Stack:** Next.js 14 App Router, Prisma 6 + PostgreSQL, Zod, next-intl, Vitest, Playwright, shadcn/ui (`Badge`, `Input`, `Button`).

**Design doc:** `docs/superpowers/specs/2026-09-21-active-days-and-meal-duration-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `Household.activeWeekdays`, `Meal.durationDays`, new `PlanDayOverride` model |
| `prisma/migrations/<ts>_add_active_days_and_meal_duration/migration.sql` | New migration (generated) |
| `src/lib/household.ts` | `activeWeekdaysSchema` (Zod) + `updateActiveWeekdays()` |
| `src/lib/meal.ts` | `mealInputSchema` gains `durationDays`; `createMeal`/`updateMeal` pass it through |
| `src/lib/plan.ts` | `PlanMeal` gains `durationDays`; new `resolveActiveDateKeys()`, `setPlanDayOverride()`; `generateWeeklyPlan` gains multi-day consumption + revised `notEnoughMeals`; `getOrCreateWeekPlan`/`generateAndSaveWeeklyPlan` become active-day-aware |
| `src/app/settings/actions.ts` | `updateActiveWeekdaysAction` |
| `src/app/settings/page.tsx` | Pass `household.activeWeekdays` to `SettingsView` |
| `src/app/settings/settings-view.tsx` | New "Active days" card with 7 toggle chips |
| `src/app/plan/actions.ts` | `toggleDayOverrideAction` |
| `src/app/plan/page.tsx` | Resolve active days, pass `active` flag per day, omit rows for inactive days |
| `src/app/plan/plan-view.tsx` | Render collapsed "day off" card + skip/restore button |
| `src/app/meals/actions.ts` | `parseMealForm` reads `durationDays` |
| `src/app/meals/meal-form.tsx` | New "Lasts how many days" number input |
| `messages/en.json`, `messages/hu.json` | New i18n keys (see Task 8) |
| `tests/unit/household.test.ts` | Tests for `activeWeekdaysSchema` |
| `tests/unit/meal.test.ts` | Tests for `durationDays` in `mealInputSchema` |
| `tests/unit/plan-algorithm.test.ts` | Tests for multi-day consumption + revised `notEnoughMeals` |
| `tests/unit/plan-dates.test.ts` | Tests for the override-merge logic used by `resolveActiveDateKeys` |
| `tests/integration/household-settings.test.ts` | Tests for `updateActiveWeekdays` |
| `tests/integration/plan.test.ts` | Tests for active-day filtering + day overrides + duration in `getOrCreateWeekPlan`/`generateAndSaveWeeklyPlan` |
| `tests/e2e/happy-path.spec.ts` | Extend to toggle a day off and confirm it doesn't render a meal select |

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_add_active_days_and_meal_duration/migration.sql` (generated)

- [ ] **Step 1: Add the new fields/model to the schema**

In `prisma/schema.prisma`, modify `Household`:

```prisma
model Household {
  id             String      @id @default(cuid())
  name           String
  inviteCode     String      @unique
  activeWeekdays Int[]       @default([0, 1, 2, 3, 4, 5, 6])
  createdAt      DateTime    @default(now())
  users          User[]
  meals          Meal[]
  tags           Tag[]
  planEntries    PlanEntry[]
  dayOverrides   PlanDayOverride[]
}
```

Modify `Meal`:

```prisma
model Meal {
  id           String       @id @default(cuid())
  householdId  String
  household    Household    @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name         String
  note         String?
  category     MealCategory @default(main)
  durationDays Int          @default(1)
  createdById  String?
  createdBy    User?        @relation("MealCreatedBy", fields: [createdById], references: [id])
  tags         MealTag[]
  planEntries  PlanEntry[]
  createdAt    DateTime     @default(now())
}
```

Add a new model, placed after `PlanEntry`:

```prisma
model PlanDayOverride {
  id          String    @id @default(cuid())
  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  date        DateTime  @db.Date
  active      Boolean

  @@unique([householdId, date])
}
```

- [ ] **Step 2: Generate the migration**

Ensure the dev DB is running (`docker ps` should show a Postgres container per the README's `docker run` step), then:

```bash
npx prisma migrate dev --name add_active_days_and_meal_duration
```

This should generate cleanly with no prompts: all three changes are additive with defaults, so no existing row can violate anything.

- [ ] **Step 3: Verify the generated migration is correct**

Open the generated `prisma/migrations/<timestamp>_add_active_days_and_meal_duration/migration.sql` and confirm it contains (order may vary, but all three must be present):

```sql
-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "activeWeekdays" INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[];

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PlanDayOverride" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "PlanDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanDayOverride_householdId_date_key" ON "PlanDayOverride"("householdId", "date");

-- AddForeignKey
ALTER TABLE "PlanDayOverride" ADD CONSTRAINT "PlanDayOverride_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

If Prisma emitted `activeWeekdays` without a `NOT NULL`, that's fine — Prisma's `Int[]` columns are nullable-by-default at the SQL level but the Prisma Client always supplies the array (never `null`) because of the `@default`; this matches how existing scalar-array-free columns in this schema already behave, no fixup needed.

- [ ] **Step 4: Verify migration status and regenerate the client**

```bash
npx prisma migrate status
```

Expected: "Database schema is up to date!"

```bash
npx prisma generate
```

Expected: exits 0, "Generated Prisma Client".

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Household.activeWeekdays, Meal.durationDays, PlanDayOverride"
```

---

## Task 2: `activeWeekdaysSchema` + `updateActiveWeekdays` in `src/lib/household.ts`

**Files:**
- Modify: `src/lib/household.ts`
- Test: `tests/unit/household.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Add to `tests/unit/household.test.ts`, importing `activeWeekdaysSchema` alongside the existing imports:

```ts
import { describe, expect, it } from 'vitest';
import { generateInviteCode, householdNameSchema, activeWeekdaysSchema } from '@/lib/household';
```

Then add a new `describe` block at the end of the file:

```ts
describe('activeWeekdaysSchema', () => {
  it('accepts all seven weekdays', () => {
    expect(activeWeekdaysSchema.safeParse([0, 1, 2, 3, 4, 5, 6]).success).toBe(true);
  });

  it('accepts a single weekday', () => {
    expect(activeWeekdaysSchema.safeParse([3]).success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(activeWeekdaysSchema.safeParse([]).success).toBe(false);
  });

  it('rejects a value outside 0-6', () => {
    expect(activeWeekdaysSchema.safeParse([0, 7]).success).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(activeWeekdaysSchema.safeParse([-1, 0]).success).toBe(false);
  });

  it('rejects duplicate values', () => {
    expect(activeWeekdaysSchema.safeParse([0, 0, 1]).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit -- household.test.ts
```

Expected: FAIL — `activeWeekdaysSchema` is not exported from `@/lib/household`.

- [ ] **Step 3: Implement `activeWeekdaysSchema` and `updateActiveWeekdays`**

In `src/lib/household.ts`, add after the existing `householdNameSchema` line:

```ts
export const activeWeekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .refine((days) => new Set(days).size === days.length, 'Duplicate weekday');
```

Add a new function after `renameHousehold`:

```ts
export async function updateActiveWeekdays(householdId: string, weekdays: number[]) {
  const parsed = activeWeekdaysSchema.parse(weekdays);
  return prisma.household.update({ where: { id: householdId }, data: { activeWeekdays: parsed } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit -- household.test.ts
```

Expected: PASS, all 6 new tests plus the existing ones green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/household.ts tests/unit/household.test.ts
git commit -m "feat: add activeWeekdaysSchema and updateActiveWeekdays"
```

---

## Task 3: Integration test + verification for `updateActiveWeekdays`

**Files:**
- Test: `tests/integration/household-settings.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to the imports at the top of `tests/integration/household-settings.test.ts`:

```ts
import { createHouseholdWithOwner, renameHousehold, listHouseholdMembers, leaveHousehold, updateActiveWeekdays } from '@/lib/household';
```

Add a new `describe` block at the end of the file:

```ts
describe('updateActiveWeekdays', () => {
  it('defaults to all 7 weekdays for a new household', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner6@settings-test.example.com', name: 'Owner6' } });
    const household = await createHouseholdWithOwner('Settings Test Household G', owner.id);

    expect(household.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('persists a restricted set of weekdays', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner7@settings-test.example.com', name: 'Owner7' } });
    const household = await createHouseholdWithOwner('Settings Test Household H', owner.id);

    const updated = await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]);

    expect(updated.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects an empty array and leaves the existing value untouched', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner8@settings-test.example.com', name: 'Owner8' } });
    const household = await createHouseholdWithOwner('Settings Test Household I', owner.id);

    await expect(updateActiveWeekdays(household.id, [])).rejects.toThrow();

    const unchanged = await prisma.household.findUnique({ where: { id: household.id } });
    expect(unchanged?.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
docker compose -f docker-compose.test.yml up -d && sleep 2
npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/household-settings.test.ts
```

Expected: FAIL if Task 2 wasn't done yet, or PASS immediately if Task 2 already landed (in which case this step just confirms — proceed to commit). Since Task 2 already lands the implementation, this task is expected to PASS on first run; the point of this task is to add DB-level coverage, not TDD the implementation again.

- [ ] **Step 3: Run full integration suite to confirm nothing else broke**

```bash
npm run test:integration
```

Expected: all tests PASS (this also runs `docker compose down` at the end per the npm script).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/household-settings.test.ts
git commit -m "test: cover updateActiveWeekdays persistence and validation"
```

---

## Task 4: `durationDays` on `mealInputSchema` and meal CRUD

**Files:**
- Modify: `src/lib/meal.ts`
- Test: `tests/unit/meal.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Add to `tests/unit/meal.test.ts`, at the end of the `describe('mealInputSchema', ...)` block (before its closing `});`):

```ts
  it('defaults durationDays to 1 when omitted', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.durationDays).toBe(1);
  });

  it('accepts an explicit durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 3 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.durationDays).toBe(3);
  });

  it('rejects durationDays of 0', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 1.5 });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit -- meal.test.ts
```

Expected: FAIL — `durationDays` is not a recognized field / `result.data.durationDays` is `undefined`.

- [ ] **Step 3: Implement `durationDays` in `mealInputSchema` and pass it through CRUD**

In `src/lib/meal.ts`, modify `mealInputSchema`:

```ts
export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()),
  category: z.enum(['soup', 'main']),
  durationDays: z.coerce.number().int().min(1).default(1),
});
```

Modify `createMeal`'s `data` object to include the new field:

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
      durationDays: input.durationDays,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}
```

Modify `updateMeal`'s `data` object the same way:

```ts
    return tx.meal.update({
      where: { id: mealId },
      data: {
        name: input.name,
        note: input.note || null,
        category: input.category,
        durationDays: input.durationDays,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: { tags: { include: { tag: true } } },
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit -- meal.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meal.ts tests/unit/meal.test.ts
git commit -m "feat: add durationDays to meal input schema and CRUD"
```

---

## Task 5: Integration coverage for `durationDays` persistence

**Files:**
- Test: `tests/integration/meal.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to the end of the `describe('meal CRUD and household isolation', ...)` block in `tests/integration/meal.test.ts` (before its closing `});`):

```ts
  it('defaults durationDays to 1 when not provided', async () => {
    const household = await makeHousehold('S');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;

    const meal = await createMeal(household.id, owner.id, { name: 'Default Duration', note: '', tagIds: [], category: 'main' } as never);

    expect(meal.durationDays).toBe(1);
  });

  it('persists an explicit durationDays and allows updating it', async () => {
    const household = await makeHousehold('T');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const meal = await createMeal(household.id, owner.id, {
      name: 'Multi-day Stew',
      note: '',
      tagIds: [],
      category: 'main',
      durationDays: 3,
    });
    expect(meal.durationDays).toBe(3);

    const updated = await updateMeal(household.id, meal.id, {
      name: 'Multi-day Stew',
      note: '',
      tagIds: [],
      category: 'main',
      durationDays: 2,
    });

    expect(updated?.durationDays).toBe(2);
  });
```

Note: the first test passes an object without `durationDays` cast `as never` because `MealInput` (the TS type inferred from `mealInputSchema`) requires it at the type level even though the Zod schema defaults it at runtime — this test is specifically exercising the runtime default via `createMeal`, called the same way a partially-typed caller (e.g. Prisma seed data or an older client) might.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
docker compose -f docker-compose.test.yml up -d && sleep 2
npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/meal.test.ts
```

Expected: PASS immediately if Task 4 already landed (same rationale as Task 3 — implementation precedes this DB-level coverage task).

- [ ] **Step 3: Run full integration suite**

```bash
npm run test:integration
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/meal.test.ts
git commit -m "test: cover durationDays persistence on meal create/update"
```

---

## Task 6: `resolveActiveDateKeys` and `setPlanDayOverride` in `src/lib/plan.ts`

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/unit/plan-dates.test.ts` (pure merge logic)
- Test: `tests/integration/plan.test.ts` (DB-backed wrapper, since this reads `Household` + `PlanDayOverride`)

- [ ] **Step 1: Write the failing unit tests for the pure merge logic**

Add to the imports at the top of `tests/unit/plan-dates.test.ts`:

```ts
import { getWeekDateKeys, getFutureWeekDateKeys, localDateKey, toDateKey, mergeActiveDateKeys } from '@/lib/plan';
```

Add a new `describe` block at the end of the file:

```ts
describe('mergeActiveDateKeys', () => {
  const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']; // Mon..Sun

  it('returns every date key when the pattern includes every weekday and there are no overrides', () => {
    const result = mergeActiveDateKeys(week, [0, 1, 2, 3, 4, 5, 6], new Map());
    expect(result).toEqual(week);
  });

  it('excludes date keys whose weekday is not in the pattern', () => {
    const result = mergeActiveDateKeys(week, [0, 1, 2, 3, 4], new Map()); // Mon-Fri only
    expect(result).toEqual(week.slice(0, 5));
  });

  it('an override forcing a day off wins over the pattern saying that weekday is on', () => {
    const overrides = new Map([[week[2], false]]); // Wednesday forced off
    const result = mergeActiveDateKeys(week, [0, 1, 2, 3, 4, 5, 6], overrides);
    expect(result).not.toContain(week[2]);
    expect(result).toHaveLength(6);
  });

  it('an override forcing a day on wins over the pattern saying that weekday is off', () => {
    const overrides = new Map([[week[5], true]]); // Saturday forced on
    const result = mergeActiveDateKeys(week, [0, 1, 2, 3, 4], overrides); // Sat/Sun off by pattern
    expect(result).toContain(week[5]);
    expect(result).not.toContain(week[6]);
  });
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

```bash
npm run test:unit -- plan-dates.test.ts
```

Expected: FAIL — `mergeActiveDateKeys` is not exported from `@/lib/plan`.

- [ ] **Step 3: Write the failing integration tests for the DB-backed wrapper**

Add to the imports at the top of `tests/integration/plan.test.ts`:

```ts
import {
  getWeekDateKeys,
  getOrCreateWeekPlan,
  generateAndSaveWeeklyPlan,
  localDateKey,
  setPlanEntryMeal,
  transitionPastPlannedEntries,
  toDateKey,
  resolveActiveDateKeys,
  setPlanDayOverride,
} from '@/lib/plan';
import { updateActiveWeekdays } from '@/lib/household';
```

Add a new `describe` block at the end of the file:

```ts
describe('resolveActiveDateKeys', () => {
  it('returns every date key when the household has the default all-days pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT1', []);
    const week = getWeekDateKeys(new Date());

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toEqual(week);
  });

  it('excludes date keys whose weekday is not in the household pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT2', []);
    const week = getWeekDateKeys(new Date()); // Monday..Sunday
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Mon-Fri only

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toEqual(week.slice(0, 5));
  });

  it('a one-off override forcing a day off wins over the pattern saying on', async () => {
    const { household } = await makeHouseholdWithMeals('ACT3', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[2], false);

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).not.toContain(week[2]);
    expect(active).toHaveLength(6);
  });

  it('a one-off override forcing a day on wins over the pattern saying off', async () => {
    const { household } = await makeHouseholdWithMeals('ACT4', []);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Sat/Sun off by pattern
    await setPlanDayOverride(household.id, week[5], true); // force Saturday on

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toContain(week[5]);
    expect(active).not.toContain(week[6]);
  });

  it('clearing an override (active: null) reverts to the pattern default', async () => {
    const { household } = await makeHouseholdWithMeals('ACT5', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[0], false);
    await setPlanDayOverride(household.id, week[0], null);

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toContain(week[0]);
  });
});
```

- [ ] **Step 4: Run the integration tests to verify they fail**

```bash
docker compose -f docker-compose.test.yml up -d && sleep 2
npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/plan.test.ts -t "resolveActiveDateKeys"
```

Expected: FAIL — `resolveActiveDateKeys` and `setPlanDayOverride` are not exported from `@/lib/plan`.

- [ ] **Step 5: Implement `mergeActiveDateKeys`, `resolveActiveDateKeys`, and `setPlanDayOverride`**

In `src/lib/plan.ts`, add near the top (after `getFutureWeekDateKeys`, before `PlanMeal`):

```ts
/** 0=Mon..6=Sun, matching Household.activeWeekdays and getWeekDateKeys' ordering. */
function weekdayIndexOfDateKey(dateKey: string): number {
  const jsDay = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // convert to 0=Mon..6=Sun
}
```

Add after `listCookedHistory` (end of file), a pure merge helper plus the two DB-backed functions:

```ts
/** Pure merge: a date key is active if it has no override, or its override says so. */
export function mergeActiveDateKeys(
  weekDateKeys: string[],
  activeWeekdays: number[],
  overridesByDateKey: Map<string, boolean>,
): string[] {
  return weekDateKeys.filter((dateKey) => {
    const override = overridesByDateKey.get(dateKey);
    if (override !== undefined) return override;
    return activeWeekdays.includes(weekdayIndexOfDateKey(dateKey));
  });
}

/** Resolves which of `weekDateKeys` need a menu for this household: household pattern, overridden per-date. */
export async function resolveActiveDateKeys(householdId: string, weekDateKeys: string[]): Promise<string[]> {
  const [household, overrides] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { activeWeekdays: true } }),
    prisma.planDayOverride.findMany({
      where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    }),
  ]);

  const overridesByDateKey = new Map(overrides.map((o) => [toDateKey(o.date), o.active]));
  return mergeActiveDateKeys(weekDateKeys, household.activeWeekdays, overridesByDateKey);
}

/** Sets or clears (active: null) a one-off day override, scoped to the caller's household. */
export async function setPlanDayOverride(householdId: string, dateKey: string, active: boolean | null) {
  if (active === null) {
    await prisma.planDayOverride.deleteMany({ where: { householdId, date: new Date(dateKey) } });
    return;
  }

  await prisma.planDayOverride.upsert({
    where: { householdId_date: { householdId, date: new Date(dateKey) } },
    update: { active },
    create: { householdId, date: new Date(dateKey), active },
  });
}
```

- [ ] **Step 6: Run the unit and integration tests to verify they pass**

```bash
npm run test:unit -- plan-dates.test.ts
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/plan.test.ts -t "resolveActiveDateKeys"
```

Expected: PASS — the 4 new unit tests and the 5 new integration tests all green.

- [ ] **Step 7: Run full unit + integration suites, then commit**

```bash
npm run test:unit
npm run test:integration
```

Expected: all tests PASS.

```bash
git add src/lib/plan.ts tests/unit/plan-dates.test.ts tests/integration/plan.test.ts
git commit -m "feat: add resolveActiveDateKeys and setPlanDayOverride"
```

---

## Task 7: Multi-day meal duration in `generateWeeklyPlan`

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/unit/plan-algorithm.test.ts`

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/plan-algorithm.test.ts`, modify the `meal` helper to accept an optional duration and default it, so every existing call site (which passes 2 args) keeps working:

```ts
function meal(id: string, tags: string[] = [], durationDays = 1) {
  return { id, name: id, tags, durationDays };
}
```

Add a new `describe` block at the end of the file:

```ts
describe('generateWeeklyPlan with durationDays', () => {
  it('assigns a 2-day meal to two consecutive days before rotating', () => {
    const meals = [meal('stew', [], 2), meal('salad', [], 1)];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week.slice(0, 3) });

    expect(result.assignments[0].mealId).toBe('stew');
    expect(result.assignments[1].mealId).toBe('stew');
    expect(result.assignments[2].mealId).toBe('salad');
  });

  it('clamps a multi-day meal at the end of the week without throwing', () => {
    const meals = [meal('stew', [], 3)];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week.slice(0, 2) });

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((a) => a.mealId === 'stew')).toBe(true);
  });

  it('does not let duration span a gap when weekDateKeys is pre-filtered (skipped day removed)', () => {
    // week.slice(0,3) with the middle day removed, simulating a skipped day
    const nonContiguous = [week[0], week[2]];
    const meals = [meal('stew', [], 2), meal('salad', [], 1)];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: nonContiguous });

    // stew still consumes 2 consecutive *entries* in the input array (indices 0,1
    // of the array, i.e. week[0] and week[2]) — duration counts active-day slots,
    // not calendar adjacency, which is exactly the "skip days don't consume
    // duration" behavior since the caller already removed the skipped day.
    expect(result.assignments[0].mealId).toBe('stew');
    expect(result.assignments[1].mealId).toBe('stew');
  });

  it('counts distinct picks (not days) for notEnoughMeals when duration covers multiple days', () => {
    const meals = [meal('stew', [], 7)]; // one meal covers the whole week
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });

    expect(result.notEnoughMeals).toBe(false); // 1 meal needed, 1 meal available
    expect(result.assignments.every((a) => a.mealId === 'stew')).toBe(true);
  });

  it('still warns when duration is insufficient to cover the week with available meals', () => {
    const meals = [meal('a', [], 2), meal('b', [], 2)]; // 2 meals x 2 days = 4 days covered, week has 7
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });

    expect(result.notEnoughMeals).toBe(true);
  });

  it('defaults durationDays to 1 for backward compatibility (existing behavior unchanged)', () => {
    const meals = Array.from({ length: 7 }, (_, i) => meal(`m${i}`));
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const ids = result.assignments.map((a) => a.mealId);
    expect(new Set(ids).size).toBe(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:unit -- plan-algorithm.test.ts
```

Expected: FAIL — `durationDays` is ignored, so the 2-day-meal tests get one day of `stew` then rotate to `salad` a day early (or `notEnoughMeals` differs from expectation).

- [ ] **Step 3: Implement multi-day consumption in `generateWeeklyPlan`**

In `src/lib/plan.ts`, modify the `PlanMeal` type:

```ts
export type PlanMeal = { id: string; name: string; tags: string[]; durationDays?: number };
```

Replace the assignment loop and `notEnoughMeals` calculation inside `generateWeeklyPlan` — the block starting at `const notEnoughMeals = ...` through the `return` — with:

```ts
  // Walk the days in order; when a meal is newly picked, it fills its own
  // durationDays consecutive slots (clamped to the remaining days) before the
  // next ranked, not-yet-used meal is picked. weekDateKeys is expected to
  // already be "active days only" — the caller (generateAndSaveWeeklyPlan)
  // filters out skipped days before calling this function, so duration never
  // spans a day that isn't actually in this array.
  const assignedMealIds: (string | null)[] = new Array(weekDateKeys.length).fill(null);
  let picksNeeded = 0;
  let i = 0;
  while (i < weekDateKeys.length) {
    const unused = ranked.find((m) => !assignedMealIds.includes(m.id));
    const chosen = unused ?? ranked[picksNeeded % ranked.length];
    picksNeeded += 1;
    const span = Math.max(1, chosen.durationDays ?? 1);
    for (let j = i; j < Math.min(i + span, weekDateKeys.length); j++) {
      assignedMealIds[j] = chosen.id;
    }
    i += span;
  }

  const notEnoughMeals = picksNeeded > meals.length;

  return {
    assignments: weekDateKeys.map((dateKey, idx) => ({ dateKey, mealId: assignedMealIds[idx] })),
    notEnoughMeals,
  };
```

Note this replaces the old `unused ? unused.id : ranked[i % ranked.length].id` cycling fallback with an equivalent `ranked[picksNeeded % ranked.length]` — `picksNeeded` plays the same role `i` did before (a monotonically increasing counter used to cycle through `ranked` once all distinct meals are exhausted), just incremented per *pick* instead of per *day*, since one pick can now cover multiple days.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit -- plan-algorithm.test.ts
```

Expected: PASS — all new tests green, and all pre-existing tests in this file still green (they all use the default `durationDays = 1` via the updated `meal()` helper).

- [ ] **Step 5: Run the full unit suite to check for regressions elsewhere**

```bash
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan.ts tests/unit/plan-algorithm.test.ts
git commit -m "feat: support multi-day meal duration in generateWeeklyPlan"
```

---

## Task 8: Wire active-day filtering into `getOrCreateWeekPlan` and `generateAndSaveWeeklyPlan`

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/integration/plan.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add to the end of `describe('getOrCreateWeekPlan', ...)` in `tests/integration/plan.test.ts`:

```ts
  it('creates no rows for a day excluded by the household active-weekdays pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT6', []);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Mon-Fri only

    const entries = await getOrCreateWeekPlan(household.id, week);

    const entryDateKeys = new Set(entries.map((e) => toDateKey(e.date)));
    expect(entryDateKeys.has(week[5])).toBe(false); // Saturday
    expect(entryDateKeys.has(week[6])).toBe(false); // Sunday
    expect(entries).toHaveLength(10); // 5 active days x 2 categories
  });

  it('creates no rows for a day excluded by a one-off override', async () => {
    const { household } = await makeHouseholdWithMeals('ACT7', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[2], false);

    const entries = await getOrCreateWeekPlan(household.id, week);

    const entryDateKeys = new Set(entries.map((e) => toDateKey(e.date)));
    expect(entryDateKeys.has(week[2])).toBe(false);
    expect(entries).toHaveLength(12); // 6 active days x 2 categories
  });
```

Add to the end of `describe('generateAndSaveWeeklyPlan', ...)` in the same file:

```ts
  it('does not assign a meal to a day excluded by the active-weekdays pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT8', ['Meal 1', 'Meal 2']);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]);

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.some((e) => toDateKey(e.date) === week[5])).toBe(false);
  });

  it('assigns a multi-day meal to consecutive active PlanEntry rows', async () => {
    const { household, owner } = await makeHouseholdWithMeals('ACT9', []);
    const stew = await createMeal(household.id, owner.id, { name: 'Stew', note: '', tagIds: [], category: 'main', durationDays: 2 });
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const mainEntries = (await getOrCreateWeekPlan(household.id, week))
      .filter((e) => e.category === 'main')
      .sort((a, b) => toDateKey(a.date).localeCompare(toDateKey(b.date)));
    expect(mainEntries[0].mealId).toBe(stew.id);
    expect(mainEntries[1].mealId).toBe(stew.id);
  });
```

Update the import at the top of the file to include `createMeal`'s new field usage (no import change needed — `createMeal` is already imported) and add `setPlanDayOverride`, `updateActiveWeekdays` if not already added in Task 6/imports (they were added in Task 6 — confirm they're present).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/plan.test.ts -t "excluded by"
```

Expected: FAIL — `getOrCreateWeekPlan` still creates rows for every day in `weekDateKeys` regardless of the household pattern/overrides.

- [ ] **Step 3: Wire `resolveActiveDateKeys` into `getOrCreateWeekPlan` and `generateAndSaveWeeklyPlan`**

In `src/lib/plan.ts`, modify `getOrCreateWeekPlan`:

```ts
/** Ensures a main and soup PlanEntry row exists for every ACTIVE date key in the week, then returns them with meal+tags included. Inactive days (per household pattern or a one-off override) get no rows. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const activeDateKeys = await resolveActiveDateKeys(householdId, weekDateKeys);

  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const missing = activeDateKeys.flatMap((dateKey) =>
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
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) } },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: [{ date: 'asc' }, { category: 'asc' }],
  });
}
```

Modify `generateAndSaveWeeklyPlan` — insert the active-day resolution right after the `meals`/`cookedEntries` fetch and use `activeDateKeys` everywhere `weekDateKeys` was previously used for entry lookups and the `generateWeeklyPlan` calls (the `getOrCreateWeekPlan(householdId, weekDateKeys)` call already re-resolves internally, so it can keep passing `weekDateKeys` unchanged — but the subsequent `editableEntries` query and both `generateWeeklyPlan` invocations must use `activeDateKeys`):

```ts
export async function generateAndSaveWeeklyPlan(householdId: string, weekDateKeys: string[]) {
  const activeDateKeys = await resolveActiveDateKeys(householdId, weekDateKeys);

  const meals = await prisma.meal.findMany({
    where: { householdId },
    include: { tags: { include: { tag: true } } },
  });

  const cookedEntries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked', mealId: { not: null } },
    include: { meal: true },
  });

  await getOrCreateWeekPlan(householdId, weekDateKeys); // ensure rows exist first (active days only)

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const updates = MEAL_CATEGORIES.flatMap((category) => {
    const categoryMeals: PlanMeal[] = meals
      .filter((m) => m.category === category)
      .map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name), durationDays: m.durationDays }));
    const categoryCookedHistory: CookedHistoryEntry[] = cookedEntries
      .filter((e) => e.meal?.category === category)
      .map((e) => ({ mealId: e.mealId!, dateKey: toDateKey(e.date) }));

    const { assignments } = generateWeeklyPlan({
      meals: categoryMeals,
      cookedHistory: categoryCookedHistory,
      weekDateKeys: activeDateKeys,
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

- [ ] **Step 4: Run the tests to verify they pass**

```bash
DATABASE_URL="postgresql://test:test@localhost:5433/menumaker_test?schema=public" npx vitest run --config vitest.integration.config.ts tests/integration/plan.test.ts
```

Expected: PASS, all tests in the file green (including all pre-existing ones — default `activeWeekdays` is all 7 days, so unfiltered behavior is unchanged).

- [ ] **Step 5: Run the full integration suite**

```bash
npm run test:integration
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan.ts tests/integration/plan.test.ts
git commit -m "feat: skip inactive days in getOrCreateWeekPlan and generateAndSaveWeeklyPlan"
```

---

## Task 9: i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/hu.json`

- [ ] **Step 1: Add new keys to `messages/en.json`**

In the `Settings` object, add after `"tagsTitle": "Tags",`:

```json
  "activeDaysTitle": "Active days",
  "activeDaysHint": "Choose which days you usually need a menu. You can still turn a specific day on or off for just this week from the Weekly Plan page.",
```

In the `Plan` object, add after `"statusSkipped": "Skipped",`:

```json
  "dayOff": "No menu (day off)",
  "skipDay": "Skip this day",
  "restoreDay": "Add menu back",
```

In the `Meals` object, add after `"categoryMain": "Main",`:

```json
  "durationLabel": "Lasts how many days",
```

- [ ] **Step 2: Add the matching keys to `messages/hu.json`**

In the `Settings` object, add after `"tagsTitle": "Címkék",`:

```json
  "activeDaysTitle": "Aktív napok",
  "activeDaysHint": "Válaszd ki, mely napokon van általában szükség menüre. Egy adott napot a Heti menü oldalon is be- vagy kikapcsolhatsz, csak az adott hétre.",
```

In the `Plan` object, add after `"statusSkipped": "Kihagyva",`:

```json
  "dayOff": "Nincs menü (szabadnap)",
  "skipDay": "Nap kihagyása",
  "restoreDay": "Menü visszaállítása",
```

In the `Meals` object, add after `"categoryMain": "Főétel",`:

```json
  "durationLabel": "Hány napig tart",
```

- [ ] **Step 3: Verify JSON validity**

```bash
python3 -c "import json; json.load(open('messages/en.json')); json.load(open('messages/hu.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/hu.json
git commit -m "feat: add i18n keys for active days and meal duration"
```

---

## Task 10: Settings UI — active weekdays card

**Files:**
- Modify: `src/lib/household.ts` (already exports what's needed from Task 2)
- Modify: `src/app/settings/actions.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/settings-view.tsx`

- [ ] **Step 1: Add the server action**

In `src/app/settings/actions.ts`, add the import and new action:

```ts
import { householdNameSchema, renameHousehold, leaveHousehold, updateActiveWeekdays } from '@/lib/household';
```

```ts
export async function updateActiveWeekdaysAction(weekdays: number[]) {
  const session = await requireHousehold();
  await updateActiveWeekdays(session.user.householdId!, weekdays);
  revalidatePath('/settings');
  revalidatePath('/plan');
}
```

- [ ] **Step 2: Pass `activeWeekdays` from the page to the view**

In `src/app/settings/page.tsx`, add `activeWeekdays={household.activeWeekdays}` to the `<SettingsView>` props:

```tsx
      <SettingsView
        householdName={household.name}
        inviteCode={household.inviteCode}
        currentUserId={session.user.id}
        members={members}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeWeekdays={household.activeWeekdays}
      />
```

- [ ] **Step 3: Add the "Active days" card to `settings-view.tsx`**

Add the import:

```ts
import { updateActiveWeekdaysAction, ... } from './actions';
```

(keep all existing imports from `./actions`, just add `updateActiveWeekdaysAction` to the destructured list)

Add `activeWeekdays` to the component's props type and destructuring:

```tsx
export function SettingsView({
  householdName,
  inviteCode,
  currentUserId,
  members,
  tags,
  activeWeekdays,
}: {
  householdName: string;
  inviteCode: string;
  currentUserId: string;
  members: Member[];
  tags: Tag[];
  activeWeekdays: number[];
}) {
```

Add state and a toggle handler near the top of the function body, alongside the existing `useState` calls:

```ts
  const [weekdays, setWeekdays] = useState(activeWeekdays);

  const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

  async function toggleWeekday(day: number) {
    const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort();
    if (next.length === 0) return; // must keep at least one active day
    setWeekdays(next);
    await updateActiveWeekdaysAction(next);
  }
```

Note: `useTranslations` is already imported and used as `t` for the `Settings` namespace, but the weekday labels live under `Plan` (`monday`..`sunday`). Add a second translator alongside the existing `const t = useTranslations('Settings');`:

```ts
  const tPlan = useTranslations('Plan');
```

Add the new card in the JSX, right after the closing `</Card>` of the Tags card and before the final `<div className="flex justify-between">`:

```tsx
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('activeDaysTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('activeDaysHint')}</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_KEYS.map((key, day) => (
              <Badge
                key={key}
                variant={weekdays.includes(day) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleWeekday(day)}
              >
                {tPlan(key)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Navigate to `/settings` (log in via dev mock auth per README), confirm the "Active days" card renders 7 chips all selected by default, clicking one deselects it and it persists across a page reload; confirm clicking the last remaining selected day does nothing (stays selected).

Stop the dev server (`Ctrl+C`) once verified.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/actions.ts src/app/settings/page.tsx src/app/settings/settings-view.tsx
git commit -m "feat: add active days toggle to Settings"
```

---

## Task 11: Plan page UI — per-day skip/restore

**Files:**
- Modify: `src/app/plan/actions.ts`
- Modify: `src/app/plan/page.tsx`
- Modify: `src/app/plan/plan-view.tsx`

- [ ] **Step 1: Add the server action**

In `src/app/plan/actions.ts`, add the import and new action:

```ts
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getFutureWeekDateKeys, setPlanDayOverride } from '@/lib/plan';
```

```ts
export async function toggleDayOverrideAction(dateKey: string, active: boolean | null) {
  const session = await requireHousehold();
  await setPlanDayOverride(session.user.householdId!, dateKey, active);
  revalidatePath('/plan');
}
```

- [ ] **Step 2: Resolve active days per day in `plan/page.tsx`**

Modify `src/app/plan/page.tsx`'s import line to add `resolveActiveDateKeys`:

```ts
import { getWeekDateKeys, getFutureWeekDateKeys, getOrCreateWeekPlan, transitionPastPlannedEntries, toDateKey, resolveActiveDateKeys } from '@/lib/plan';
```

After `const futureWeek = getFutureWeekDateKeys(new Date());`, add:

```ts
  const activeFutureWeek = await resolveActiveDateKeys(householdId, futureWeek);
  const activeSet = new Set(activeFutureWeek);
```

In the `days` map, add an `active` field to each returned day object:

```ts
  const days = futureWeek.map((dateKey) => {
    const dayIndex = fullWeek.indexOf(dateKey);
    const mainEntry = entryByKey.get(`${dateKey}:main`);
    const soupEntry = entryByKey.get(`${dateKey}:soup`);
    return {
      dateKey,
      dayName: t(DAY_NAME_KEYS[dayIndex]),
      active: activeSet.has(dateKey),
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
```

Note `getOrCreateWeekPlan(householdId, futureWeek)` already only creates/returns rows for active days (Task 8), so `entryByKey` naturally has no entry for an inactive day — `main`/`soup` on those days will already render as "no meal assigned" shape even before the UI collapses them.

- [ ] **Step 3: Update `plan-view.tsx` to render collapsed/skip-toggle days**

Modify the import line to add the new action:

```ts
import { generateWeekAction, overrideDayAction, toggleDayOverrideAction } from './actions';
```

Modify the `DayEntry` type to include `active`:

```ts
type DayEntry = { dateKey: string; dayName: string; active: boolean; main: SlotEntry; soup: SlotEntry };
```

Add a handler function inside the component, alongside `handleOverride`:

```ts
  async function handleToggleDay(dateKey: string, currentlyActive: boolean) {
    await toggleDayOverrideAction(dateKey, currentlyActive ? false : true);
    router.refresh();
  }
```

Modify the day-rendering loop to branch on `day.active`:

```tsx
      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <Card key={day.dateKey}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{day.dayName}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleToggleDay(day.dateKey, day.active)}>
                {day.active ? t('skipDay') : t('restoreDay')}
              </Button>
            </CardHeader>
            {day.active ? (
              <CardContent className="flex flex-col gap-3">
                {renderSlot(day.dateKey, 'main', day.main, mainMeals)}
                {renderSlot(day.dateKey, 'soup', day.soup, soupMeals)}
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-sm text-muted-foreground">{t('dayOff')}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Navigate to `/plan`, click "Skip this day" on one day, confirm it collapses to the "No menu (day off)" message with a "Add menu back" button; click it again and confirm the day's selects reappear; confirm "Generate week" doesn't touch the skipped day while it's off.

Stop the dev server once verified.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/plan/actions.ts src/app/plan/page.tsx src/app/plan/plan-view.tsx
git commit -m "feat: add per-day skip/restore toggle to Weekly Plan"
```

---

## Task 12: Meal form UI — duration field

**Files:**
- Modify: `src/app/meals/actions.ts`
- Modify: `src/app/meals/meal-form.tsx`

- [ ] **Step 1: Read `durationDays` from form data in the server action**

In `src/app/meals/actions.ts`, modify `parseMealForm`:

```ts
function parseMealForm(formData: FormData) {
  return mealInputSchema.parse({
    name: formData.get('name'),
    note: formData.get('note') ?? '',
    tagIds: formData.getAll('tagIds').map(String),
    category: formData.get('category'),
    durationDays: formData.get('durationDays'),
  });
}
```

(`z.coerce.number()` in the schema already handles the string-from-FormData → number coercion, and `.default(1)` handles a `null` `FormData.get` result being coerced — verify: `z.coerce.number()` on `null` throws, not defaults. Since the input always has a `defaultValue` and is `required`-less but has a numeric `min`, the browser will submit a string; guard for the not-yet-rendered-old-client edge case isn't needed since this is a same-deploy form. No further change needed here.)

- [ ] **Step 2: Add the input to `meal-form.tsx`**

Add a new state variable alongside `category`:

```ts
  const [durationDays, setDurationDays] = useState(meal?.durationDays ?? 1);
```

This requires widening the `Meal` type at the top of the file to include `durationDays`:

```ts
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; durationDays: number; tags: Tag[] };
```

In `handleSubmit`, add the value to `formData` alongside the existing `formData.set('category', category);` line:

```ts
    formData.set('category', category);
    formData.set('durationDays', String(durationDays));
```

Add the input in the JSX, right after the category `Select`'s closing `</div>` and before the tags `<div>`:

```tsx
          <div>
            <Label htmlFor="durationDays">{t('durationLabel')}</Label>
            <Input
              id="durationDays"
              name="durationDays"
              type="number"
              min={1}
              max={5}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
```

- [ ] **Step 3: Propagate the widened `Meal` type to callers**

`meal-list.tsx` also declares a local `Meal` type used for the `meals` prop and passed into `<MealForm meal={editingMeal} ...>` — modify its type to match:

In `src/app/meals/meal-list.tsx`, update:

```ts
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; durationDays: number; tags: Tag[] };
```

In `src/app/meals/page.tsx`, update the `meals.map(...)` passed to `<MealList>` to include `durationDays`:

```tsx
        meals={meals.map((m) => ({
          id: m.id,
          name: m.name,
          note: m.note,
          category: m.category,
          durationDays: m.durationDays,
          tags: m.tags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name })),
        }))}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

```bash
npm run dev
```

Navigate to `/meals`, add a new meal, confirm the "Lasts how many days" field defaults to 1, set it to 3, save, edit the same meal again, confirm it shows 3.

Stop the dev server once verified.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/meals/actions.ts src/app/meals/meal-form.tsx src/app/meals/meal-list.tsx src/app/meals/page.tsx
git commit -m "feat: add duration field to meal form"
```

---

## Task 13: E2E coverage for skipping a day

**Files:**
- Modify: `tests/e2e/happy-path.spec.ts`

- [ ] **Step 1: Write the extended E2E scenario**

In `tests/e2e/happy-path.spec.ts`, insert a new step after the existing `await expect(page.getByText('E2E Soup Meal').first()).toBeVisible();` line (right before generating the week) — actually, insert this new block right after `await page.getByRole('button', { name: 'Generate week' }).click();` and its two `expect(...).toBeVisible()` assertions, and before the "Simulate time passing" comment:

```ts
  // Skip one day and confirm it collapses to the day-off state instead of
  // showing meal selects.
  await page.getByRole('button', { name: 'Skip this day' }).first().click();
  await expect(page.getByText('No menu (day off)')).toBeVisible();
  await page.getByRole('button', { name: 'Add menu back' }).click();
  await expect(page.getByText('No menu (day off)')).not.toBeVisible();
```

- [ ] **Step 2: Run the E2E test**

```bash
npm run test:e2e -- happy-path.spec.ts
```

Expected: PASS. (This starts its own dev server per the `test:e2e` script — no manual server management needed.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/happy-path.spec.ts
git commit -m "test: cover skip/restore day toggle in e2e happy path"
```

---

## Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

```bash
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 2: Run the full integration suite**

```bash
npm run test:integration
```

Expected: all tests PASS.

- [ ] **Step 3: Run the full E2E suite**

```bash
npm run test:e2e
```

Expected: all tests PASS.

- [ ] **Step 4: Run lint and the production build**

```bash
npm run lint
npm run build
```

Expected: both exit 0 with no errors.

- [ ] **Step 5: Final review commit if any fixups were needed**

If any of the above steps required a fix, commit it now with a descriptive message (e.g. `fix: <what was wrong>`). If everything passed cleanly with no fixups, there is nothing to commit in this step.
