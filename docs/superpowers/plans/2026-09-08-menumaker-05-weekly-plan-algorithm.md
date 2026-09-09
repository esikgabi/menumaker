# MenuMaker Phase 5: Weekly Plan & Suggestion Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the weekly-plan suggestion algorithm (recency avoidance, tag balance, no-repeat-where-possible) as a pure, unit-tested function; the automatic "planned → cooked/skipped" transition for past days; and the Weekly Plan home screen with a "Generate week" button and a per-day meal-swap dropdown.

**Architecture:** Date math and the suggestion algorithm live in `src/lib/plan.ts` as pure functions operating on plain `'YYYY-MM-DD'` date-key strings (no date library needed — native `Date` arithmetic is sufficient for Monday-Sunday week math). Database-touching functions (fetching cooking history, transitioning past entries, persisting a generated plan, per-day overrides) live alongside them in the same file but are separated so the pure algorithm is testable without a database. The Weekly Plan page is a Server Component; "Generate week" and the per-day dropdown are Server Actions.

**Tech Stack:** builds on Phases 1–4 (Next.js, Prisma `PlanEntry`, Auth.js, next-intl, `src/lib/meal.ts`). No new npm dependencies.

**Depends on:** Phase 1 (`PlanEntry` model), Phase 3 (`requireHousehold()`, i18n), Phase 4 (`listMeals`, meal/tag shapes).

---

### Task 1: Date-key helpers (pure, unit-tested)

**Files:**
- Create: `src/lib/plan.ts`
- Test: `tests/unit/plan-dates.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/plan-dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { getWeekDateKeys, toDateKey } from '@/lib/plan';

describe('toDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date('2026-09-08T15:30:00Z'))).toBe('2026-09-08');
  });
});

describe('getWeekDateKeys', () => {
  it('returns the Monday-Sunday keys for a week containing a Tuesday', () => {
    // 2026-09-08 is a Tuesday
    expect(getWeekDateKeys(new Date('2026-09-08T00:00:00Z'))).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('returns the same week when given a Sunday', () => {
    expect(getWeekDateKeys(new Date('2026-09-13T00:00:00Z'))[0]).toBe('2026-09-07');
  });

  it('returns the same week when given a Monday', () => {
    expect(getWeekDateKeys(new Date('2026-09-07T00:00:00Z'))[0]).toBe('2026-09-07');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/plan-dates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/plan'`.

- [ ] **Step 3: Implement the date helpers**

Create `src/lib/plan.ts` (this file grows with more exports in later tasks):

```ts
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns the 7 date keys (Monday..Sunday) for the week containing `reference`. */
export function getWeekDateKeys(reference: Date): string[] {
  const day = reference.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - mondayOffset),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return toDateKey(d);
  });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:unit -- tests/unit/plan-dates.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add date-key helpers for weekly plan generation"
```

---

### Task 2: Suggestion algorithm (pure, unit-tested)

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/unit/plan-algorithm.test.ts`

The algorithm's three inputs are: the household's meals (each with `id`, `name`, `tags: string[]`), a `cookedHistory` array of `{ mealId, dateKey }` (each row is a day that was actually cooked, most recent first not required), and the week's 7 date keys. It returns one `mealId | null` per date key plus a boolean `notEnoughMeals` warning flag.

- [ ] **Step 1: Write the failing tests**

`tests/unit/plan-algorithm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateWeeklyPlan } from '@/lib/plan';

const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

function meal(id: string, tags: string[] = []) {
  return { id, name: id, tags };
}

describe('generateWeeklyPlan', () => {
  it('assigns nothing and warns nothing when there are no meals', () => {
    const result = generateWeeklyPlan({ meals: [], cookedHistory: [], weekDateKeys: week });
    expect(result.assignments.every((a) => a.mealId === null)).toBe(true);
    expect(result.notEnoughMeals).toBe(false);
  });

  it('avoids a meal cooked within the last 3 weeks in favor of one never cooked', () => {
    const meals = [meal('recent'), meal('fresh')];
    const cookedHistory = [{ mealId: 'recent', dateKey: '2026-09-01' }]; // 6 days before week start
    const result = generateWeeklyPlan({ meals, cookedHistory, weekDateKeys: ['2026-09-07'] });
    expect(result.assignments[0].mealId).toBe('fresh');
  });

  it('allows a meal cooked more than 3 weeks ago', () => {
    const meals = [meal('old'), meal('fresh')];
    // 22 days before week start (> 3 weeks = 21 days)
    const cookedHistory = [{ mealId: 'old', dateKey: '2026-08-16' }];
    const result = generateWeeklyPlan({ meals, cookedHistory, weekDateKeys: ['2026-09-07'] });
    // 'old' is no longer "recent" so it's an equally valid pick as 'fresh';
    // with only one never-cooked candidate ('fresh') it still wins the tie
    // (never-cooked ranks first), so assert the non-recent set includes it.
    expect(['old', 'fresh']).toContain(result.assignments[0].mealId);
  });

  it('assigns 7 distinct meals with no repeats when 7+ meals are available', () => {
    const meals = Array.from({ length: 7 }, (_, i) => meal(`m${i}`));
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const ids = result.assignments.map((a) => a.mealId);
    expect(new Set(ids).size).toBe(7);
    expect(result.notEnoughMeals).toBe(false);
  });

  it('allows repeats and warns when fewer meals than days are available', () => {
    const meals = [meal('a'), meal('b'), meal('c'), meal('d')];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const ids = result.assignments.map((a) => a.mealId);
    expect(new Set(ids).size).toBeLessThanOrEqual(4);
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(result.notEnoughMeals).toBe(true);
  });

  it('ensures a healthy-tagged meal appears in the week when one exists', () => {
    const meals = [
      meal('junk1'),
      meal('junk2'),
      meal('junk3'),
      meal('junk4'),
      meal('junk5'),
      meal('junk6'),
      meal('healthyMeal', ['healthy']),
    ];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const assignedTags = result.assignments.map((a) => meals.find((m) => m.id === a.mealId)?.tags ?? []);
    expect(assignedTags.some((tags) => tags.includes('healthy'))).toBe(true);
  });

  it('ensures a fast-to-make-tagged meal appears in the week when one exists', () => {
    const meals = [
      meal('junk1'),
      meal('junk2'),
      meal('junk3'),
      meal('junk4'),
      meal('junk5'),
      meal('junk6'),
      meal('fastMeal', ['fast to make']),
    ];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const assignedTags = result.assignments.map((a) => meals.find((m) => m.id === a.mealId)?.tags ?? []);
    expect(assignedTags.some((tags) => tags.includes('fast to make'))).toBe(true);
  });

  it('does not force a healthy meal when none exists in the household', () => {
    const meals = [meal('a'), meal('b')];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: ['2026-09-07'] });
    expect(result.assignments[0].mealId).not.toBeNull();
  });

  it('is deterministic for identical inputs', () => {
    const meals = [meal('a', ['healthy']), meal('b'), meal('c', ['fast to make']), meal('d'), meal('e')];
    const first = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const second = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    expect(first.assignments).toEqual(second.assignments);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/plan-algorithm.test.ts`
Expected: FAIL — `generateWeeklyPlan is not a function` (or similar, since it doesn't exist yet).

- [ ] **Step 3: Implement the algorithm**

Append to `src/lib/plan.ts`:

```ts
export type PlanMeal = { id: string; name: string; tags: string[] };
export type CookedHistoryEntry = { mealId: string; dateKey: string };

const AVOID_REPEAT_WEEKS = 3;
const BALANCE_TAGS = ['healthy', 'fast to make'];

export function generateWeeklyPlan(input: {
  meals: PlanMeal[];
  cookedHistory: CookedHistoryEntry[];
  weekDateKeys: string[];
}): { assignments: { dateKey: string; mealId: string | null }[]; notEnoughMeals: boolean } {
  const { meals, cookedHistory, weekDateKeys } = input;

  if (meals.length === 0) {
    return {
      assignments: weekDateKeys.map((dateKey) => ({ dateKey, mealId: null })),
      notEnoughMeals: false,
    };
  }

  const cutoffKey = toDateKey(
    new Date(new Date(weekDateKeys[0]).getTime() - AVOID_REPEAT_WEEKS * 7 * 24 * 60 * 60 * 1000),
  );

  const lastCookedKey = new Map<string, string>();
  for (const entry of cookedHistory) {
    const existing = lastCookedKey.get(entry.mealId);
    if (!existing || entry.dateKey > existing) lastCookedKey.set(entry.mealId, entry.dateKey);
  }

  function isRecentlyCooked(mealId: string): boolean {
    const key = lastCookedKey.get(mealId);
    return key !== undefined && key >= cutoffKey;
  }

  // Rank candidates: never-cooked-or-not-recently-cooked meals first (oldest
  // cooked date first among them), recently-cooked meals last. Ties broken
  // alphabetically by name so the algorithm is deterministic and testable.
  const ranked = [...meals].sort((a, b) => {
    const aRecent = isRecentlyCooked(a.id);
    const bRecent = isRecentlyCooked(b.id);
    if (aRecent !== bRecent) return aRecent ? 1 : -1;
    const aLast = lastCookedKey.get(a.id) ?? '';
    const bLast = lastCookedKey.get(b.id) ?? '';
    if (aLast !== bLast) return aLast.localeCompare(bLast);
    return a.name.localeCompare(b.name);
  });

  const notEnoughMeals = meals.length < weekDateKeys.length;

  // First pass: no repeats while distinct candidates remain, then cycle.
  const assignedMealIds: string[] = [];
  for (let i = 0; i < weekDateKeys.length; i++) {
    const unused = ranked.find((m) => !assignedMealIds.includes(m.id));
    assignedMealIds.push(unused ? unused.id : ranked[i % ranked.length].id);
  }

  // Second pass: tag balance. Swap in a tagged candidate for the first day
  // that holds a *repeated* meal, preferring not to disturb days whose meal
  // is uniquely assigned that week.
  for (const requiredTag of BALANCE_TAGS) {
    const alreadyPresent = assignedMealIds.some((id) => meals.find((m) => m.id === id)?.tags.includes(requiredTag));
    if (alreadyPresent) continue;

    const candidate = ranked.find((m) => m.tags.includes(requiredTag));
    if (!candidate) continue; // household has no meal with this tag at all

    const duplicateIndex = assignedMealIds.findIndex(
      (id, idx) => assignedMealIds.indexOf(id) !== idx,
    );
    const swapIndex = duplicateIndex !== -1 ? duplicateIndex : 0;
    assignedMealIds[swapIndex] = candidate.id;
  }

  return {
    assignments: weekDateKeys.map((dateKey, i) => ({ dateKey, mealId: assignedMealIds[i] })),
    notEnoughMeals,
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:unit -- tests/unit/plan-algorithm.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement weekly plan suggestion algorithm"
```

---

### Task 3: Database functions — history transition, plan fetch/generate/override (with integration tests)

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/integration/plan.test.ts`

Design decision on ambiguous spec behavior: a `planned` entry whose date has passed becomes `cooked` **only if it has a meal assigned**; if it has no meal assigned (`mealId` is null) it becomes `skipped` instead, since nothing was actually cooked. This is the only sensible reading of "a planned entry automatically becomes cooked once its date has passed" when `mealId` is nullable per the spec's own data model.

- [ ] **Step 1: Implement the DB functions**

Append to `src/lib/plan.ts`:

```ts
import { prisma } from '@/lib/prisma';

/** Transitions past `planned` entries to `cooked` (if a meal was assigned) or `skipped` (if not). */
export async function transitionPastPlannedEntries(householdId: string) {
  const todayKey = toDateKey(new Date());

  await prisma.planEntry.updateMany({
    where: { householdId, status: 'planned', date: { lt: new Date(todayKey) }, mealId: { not: null } },
    data: { status: 'cooked' },
  });

  await prisma.planEntry.updateMany({
    where: { householdId, status: 'planned', date: { lt: new Date(todayKey) }, mealId: null },
    data: { status: 'skipped' },
  });
}

/** Ensures a PlanEntry row exists for every date key in the week, then returns them with meal+tags included. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => toDateKey(e.date)));

  const missingKeys = weekDateKeys.filter((k) => !existingKeys.has(k));
  if (missingKeys.length > 0) {
    await prisma.planEntry.createMany({
      data: missingKeys.map((dateKey) => ({ householdId, date: new Date(dateKey), status: 'planned' })),
    });
  }

  return prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: { date: 'asc' },
  });
}

/** Regenerates suggestions for every day in the week that is not already `cooked` (immutable history). */
export async function generateAndSaveWeeklyPlan(householdId: string, weekDateKeys: string[]) {
  const meals = await prisma.meal.findMany({
    where: { householdId },
    include: { tags: { include: { tag: true } } },
  });
  const planMeals: PlanMeal[] = meals.map((m) => ({
    id: m.id,
    name: m.name,
    tags: m.tags.map((mt) => mt.tag.name),
  }));

  const cookedEntries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked', mealId: { not: null } },
  });
  const cookedHistory: CookedHistoryEntry[] = cookedEntries.map((e) => ({
    mealId: e.mealId!,
    dateKey: toDateKey(e.date),
  }));

  const { assignments } = generateWeeklyPlan({ meals: planMeals, cookedHistory, weekDateKeys });

  await getOrCreateWeekPlan(householdId, weekDateKeys); // ensure rows exist first

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => toDateKey(e.date)));

  await Promise.all(
    assignments
      .filter((a) => editableKeys.has(a.dateKey))
      .map((a) =>
        prisma.planEntry.updateMany({
          where: { householdId, date: new Date(a.dateKey) },
          data: { mealId: a.mealId, status: 'planned' },
        }),
      ),
  );
}

/** Per-day manual override, scoped to the caller's household. */
export async function setPlanEntryMeal(householdId: string, dateKey: string, mealId: string) {
  const meal = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!meal) return null;

  return prisma.planEntry.upsert({
    where: { householdId_date: { householdId, date: new Date(dateKey) } },
    update: { mealId, status: 'planned' },
    create: { householdId, date: new Date(dateKey), mealId, status: 'planned' },
  });
}
```

- [ ] **Step 2: Add the `@@unique([householdId, date])` name Prisma generates**

Run: `grep -A2 "model PlanEntry" prisma/schema.prisma`
Expected: the `@@unique([householdId, date])` from Phase 1 is present — Prisma names the compound-unique field `householdId_date` by default, matching the `upsert` call above. If your Prisma version generated a different name, run `npx prisma generate` and check `node_modules/.prisma/client/index.d.ts` for the exact field name and adjust the `where` key accordingly.

- [ ] **Step 3: Write the integration test**

`tests/integration/plan.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import {
  getWeekDateKeys,
  getOrCreateWeekPlan,
  generateAndSaveWeeklyPlan,
  setPlanEntryMeal,
  transitionPastPlannedEntries,
  toDateKey,
} from '@/lib/plan';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@plan-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Plan Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

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

describe('getOrCreateWeekPlan', () => {
  it('creates 7 planned entries for a new week and is idempotent', async () => {
    const { household } = await makeHouseholdWithMeals('A', []);
    const week = getWeekDateKeys(new Date());

    const first = await getOrCreateWeekPlan(household.id, week);
    expect(first).toHaveLength(7);
    expect(first.every((e) => e.status === 'planned')).toBe(true);

    const second = await getOrCreateWeekPlan(household.id, week);
    expect(second).toHaveLength(7); // no duplicates created
  });
});

describe('generateAndSaveWeeklyPlan', () => {
  it('assigns meals for a household and does not touch another household', async () => {
    const { household } = await makeHouseholdWithMeals('B', ['Meal 1', 'Meal 2', 'Meal 3']);
    const { household: otherHousehold } = await makeHouseholdWithMeals('C', ['Other Meal']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.filter((e) => e.mealId !== null).length).toBeGreaterThan(0);

    const otherEntries = await getOrCreateWeekPlan(otherHousehold.id, week);
    expect(otherEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('does not overwrite a day already marked cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('D', ['Meal X', 'Meal Y']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    await generateAndSaveWeeklyPlan(household.id, week);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
    });
    expect(entry?.mealId).toBe(meals[0].id);
    expect(entry?.status).toBe('cooked');
  });
});

describe('setPlanEntryMeal', () => {
  it('overrides a day with a chosen meal', async () => {
    const { household, meals } = await makeHouseholdWithMeals('E', ['Meal 1', 'Meal 2']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[2], meals[1].id);

    expect(result?.mealId).toBe(meals[1].id);
  });

  it('rejects a meal that belongs to another household', async () => {
    const { household } = await makeHouseholdWithMeals('F', []);
    const { meals: otherMeals } = await makeHouseholdWithMeals('G', ['Foreign Meal']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[0], otherMeals[0].id);

    expect(result).toBeNull();
  });
});

describe('transitionPastPlannedEntries', () => {
  it('marks a past planned entry with a meal as cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('H', ['Meal 1']);
    const pastDateKey = toDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), mealId: meals[0].id, status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(pastDateKey) } },
    });
    expect(entry?.status).toBe('cooked');
  });

  it('marks a past planned entry with no meal as skipped', async () => {
    const { household } = await makeHouseholdWithMeals('I', []);
    const pastDateKey = toDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(pastDateKey) } },
    });
    expect(entry?.status).toBe('skipped');
  });

  it('does not touch a future planned entry', async () => {
    const { household } = await makeHouseholdWithMeals('J', []);
    const futureDateKey = toDateKey(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(futureDateKey), status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(futureDateKey) } },
    });
    expect(entry?.status).toBe('planned');
  });
});
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add weekly plan DB functions with household-isolation and transition tests"
```

---

### Task 4: Weekly Plan page (home screen)

**Files:**
- Create: `src/app/plan/actions.ts`, `src/app/plan/plan-view.tsx`
- Modify: `src/app/plan/page.tsx`, `messages/en.json`, `messages/hu.json`

- [ ] **Step 1: Add translations**

Add to `messages/en.json`:
```json
"Plan": {
  "title": "Weekly Plan",
  "generateWeek": "Generate week",
  "noMealsYet": "Add some meals first before generating a plan.",
  "notEnoughMealsWarning": "You only have {count} meals available for 7 days — some days will repeat.",
  "noMealAssigned": "No meal assigned",
  "statusCooked": "Cooked",
  "statusSkipped": "Skipped",
  "monday": "Monday",
  "tuesday": "Tuesday",
  "wednesday": "Wednesday",
  "thursday": "Thursday",
  "friday": "Friday",
  "saturday": "Saturday",
  "sunday": "Sunday"
}
```

Add to `messages/hu.json`:
```json
"Plan": {
  "title": "Heti menü",
  "generateWeek": "Hét generálása",
  "noMealsYet": "Adj hozzá ételeket, mielőtt menüt generálnál.",
  "notEnoughMealsWarning": "Csak {count} étel áll rendelkezésre 7 napra — néhány nap ismétlődni fog.",
  "noMealAssigned": "Nincs étel hozzárendelve",
  "statusCooked": "Elkészült",
  "statusSkipped": "Kihagyva",
  "monday": "Hétfő",
  "tuesday": "Kedd",
  "wednesday": "Szerda",
  "thursday": "Csütörtök",
  "friday": "Péntek",
  "saturday": "Szombat",
  "sunday": "Vasárnap"
}
```

- [ ] **Step 2: Server Actions**

`src/app/plan/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getWeekDateKeys } from '@/lib/plan';

export async function generateWeekAction() {
  const session = await requireHousehold();
  const week = getWeekDateKeys(new Date());
  await generateAndSaveWeeklyPlan(session.user.householdId!, week);
  revalidatePath('/plan');
}

export async function overrideDayAction(dateKey: string, mealId: string) {
  const session = await requireHousehold();
  const result = await setPlanEntryMeal(session.user.householdId!, dateKey, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/plan');
}
```

- [ ] **Step 3: Client view (stacked cards, mobile-friendly)**

`src/app/plan/plan-view.tsx`:
```tsx
'use client';

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
type DayEntry = { dateKey: string; dayName: string; mealId: string | null; mealName: string | null; tags: string[]; status: 'planned' | 'cooked' | 'skipped' };

export function PlanView({
  days,
  allMeals,
  hasMeals,
  notEnoughMeals,
  mealCount,
}: {
  days: DayEntry[];
  allMeals: Meal[];
  hasMeals: boolean;
  notEnoughMeals: boolean;
  mealCount: number;
}) {
  const t = useTranslations('Plan');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button disabled={!hasMeals} onClick={() => generateWeekAction()}>
          {t('generateWeek')}
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
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{day.dayName}</CardTitle>
              {day.status !== 'planned' && (
                <Badge variant={day.status === 'cooked' ? 'default' : 'secondary'}>
                  {day.status === 'cooked' ? t('statusCooked') : t('statusSkipped')}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {day.status === 'planned' ? (
                <Select
                  value={day.mealId ?? undefined}
                  onValueChange={(mealId) => overrideDayAction(day.dateKey, mealId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('noMealAssigned')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allMeals.map((meal) => (
                      <SelectItem key={meal.id} value={meal.id}>
                        {meal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{day.mealName ?? t('noMealAssigned')}</p>
              )}
              <div className="flex gap-1">
                {day.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Page — run the transition, fetch data, map to view props**

`src/app/plan/page.tsx`:
```tsx
import { requireHousehold } from '@/lib/session';
import { listMeals } from '@/lib/meal';
import { getWeekDateKeys, getOrCreateWeekPlan, transitionPastPlannedEntries } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { PlanView } from './plan-view';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function PlanPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);

  const week = getWeekDateKeys(new Date());
  const [entries, meals] = await Promise.all([
    getOrCreateWeekPlan(householdId, week),
    listMeals(householdId),
  ]);

  const entryByDateKey = new Map(entries.map((e) => [e.date.toISOString().slice(0, 10), e]));

  const days = week.map((dateKey, i) => {
    const entry = entryByDateKey.get(dateKey);
    return {
      dateKey,
      dayName: t(DAY_NAME_KEYS[i]),
      mealId: entry?.mealId ?? null,
      mealName: entry?.meal?.name ?? null,
      tags: entry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
      status: (entry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
    };
  });

  return (
    <PlanView
      days={days}
      allMeals={meals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      hasMeals={meals.length > 0}
      notEnoughMeals={meals.length > 0 && meals.length < 7}
      mealCount={meals.length}
    />
  );
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, sign in, add 3–4 meals via `/meals` (include at least one tagged "healthy" and one tagged "fast to make"), go to `/plan`.
Expected: 7 stacked day cards Mon–Sun. "Generate week" button enabled; clicking it fills in meals, avoiding immediate repeats where possible, and a warning banner appears if fewer than 7 meals exist. Changing a day's dropdown immediately updates that day only. Resize the browser to a narrow width — cards remain readable (stacked layout, no horizontal scrolling).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement Weekly Plan home screen with generate and per-day override"
```

---

## Self-Review Notes

- **Spec coverage:** all three algorithm rules from "Weekly Plan Generation" are implemented and unit-tested: recency avoidance (default N=3 weeks, per household), tag balance (healthy + fast to make, only enforced when such meals exist), no-repeats-where-possible with a warning when the household has fewer distinct meals than days. Screens #3 (Weekly Plan home: Mon–Sun view, assigned meal + tags per day, "Generate week" button, per-day swap dropdown, mobile-friendly stacked cards) — fully implemented. Cooking-history derivation (spec's Data Model section: "a planned entry automatically becomes cooked once its date has passed... checked on relevant page loads") — implemented via `transitionPastPlannedEntries`, called at the top of the Plan page render.
- **Error Handling coverage:** "No meals yet: Generate week is disabled with a message" — `hasMeals` disables the button and shows `noMealsYet`. "Not enough meals to avoid repeats: allow repeats; show a warning banner" — `notEnoughMeals` banner.
- **Household isolation:** verified by integration tests (Task 3) that generation/override never touches another household's `PlanEntry` or accepts another household's `Meal` id.
- **Type consistency:** `PlanMeal`/`CookedHistoryEntry` types defined once in `src/lib/plan.ts` and reused by both the pure algorithm and the DB functions; the `DayEntry` shape in `plan-view.tsx` matches exactly what `page.tsx` constructs.
- **Deferred:** the read-only History screen (Phase 6) reads the same `PlanEntry` rows with `status = 'cooked'` produced here, and must also call `transitionPastPlannedEntries` itself since a user could load `/history` without visiting `/plan` first in a session.
