# MenuMaker Phase 6: History Screen & Playwright E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the read-only History screen (past weeks' `PlanEntry` rows with `status = 'cooked'`, grouped by week, most recent first) and the one required Playwright E2E happy-path test: sign in (mocked dev-login), create a household, add a meal, generate a week, verify a plan entry auto-transitions to `cooked` after its date passes.

**Architecture:** History reuses `src/lib/plan.ts`'s date helpers and calls `transitionPastPlannedEntries()` (Phase 5) before reading, same as the Plan page. A new `listCookedHistory()` function groups cooked entries by their Monday-start week key. The E2E test manipulates the database directly (via Prisma) to backdate a `PlanEntry`'s date to the past, since waiting real calendar time in a test is impractical — this is the standard approach for testing date-based transitions.

**Tech Stack:** `@playwright/test` (not yet installed) added as a new dev dependency; builds on Phases 1–5.

**Depends on:** Phase 1 (Prisma schema, Docker Postgres), Phase 2 (auth, dev-login), Phase 3 (`requireHousehold`, i18n, onboarding), Phase 4 (meals), Phase 5 (`generateAndSaveWeeklyPlan`, `transitionPastPlannedEntries`, week helpers).

---

### Task 1: Cooked-history query function (with integration test)

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `tests/integration/plan-history.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/plan-history.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import { listCookedHistory, toDateKey, getWeekDateKeys } from '@/lib/plan';

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
  it('returns only cooked entries, grouped by week, most recent week first', async () => {
    const { household, owner } = await makeHousehold('A');
    const meal = await createMeal(household.id, owner.id, { name: 'Cooked Meal', note: '', tagIds: [] });

    const thisWeek = getWeekDateKeys(new Date());
    const lastWeek = getWeekDateKeys(new Date(new Date(thisWeek[0]).getTime() - 7 * 24 * 60 * 60 * 1000));

    await prisma.planEntry.createMany({
      data: [
        { householdId: household.id, date: new Date(thisWeek[0]), mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(thisWeek[1]), mealId: meal.id, status: 'planned' }, // excluded
        { householdId: household.id, date: new Date(lastWeek[0]), mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(lastWeek[1]), mealId: null, status: 'skipped' }, // excluded
      ],
    });

    const weeks = await listCookedHistory(household.id);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStartKey).toBe(thisWeek[0]); // most recent week first
    expect(weeks[0].entries).toHaveLength(1);
    expect(weeks[0].entries[0].meal?.name).toBe('Cooked Meal');
    expect(weeks[1].weekStartKey).toBe(lastWeek[0]);
    expect(weeks[1].entries).toHaveLength(1);
  });

  it('does not return another household’s history', async () => {
    const { household: householdA, owner: ownerA } = await makeHousehold('B');
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'A Meal', note: '', tagIds: [] });
    await prisma.planEntry.create({
      data: { householdId: householdA.id, date: new Date(toDateKey(new Date())), mealId: meal.id, status: 'cooked' },
    });

    const { household: householdB } = await makeHousehold('C');

    const weeks = await listCookedHistory(householdB.id);

    expect(weeks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:integration`
Expected: FAIL — `listCookedHistory is not a function`.

- [ ] **Step 3: Implement `listCookedHistory`**

Append to `src/lib/plan.ts`:

```ts
/** Returns cooked PlanEntry rows for a household, grouped by Monday-start week, most recent week first. */
export async function listCookedHistory(householdId: string) {
  const entries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked' },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: { date: 'desc' },
  });

  const weekMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const weekStartKey = getWeekDateKeys(entry.date)[0];
    const existing = weekMap.get(weekStartKey);
    if (existing) existing.push(entry);
    else weekMap.set(weekStartKey, [entry]);
  }

  return [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartKey, weekEntries]) => ({ weekStartKey, entries: weekEntries }));
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add cooked-history query grouped by week"
```

---

### Task 2: History page

**Files:**
- Modify: `src/app/history/page.tsx`, `messages/en.json`, `messages/hu.json`

- [ ] **Step 1: Add translations**

Add to `messages/en.json`:
```json
"History": {
  "title": "History",
  "weekOf": "Week of {date}",
  "noHistory": "No cooking history yet. Once a planned day passes, it will show up here."
}
```

Add to `messages/hu.json`:
```json
"History": {
  "title": "Előzmények",
  "weekOf": "{date} hete",
  "noHistory": "Még nincs előzmény. Amint egy tervezett nap eltelik, itt fog megjelenni."
}
```

- [ ] **Step 2: Implement the page**

`src/app/history/page.tsx`:
```tsx
import { requireHousehold } from '@/lib/session';
import { listCookedHistory, transitionPastPlannedEntries } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function HistoryPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('History');

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
          <CardContent className="flex flex-col gap-2">
            {week.entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span className="text-sm text-muted-foreground">{entry.date.toISOString().slice(0, 10)}</span>
                <span className="font-medium">{entry.meal?.name}</span>
                <div className="flex gap-1">
                  {entry.meal?.tags.map((mealTag) => (
                    <Badge key={mealTag.tag.id} variant="outline">
                      {mealTag.tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, sign in, go to `/plan`, generate a week. Using `npx prisma studio`, manually set one `PlanEntry`'s `date` to yesterday and reload `/plan` (this triggers the transition), then visit `/history`.
Expected: `/history` shows one week card containing the now-`cooked` entry with its meal name and tags; no `planned`/`skipped` entries appear.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: implement read-only History screen"
```

---

### Task 3: Install Playwright and configure it against the dev-login flow

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/happy-path.spec.ts`
- Modify: `package.json`, `.env.example`

- [ ] **Step 1: Install Playwright**

Run: `npm install -D @playwright/test@1.55.1`
Run: `npx playwright install --with-deps chromium`

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Confirm `.env.example` (and hence local `.env.local`) has mock auth enabled — required for this test to be able to sign in**

`.env.example` already sets `ENABLE_MOCK_AUTH=true` and should also set `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` (from Phase 2). Run `grep MOCK_AUTH .env.example` to confirm both lines are present; if `NEXT_PUBLIC_ENABLE_MOCK_AUTH` is missing, add it.

- [ ] **Step 4: Write the Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

- [ ] **Step 5: Write the happy-path E2E test**

The dev-login form (from Phase 2) is only rendered when `NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'`. This test drives it end-to-end through the UI and uses Prisma directly only to backdate the plan entry (simulating time passing), since no other mechanism to jump forward in time exists in the app.

`tests/e2e/happy-path.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';

test.beforeEach(async () => {
  // Clean slate for this test's known dev-login email.
  const user = await prisma.user.findUnique({ where: { email: 'e2e-happy-path@example.com' } });
  if (user) {
    await prisma.planEntry.deleteMany({ where: { householdId: user.householdId ?? undefined } });
    await prisma.mealTag.deleteMany({ where: { meal: { createdById: user.id } } });
    await prisma.meal.deleteMany({ where: { createdById: user.id } });
    if (user.householdId) {
      await prisma.tag.deleteMany({ where: { householdId: user.householdId } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    if (user.householdId) {
      await prisma.household.deleteMany({ where: { id: user.householdId } });
    }
  }
});

test('sign in, create household, add a meal, generate a week, and see it transition to cooked', async ({ page }) => {
  await page.goto('/signin');

  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill('e2e-happy-path@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('/onboarding');
  await page.getByLabel('Household name').fill('E2E Household');
  await page.getByRole('button', { name: 'Create household' }).click();

  await page.waitForURL('/plan');

  await page.getByRole('link', { name: 'Meals' }).click();
  await page.waitForURL('/meals');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByLabel('Name').fill('E2E Test Meal');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Test Meal')).toBeVisible();

  await page.getByRole('link', { name: 'Weekly Plan' }).click();
  await page.waitForURL('/plan');
  await page.getByRole('button', { name: 'Generate week' }).click();
  await expect(page.getByText('E2E Test Meal').first()).toBeVisible();

  // Simulate time passing: backdate today's plan entry directly via Prisma,
  // since the app has no time-travel UI and this test can't wait real days.
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'e2e-happy-path@example.com' } });
  const householdId = user.householdId!;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayEntry = await prisma.planEntry.findFirst({
    where: { householdId, status: 'planned', mealId: { not: null } },
  });
  await prisma.planEntry.update({
    where: { id: todayEntry!.id },
    data: { date: new Date(yesterday) },
  });

  await page.reload(); // triggers transitionPastPlannedEntries on the server

  await page.getByRole('link', { name: 'History' }).click();
  await page.waitForURL('/history');
  await expect(page.getByText('E2E Test Meal')).toBeVisible();
});
```

- [ ] **Step 6: Run it against the local dev server (requires a running Postgres, per README dev setup)**

Run: `npm run test:e2e`
Expected: 1 test passes. If it fails on a selector, run `npx playwright test --debug` to step through and adjust the selector to match the actual rendered markup (label text, button text) from Phases 2–5 — do not change the app just to make the test pass; only adjust the test's selectors, and only edit the plan file at that point if a step in Phases 2–5 needs a discovered fix.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add Playwright E2E happy-path test"
```

---

## Self-Review Notes

- **Spec coverage:** History screen (spec Screens #5: "read-only view of past weeks' PlanEntry records with status = 'cooked'") — implemented, grouped by week, most recent first, read-only (no edit/delete controls). E2E requirement (spec Testing Strategy: "sign in (mocked), create household, add a meal, generate a week, verify a plan entry auto-transitions to cooked after its date passes") — implemented as the one Playwright test, matching every step named in the spec.
- **Household isolation:** verified by the second `listCookedHistory` integration test.
- **Why backdate via Prisma instead of waiting:** the spec's automatic transition is date-based ("checked on relevant page loads"); an E2E test cannot wait real days, so directly moving a row's `date` into the past and reloading the page is the standard technique to exercise date-dependent logic without mocking `Date` globally (which would require reworking `transitionPastPlannedEntries` to accept an injectable clock — unnecessary complexity for one test).
- **Deferred:** Household Settings (Phase 7) is the last remaining screen. Production deployment docs land in Phase 8.
