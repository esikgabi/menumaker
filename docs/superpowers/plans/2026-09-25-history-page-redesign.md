# History Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the History page (`/history`) by day within each week and add explicit Soup/Main category labels per row, so a day's cooked meals read as one unit instead of a flat list of visually-identical rows.

**Architecture:** `listCookedHistory` (in `src/lib/plan.ts`) changes its return shape from `{ weekStartKey, entries }[]` to `{ weekStartKey, days: { dateKey, entries }[] }[]`, regrouping the same already-fetched rows by day (soup before main) via a new private `groupByDay` helper — no new query, no schema change. `src/app/history/page.tsx` is updated to render the new nested shape: each week `Card` contains a day-header block per day, each row prefixed with a muted-gray category label reusing `/plan`'s existing style and translation keys.

**Tech Stack:** Next.js 14 App Router (server component), Prisma, next-intl (`Plan` namespace reused), Vitest (integration tests, Docker-backed).

**Spec:** `docs/superpowers/specs/2026-09-25-history-page-redesign-design.md`

---

## Task 1: Add `groupByDay` helper and update `listCookedHistory`'s return shape

**Files:**
- Modify: `src/lib/plan.ts:225-246` (replace `listCookedHistory`, add `groupByDay` + `CATEGORY_ORDER`)
- Test: `tests/integration/plan-history.test.ts`

This task changes `listCookedHistory`'s return shape and updates its existing test file to match. Because `listCookedHistory` is DB-backed (per `AGENTS.md`, this kind of orchestration is integration-tested, not unit-tested), we write the test first against the *new* shape, confirm it fails against the *old* implementation, then implement.

- [ ] **Step 1: Read the current test file to confirm exact current assertions**

Run: `sed -n '30,60p' tests/integration/plan-history.test.ts`

Expected output (current "grouping/ordering" test, using the OLD `entries` shape):
```ts
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStartKey).toBe(thisWeek[0]); // most recent week first
    expect(weeks[0].entries).toHaveLength(1);
    expect(weeks[0].entries[0].meal?.name).toBe('Cooked Meal');
    expect(weeks[1].weekStartKey).toBe(lastWeek[0]);
    expect(weeks[1].entries).toHaveLength(1);
  });
```

- [ ] **Step 2: Rewrite `tests/integration/plan-history.test.ts` for the new `days` shape**

Replace the full file content with:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import { listCookedHistory, localDateKey, getWeekDateKeys } from '@/lib/plan';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@history-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'History Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeHousehold(suffix: string) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@history-test.example.com`, name: 'Owner' },
  });
  return { household: await createHouseholdWithOwner(`History Test Household ${suffix}`, owner.id), owner };
}

describe('listCookedHistory', () => {
  it('returns only cooked entries, grouped by week then day, most recent week first', async () => {
    const { household, owner } = await makeHousehold('A');
    const meal = await createMeal(household.id, owner.id, { name: 'Cooked Meal', note: '', tagIds: [], category: 'main' });

    const thisWeek = getWeekDateKeys(new Date());
    const lastWeek = getWeekDateKeys(new Date(new Date(thisWeek[0]).getTime() - 7 * 24 * 60 * 60 * 1000));

    await prisma.planEntry.createMany({
      data: [
        { householdId: household.id, date: new Date(thisWeek[0]), category: 'main', mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(thisWeek[1]), category: 'main', mealId: meal.id, status: 'planned' }, // excluded
        { householdId: household.id, date: new Date(lastWeek[0]), category: 'main', mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(lastWeek[1]), category: 'main', mealId: null, status: 'skipped' }, // excluded
      ],
    });

    const weeks = await listCookedHistory(household.id);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStartKey).toBe(thisWeek[0]); // most recent week first
    expect(weeks[0].days).toHaveLength(1);
    expect(weeks[0].days[0].dateKey).toBe(thisWeek[0]);
    expect(weeks[0].days[0].entries).toHaveLength(1);
    expect(weeks[0].days[0].entries[0].meal?.name).toBe('Cooked Meal');
    expect(weeks[1].weekStartKey).toBe(lastWeek[0]);
    expect(weeks[1].days).toHaveLength(1);
  });

  it('does not return another household’s history', async () => {
    const { household: householdA, owner: ownerA } = await makeHousehold('B');
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'A Meal', note: '', tagIds: [], category: 'main' });
    await prisma.planEntry.create({
      data: { householdId: householdA.id, date: new Date(localDateKey(new Date())), category: 'main', mealId: meal.id, status: 'cooked' },
    });

    const { household: householdB } = await makeHousehold('C');

    const weeks = await listCookedHistory(householdB.id);

    expect(weeks).toHaveLength(0);
  });

  it('groups same-day main and soup entries into one day, soup before main', async () => {
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

    expect(weeks[0].days).toHaveLength(1); // same day -> one day group
    expect(weeks[0].days[0].dateKey).toBe(thisWeek[0]);
    const categories = weeks[0].days[0].entries.map((e: (typeof weeks)[number]['days'][number]['entries'][number]) => e.category);
    expect(categories).toEqual(['soup', 'main']); // soup before main
  });

  it('orders multiple days within a week most-recent-day-first', async () => {
    const { household, owner } = await makeHousehold('F');
    const meal = await createMeal(household.id, owner.id, { name: 'Repeatable Meal', note: '', tagIds: [], category: 'main' });
    const thisWeek = getWeekDateKeys(new Date());

    await prisma.planEntry.createMany({
      data: [
        { householdId: household.id, date: new Date(thisWeek[0]), category: 'main', mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(thisWeek[1]), category: 'main', mealId: meal.id, status: 'cooked' },
      ],
    });

    const weeks = await listCookedHistory(household.id);

    expect(weeks[0].days).toHaveLength(2);
    expect(weeks[0].days[0].dateKey).toBe(thisWeek[1]); // more recent day first
    expect(weeks[0].days[1].dateKey).toBe(thisWeek[0]);
  });

  it('excludes cooked entries whose meal was deleted', async () => {
    const { household, owner } = await makeHousehold('E');
    const meal = await createMeal(household.id, owner.id, { name: 'Doomed Meal', note: '', tagIds: [], category: 'main' });
    const thisWeek = getWeekDateKeys(new Date());

    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(thisWeek[0]), category: 'main', mealId: meal.id, status: 'cooked' },
    });
    await prisma.meal.delete({ where: { id: meal.id } }); // ON DELETE SET NULL -> mealId null

    const weeks = await listCookedHistory(household.id);

    expect(weeks).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the integration tests to confirm they fail against the current implementation**

Run: `npm run test:integration`

Expected: FAIL — `weeks[0].days` is `undefined` (current code returns `entries`, not `days`), e.g. `TypeError: Cannot read properties of undefined (reading 'length')` or similar assertion failures on the new test bodies. (The unrelated "household isolation" and "deleted meal" tests should still PASS since they don't reference `days`.)

- [ ] **Step 4: Implement `groupByDay` and update `listCookedHistory` in `src/lib/plan.ts`**

Replace lines 225–246 (the current `listCookedHistory` function, end of file) with:

```ts
const CATEGORY_ORDER = { soup: 0, main: 1 } as const;

function groupByDay<T extends { date: Date; category: 'main' | 'soup' }>(entries: T[]) {
  const dayMap = new Map<string, T[]>();
  for (const entry of entries) {
    const key = toDateKey(entry.date);
    const existing = dayMap.get(key);
    if (existing) existing.push(entry);
    else dayMap.set(key, [entry]);
  }

  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // most recent day first
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      entries: [...dayEntries].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]),
    }));
}

/** Returns cooked PlanEntry rows for a household, grouped by Monday-start week
 *  (most recent week first) and then by day within the week (most recent day
 *  first, soup before main within a day). */
export async function listCookedHistory(householdId: string) {
  const entries = (
    await prisma.planEntry.findMany({
      where: { householdId, status: 'cooked' },
      include: { meal: { include: { tags: { include: { tag: true } } } } },
      orderBy: { date: 'desc' },
    })
  ).filter((e) => e.meal !== null); // deleting a meal nulls the FK (ON DELETE SET NULL); don't render anonymous history rows

  const weekMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const weekStartKey = getWeekDateKeys(entry.date)[0];
    const existing = weekMap.get(weekStartKey);
    if (existing) existing.push(entry);
    else weekMap.set(weekStartKey, [entry]);
  }

  return [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartKey, weekEntries]) => ({
      weekStartKey,
      days: groupByDay(weekEntries),
    }));
}
```

- [ ] **Step 5: Run the integration tests to confirm they now pass**

Run: `npm run test:integration`

Expected: PASS — all 5 tests in `plan-history.test.ts` green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan.ts tests/integration/plan-history.test.ts
git commit -m "feat: group cooked history entries by day within each week"
```

---

## Task 2: Update `/history` page to render day groups with category labels

**Files:**
- Modify: `src/app/history/page.tsx` (full rewrite, currently 45 lines)

This is a presentational-only change consuming the new `days` shape from Task 1. No new test file — the existing e2e assertion in `tests/e2e/happy-path.spec.ts:88` (`expect(page.getByText('E2E Main Meal').first()).toBeVisible()`) already covers that a cooked meal name renders on `/history`, and it's unaffected by the row layout change (verified in Step 3 below).

- [ ] **Step 1: Replace the full contents of `src/app/history/page.tsx`**

```tsx
import { requireHousehold } from '@/lib/session';
import { listCookedHistory, transitionPastPlannedEntries } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function HistoryPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('History');
  const tPlan = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);
  const weeks = await listCookedHistory(householdId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {weeks.length === 0 && <p className="text-sm text-muted-foreground">{t('noHistory')}</p>}

      {weeks.map((week) => (
        <Card key={week.weekStartKey}>
          <CardHeader>
            <CardTitle className="text-base">{t('weekOf', { date: week.weekStartKey })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {week.days.map((day) => {
              const dayIndex = (new Date(day.dateKey).getDay() + 6) % 7; // Mon=0..Sun=6
              return (
                <div key={day.dateKey} className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-semibold">
                    {tPlan(DAY_NAME_KEYS[dayIndex])}, {day.dateKey}
                  </span>
                  {day.entries.map((entry: (typeof week.days)[number]['entries'][number]) => (
                    <div key={entry.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-11 shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                        {entry.category === 'soup' ? tPlan('soupLabel') : tPlan('mainLabel')}
                      </span>
                      <span className="text-sm">{entry.meal?.name}</span>
                      {entry.meal?.tags.map((mealTag: NonNullable<typeof entry.meal>['tags'][number]) => (
                        <Badge key={mealTag.tag.id} variant="outline">
                          {mealTag.tag.name}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run the linter**

Run: `npm run lint`

Expected: PASS with no errors/warnings for `src/app/history/page.tsx`.

- [ ] **Step 3: Run the e2e suite to confirm the existing history assertion still passes**

Run: `npm run test:e2e`

Expected: PASS. In particular the `happy-path.spec.ts` test that navigates to `/history` and asserts `E2E Main Meal` is visible should still pass, since that text is still rendered (as `entry.meal?.name` inside a day's Main row).

- [ ] **Step 4: Manual visual check in the dev server**

Run: `npm run dev`

Then in a browser, sign in (per repo's dev auth setup) and navigate to `/history`. Confirm:
- Days with both a cooked soup and main show two rows under one day header, Soup listed above Main.
- Days with only one category cooked show just that one row (no blank/placeholder row for the missing category).
- Tags render as outline badges next to the meal name, wrapping onto a new line on a narrow window instead of overflowing.

Stop the dev server (`Ctrl+C`) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat: render history entries grouped by day with category labels"
```

---

## Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npm run test:unit`

Expected: PASS (unaffected by this change — no unit tests touch `listCookedHistory` or the history page, per `AGENTS.md`'s pure/DB-orchestration split).

- [ ] **Step 2: Run integration tests**

Run: `npm run test:integration`

Expected: PASS — all of `plan-history.test.ts` plus the rest of the integration suite (unaffected files).

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS, no errors.

- [ ] **Step 4: Run e2e tests**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 5: Final review of the diff**

Run: `git log --oneline -3` and `git diff 763ea99..HEAD --stat`

Expected: Two commits (Task 1, Task 2) on top of `763ea99` (the design spec commit), touching exactly `src/lib/plan.ts`, `tests/integration/plan-history.test.ts`, and `src/app/history/page.tsx` — no unrelated files.
