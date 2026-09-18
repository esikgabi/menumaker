# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the findings from `2026-09-17-code-review-findings.md` (13 correctness + 3 over-engineering; 10 + 2 get tasks here, the rest are explicitly deferred or accepted as-is): UTC-date bug, warning math, invite-code strength, missing action guards, non-atomic tag update, history nulls, settings-page robustness, and 212 lines of dead code.

**Architecture:** All changes stay inside the existing `src/lib` (logic) / `src/app/**/actions.ts` (thin Server Actions) split. Date handling gets one new exported helper (`localDateKey`) for wall-clock "now"; `toDateKey` stays UTC for DB round-trips. Vitest pins `TZ` so date tests are deterministic.

**Tech Stack:** Next.js 14, Prisma 6, Vitest, Playwright, Zod, next-intl.

---

### Task 1: Server-local date keys (fixes finding A1, A10)

**Files:**
- Modify: `src/lib/plan.ts:1-33`, `src/lib/plan.ts:98-110`
- Modify: `vitest.config.ts`, `vitest.integration.config.ts`
- Modify: `tests/unit/plan-dates.test.ts`
- Modify: `tests/integration/plan-history.test.ts:63`, `tests/integration/plan.test.ts:226,241`
- Modify: `tests/e2e/happy-path.spec.ts:66`
- Modify: `docker-compose.yml` (app service env), `.env.example`

- [ ] **Step 1: Pin test timezones**

In `vitest.config.ts`, the `test` block becomes:

```ts
  test: {
    environment: 'node',
    // ponytail: unit date tests need a deterministic timezone; Europe/Budapest
    // (east of UTC) is what the product targets and exposes UTC-based "today" bugs.
    env: { TZ: 'Europe/Budapest' },
  },
```

In `vitest.integration.config.ts`, add `env: { TZ: 'UTC' }` to the `test` block (existing arithmetic there is written against UTC-midnight keys; UTC pin keeps it exact and deterministic).

- [ ] **Step 2: Write the failing tests**

In `tests/unit/plan-dates.test.ts`, update the import to include `localDateKey`:

```ts
import { getWeekDateKeys, getFutureWeekDateKeys, localDateKey, toDateKey } from '@/lib/plan';
```

Add these cases (inside the existing describes):

```ts
describe('localDateKey', () => {
  it('formats a locally-constructed Date using local calendar parts', () => {
    expect(localDateKey(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

// inside describe('getWeekDateKeys'):
it('computes the week from the local calendar date, not UTC', () => {
  // Local Monday 00:00. In Europe/Budapest (UTC+2) that instant is Sunday
  // 22:00 UTC, so a UTC-based implementation returns the PREVIOUS week.
  expect(getWeekDateKeys(new Date(2026, 8, 7))).toEqual([
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-11', '2026-09-12', '2026-09-13',
  ]);
});

// inside describe('getFutureWeekDateKeys'):
it('filters on the local calendar date', () => {
  const localMonday = new Date(2026, 8, 7);
  expect(getFutureWeekDateKeys(localMonday, localMonday)).toHaveLength(7);
  const localSunday = new Date(2026, 8, 13);
  expect(getFutureWeekDateKeys(localSunday, localSunday)).toEqual(['2026-09-13']);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm run test:unit`
Expected: the three new `it`s FAIL (week computed from previous Monday); existing tests pass.

- [ ] **Step 4: Implement the helpers**

In `src/lib/plan.ts`, replace lines 1-33 (the two imports-of-nothing header plus `toDateKey`, `getWeekDateKeys`, `getFutureWeekDateKeys`) with:

```ts
import { prisma } from '@/lib/prisma';

// ponytail: toDateKey is UTC on purpose — dates stored as @db.Date come back
// from Prisma as UTC-midnight instants, so UTC slicing round-trips exactly.
// Never use it to derive "today" from a wall clock; use localDateKey for that.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The local-calendar equivalent of toDateKey: for "now" and locally
// constructed Dates. Single server TZ; multi-timezone households would need a
// per-user TZ (upgrade path, not needed for one household per deployment).
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Returns the 7 date keys (Monday..Sunday) for the week containing `reference`, using the server's local calendar. */
export function getWeekDateKeys(reference: Date): string[] {
  const day = reference.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    reference.getFullYear(), reference.getMonth(), reference.getDate() - mondayOffset,
  );

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateKey(d);
  });
}

/**
 * Returns the date keys of `getWeekDateKeys(reference)` that are `>= today`
 * — i.e. the current Mon-Sun week, restricted to today onward. `today`
 * defaults to `reference` (production call sites always pass `new Date()`
 * for both, since "the week" and "today" are the same instant); the
 * separate parameter exists so tests can pin the week and the cutoff
 * independently.
 */
export function getFutureWeekDateKeys(reference: Date, today: Date = reference): string[] {
  const todayKey = localDateKey(today);
  return getWeekDateKeys(reference).filter((k) => k >= todayKey);
}
```

In `transitionPastPlannedEntries` (line ~99) change:

```ts
  const todayKey = toDateKey(new Date());
```

to:

```ts
  const todayKey = localDateKey(new Date());
```

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `npm run test:unit`
Expected: ALL pass (existing UTC-midnight-input tests still pass: under the Budapest pin, UTC-midnight instants fall on the same local calendar day, 02:00).

- [ ] **Step 6: Align test call sites that mean "today" or "a day offset"**

In `tests/integration/plan-history.test.ts:63` change
`date: new Date(toDateKey(new Date()))` → `date: new Date(localDateKey(new Date()))`
and add `localDateKey` to that file's import from `@/lib/plan`.

In `tests/integration/plan.test.ts` lines 226 and 241 change
`toDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))` → `localDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))`
and add `localDateKey` to the import (line 7-13 block). Line 256 (`+ 2 * 24 * ...`) stays `toDateKey` (a pure day-offset from today-UTC is a valid future date under the UTC pin).

- [ ] **Step 7: Make the e2e backdate match the app's local "today"**

In `tests/e2e/happy-path.spec.ts:66` replace:

```ts
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
```

with:

```ts
  // Must match src/lib/plan's server-local "today" (both run on this machine's
  // TZ). Inlined because Playwright's TS transform can't resolve the @/ alias.
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

- [ ] **Step 8: Pin the production container timezone**

In `docker-compose.yml`, inside the `app` service `environment` block, add:

```yaml
      TZ: ${TZ:-Europe/Budapest}
```

In `.env.example`, after the `NEXTAUTH_SECRET` line, add:

```
# Server timezone used for "today"/week boundaries. Set to your household's timezone.
TZ="Europe/Budapest"
```

- [ ] **Step 9: Run full checks**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all pass. (Run `npm run test:e2e` after Task 2 if the dev port is free.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/plan.ts vitest.config.ts vitest.integration.config.ts tests/unit/plan-dates.test.ts tests/integration/plan-history.test.ts tests/integration/plan.test.ts tests/e2e/happy-path.spec.ts docker-compose.yml .env.example
git commit -m "fix: compute today/week in server-local time, not UTC"
```

---

### Task 2: notEnoughMeals warning uses the real window (fixes A2)

**Files:**
- Modify: `src/app/plan/page.tsx:17,52-57`
- Modify: `src/app/plan/plan-view.tsx:29-37,116-120`
- Modify: `messages/en.json:51`, `messages/hu.json:51`

- [ ] **Step 1: Update the messages (both locales, same keys)**

`messages/en.json`:

```json
    "notEnoughMealsWarning": "You only have {count} meals available for {days} days — some days will repeat.",
```

`messages/hu.json`:

```json
    "notEnoughMealsWarning": "Csak {count} étel áll rendelkezésre {days} napra — néhány nap ismétlődni fog.",
```

- [ ] **Step 2: Pass the window length from the page**

In `src/app/plan/page.tsx`, change the `notEnoughMeals` prop and add `days`:

```tsx
      notEnoughMeals={mainMeals.length > 0 && mainMeals.length < futureWeek.length}
      days={futureWeek.length}
```

- [ ] **Step 3: Accept and use the new prop in PlanView**

In `src/app/plan/plan-view.tsx`, add `days: number;` to the props type and the destructured parameter, and change the warning render:

```tsx
          {t('notEnoughMealsWarning', { count: mealCount, days })}
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run test:unit`
Expected: pass. (Display logic; the e2e from Task 1's step 9 exercises the page.)

- [ ] **Step 5: Commit**

```bash
git add src/app/plan/page.tsx src/app/plan/plan-view.tsx messages/en.json messages/hu.json
git commit -m "fix: not-enough-meals warning counts the actual remaining week"
```

---

### Task 3: Harden onboarding Server Actions (fixes A4)

**Files:**
- Modify: `src/app/onboarding/actions.ts`
- Modify: `src/app/onboarding/onboarding-form.tsx:30,43`

- [ ] **Step 1: Add guards + validation to the actions**

Replace `src/app/onboarding/actions.ts` with:

```ts
'use server';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { createHouseholdWithOwner, joinHouseholdByInviteCode, householdNameSchema } from '@/lib/household';

export async function createHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan'); // the page guards too; the action must not be bypassable

  const parsed = householdNameSchema.safeParse(String(formData.get('name') ?? '').trim());
  if (!parsed.success) redirect('/onboarding?error=name-required');

  await createHouseholdWithOwner(parsed.data, session.user.id);
  redirect('/plan');
}

export async function joinHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan');

  const code = String(formData.get('inviteCode') ?? '').trim().toUpperCase();
  if (!code) redirect('/onboarding?error=code-required');

  const household = await joinHouseholdByInviteCode(code, session.user.id);
  if (!household) redirect('/onboarding?error=invalid-code');

  redirect('/plan');
}
```

- [ ] **Step 2: Mirror the limits in the form**

In `src/app/onboarding/onboarding-form.tsx`:
- name input: `<Input id="name" name="name" required maxLength={100} />`
- invite code input: `<Input id="inviteCode" name="inviteCode" defaultValue={prefilledCode} required maxLength={12} />`

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run test:unit`
Expected: pass. (`householdNameSchema` behavior is already unit-tested in `tests/unit/household.test.ts`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/actions.ts src/app/onboarding/onboarding-form.tsx
git commit -m "fix: onboarding actions guard household state and validate name length"
```

---

### Task 4: 12-char invite codes (fixes A3)

**Files:**
- Modify: `src/lib/household.ts:4-11`
- Modify: `tests/unit/household.test.ts:5-8`

- [ ] **Step 1: Write the failing test**

In `tests/unit/household.test.ts` change the regex and its description:

```ts
  it('generates a 12-character uppercase hex code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-F]{12}$/);
  });
```

Run: `npm run test:unit`
Expected: FAIL (current codes are 8 chars).

- [ ] **Step 2: Implement**

In `src/lib/household.ts` replace lines 4-11:

```ts
export function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

// ponytail: invite codes are not checked for collisions before insert (12-hex-char
// keyspace is 16^12 ≈ 2.8e14; pre-fix 8-hex codes were only ~4.3e9 and the join
// endpoint had no rate limit, so they were brute-forceable). If a collision ever
// happens, Prisma throws a unique-constraint error and the household is not
// created; add a retry loop if this is ever observed.
```

- [ ] **Step 3: Verify**

Run: `npm run test:unit`
Expected: PASS. Existing 8-char codes in live DBs keep working (join is an exact lookup, no length check).

- [ ] **Step 4: Commit**

```bash
git add src/lib/household.ts tests/unit/household.test.ts
git commit -m "fix: extend invite codes to 12 hex chars (48 bits)"
```

---

### Task 5: Make updateMeal atomic, fix the stale comment (fixes A5)

**Files:**
- Modify: `src/lib/meal.ts:54-76`

- [ ] **Step 1: Implement the transactional version**

In `src/lib/meal.ts` replace `updateMeal` (lines 54-76) with:

```ts
export async function updateMeal(householdId: string, mealId: string, input: MealInput) {
  const tagIds = await ownedTagIds(householdId, input.tagIds);

  // One transaction so a failed recreate can't leave the meal with zero tags.
  return prisma.$transaction(async (tx) => {
    const owned = await tx.meal.findFirst({ where: { id: mealId, householdId } });
    if (!owned) return null;

    await tx.mealTag.deleteMany({ where: { mealId } });

    return tx.meal.update({
      where: { id: mealId },
      data: {
        name: input.name,
        note: input.note || null,
        category: input.category,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: { tags: { include: { tag: true } } },
    });
  });
}
```

(The old `ponytail:` comment is deleted — it described a scoped-`updateMany` strategy the code never implemented.)

- [ ] **Step 2: Verify with existing integration coverage**

Run: `npm run test:integration`
Expected: all `tests/integration/meal.test.ts` cases pass, including "rejects updating a meal that belongs to a different household" (returns `null` from inside the transaction).

- [ ] **Step 3: Commit**

```bash
git add src/lib/meal.ts
git commit -m "fix: run updateMeal tag swap in one transaction"
```

---

### Task 6: Filter meal-less cooked entries from history (fixes A6)

**Files:**
- Modify: `src/lib/plan.ts:216-234`
- Test: `tests/integration/plan-history.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `tests/integration/plan-history.test.ts` inside `describe('listCookedHistory')`:

```ts
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
```

Run: `npm run test:integration -- plan-history`
Expected: NEW test FAILS (one week with a meal-less entry is returned); others pass.

- [ ] **Step 2: Implement the filter**

In `src/lib/plan.ts` `listCookedHistory`, change:

```ts
  const entries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked' },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: { date: 'desc' },
  });
```

to:

```ts
  const entries = (
    await prisma.planEntry.findMany({
      where: { householdId, status: 'cooked' },
      include: { meal: { include: { tags: { include: { tag: true } } } } },
      orderBy: { date: 'desc' },
    })
  ).filter((e) => e.meal !== null); // deleting a meal nulls the FK (ON DELETE SET NULL); don't render anonymous history rows
```

- [ ] **Step 3: Verify**

Run: `npm run test:integration`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plan.ts tests/integration/plan-history.test.ts
git commit -m "fix: hide cooked history rows whose meal was deleted"
```

---

### Task 7: Settings page goes through the lib layer (fixes A7)

**Files:**
- Modify: `src/lib/household.ts`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Add `getHousehold` to the lib**

In `src/lib/household.ts`, after `renameHousehold`:

```ts
export async function getHousehold(householdId: string) {
  return prisma.household.findUnique({ where: { id: householdId } });
}
```

- [ ] **Step 2: Use it in the page with a stale-session fallback**

In `src/app/settings/page.tsx` remove `import { prisma } from '@/lib/prisma';`, add `import { redirect } from 'next/navigation';` and `getHousehold` to the household import, and replace the Promise.all + usage:

```tsx
  const [household, members, tags] = await Promise.all([
    getHousehold(householdId),
    listHouseholdMembers(householdId),
    listTags(householdId),
  ]);
  if (!household) redirect('/onboarding'); // household vanished under us (e.g. last member left)
```

The `<SettingsView householdName={household.name} ...>` JSX is unchanged (`household` narrows to non-null after the redirect).

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run test:unit`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/household.ts src/app/settings/page.tsx
git commit -m "fix: settings page uses household lib and redirects on missing household"
```

---

### Task 8: Dedupe settings tag list (fixes A8)

**Files:**
- Modify: `src/app/settings/settings-view.tsx:50-55`

- [ ] **Step 1: Implement**

In `handleAddTag` change:

```ts
    if (tag) setTagList((prev) => [...prev, tag]);
```

to:

```ts
    if (tag) setTagList((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
```

(matches the existing dedupe in `src/app/meals/meal-form.tsx:53`.)

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/settings-view.tsx
git commit -m "fix: dedupe tags when adding an existing tag in settings"
```

---

### Task 9: Delete the unused dropdown-menu component + dep (audit #1)

**Files:**
- Delete: `src/components/ui/dropdown-menu.tsx`
- Modify: `package.json` (via npm)

- [ ] **Step 1: Confirm zero usages, then delete**

Run: `grep -rn "dropdown-menu" src/ --include="*.ts*"`
Expected: only the file itself. Then:

```bash
rm src/components/ui/dropdown-menu.tsx
npm uninstall @radix-ui/react-dropdown-menu
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run test:unit`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused dropdown-menu component and radix dep"
```

---

### Task 10: Delete the sanity test (audit #2)

**Files:**
- Delete: `tests/unit/sanity.test.ts`

- [ ] **Step 1: Delete and verify the runner still works**

```bash
rm tests/unit/sanity.test.ts
npm run test:unit
```

Expected: remaining unit tests pass (they prove the runner).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: drop 2+3 sanity test"
```

---

### Task 11: Declare the dotenv dependency Prisma's config imports (fixes A9)

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)

- [ ] **Step 1: Install as a declared devDependency**

```bash
npm i -D dotenv
```

- [ ] **Step 2: Verify Prisma CLI still loads its config**

Run: `npx prisma validate`
Expected: "Schema valid, silencing now." (no module-not-found error).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: declare dotenv devDependency used by prisma.config.ts"
```

---

### Final verification

- [ ] Run the full gauntlet from AGENTS.md:

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
```

Expected: all green.

- [ ] Spot-check manually in `npm run dev` (mock auth): `/plan` warning only shows when mains < remaining days; settings → add an existing tag name → no duplicate row.

## Self-review notes

- **Spec coverage:** findings A1→T1, A2→T2, A3→T4, A4→T3, A5→T5, A6→T6, A7→T7, A8→T8, A9→T11, A10→T1 (compose/.env); audit #1→T9, #2→T10. Audit #3 (duplicated `createTagAction`) stays a no-action: per-route colocated actions are the repo convention. A11/A12/A13 (Google button, ISO date formatting, package name) are deferred as optional — do them only on request.
- **Type consistency:** `localDateKey` is defined once (T1) and only consumed in the call sites listed; `days` prop added in T2 matches the prop type; `getHousehold` (T7) matches the `prisma.household.findUnique` shape already used.
- **Ordering:** T1 must land before any other task that runs `npm run test:integration`/`test:e2e` (it changes date semantics). Tasks 2-11 are independent of each other.
