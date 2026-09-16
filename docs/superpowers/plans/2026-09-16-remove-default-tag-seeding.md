# Remove Default Tag Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop auto-seeding 5 hardcoded English tags on household creation, and make the weekly-plan tag-balancing algorithm recognize both English and Hungarian names for "healthy" and "fast to make" so balancing still works without seeded tags.

**Architecture:** `createHouseholdWithOwner` (`src/lib/household.ts`) drops its nested `tags: { create }` write and the `DEFAULT_TAGS` constant. `generateWeeklyPlan` (`src/lib/plan.ts`) replaces the flat `BALANCE_TAGS` array with `BALANCE_TAG_GROUPS`, a list of synonym groups, and matches a meal's tags against any member of a group instead of a single string.

**Tech Stack:** TypeScript, Prisma, Vitest (unit + integration).

**Spec:** `docs/superpowers/specs/2026-09-16-remove-default-tag-seeding-design.md`

---

### Task 1: Make tag-balance matching locale-aware (`BALANCE_TAG_GROUPS`)

**Files:**
- Modify: `src/lib/plan.ts:39`, `src/lib/plan.ts:96-101`
- Test: `tests/unit/plan-algorithm.test.ts`

- [ ] **Step 1: Write a failing test for the Hungarian synonym**

Add this test right after the existing `'ensures a healthy-tagged meal appears in the week when one exists'` test (after line 65) in `tests/unit/plan-algorithm.test.ts`:

```ts
  it('ensures a meal tagged with the Hungarian "egészséges" synonym appears in the week', () => {
    const meals = [
      meal('junk1'),
      meal('junk2'),
      meal('junk3'),
      meal('junk4'),
      meal('junk5'),
      meal('junk6'),
      meal('healthyMeal', ['egészséges']),
    ];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const assignedTags = result.assignments.map((a) => meals.find((m) => m.id === a.mealId)?.tags ?? []);
    expect(assignedTags.some((tags) => tags.includes('egészséges'))).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/plan-algorithm.test.ts`
Expected: FAIL — the new test fails because `BALANCE_TAGS` only contains `'healthy'` and `'fast to make'`, so `'egészséges'` is never matched and no swap happens (the meal `healthyMeal` isn't guaranteed a slot).

- [ ] **Step 3: Replace `BALANCE_TAGS` with `BALANCE_TAG_GROUPS` and update matching logic**

In `src/lib/plan.ts`, replace line 39:

```ts
const BALANCE_TAGS = ['healthy', 'fast to make'];
```

with:

```ts
// Synonym groups for the weekly-plan tag-balance pass below. Each group is
// one balancing concern (e.g. "healthy") with equivalent tag names across
// every supported locale (see src/i18n/config.ts SUPPORTED_LOCALES) — a
// household's meal just needs to carry ANY one of these exact tag names.
// Add a new entry to each group (not a new group) when SUPPORTED_LOCALES
// grows.
const BALANCE_TAG_GROUPS: string[][] = [
  ['healthy', 'egészséges'],
  ['fast to make', 'gyors'],
];
```

Then replace the tag-balance loop at lines 92-110 (currently `for (const requiredTag of BALANCE_TAGS) { ... }`):

```ts
  // Second pass: tag balance. Swap in a tagged candidate for the first day
  // that holds a *repeated* meal, preferring not to disturb days whose meal
  // is uniquely assigned that week.
  const usedSwapIndices = new Set<number>();
  for (const tagGroup of BALANCE_TAG_GROUPS) {
    const alreadyPresent = assignedMealIds.some((id) =>
      meals.find((m) => m.id === id)?.tags.some((tag) => tagGroup.includes(tag)),
    );
    if (alreadyPresent) continue;

    const candidate = ranked.find((m) => m.tags.some((tag) => tagGroup.includes(tag)));
    if (!candidate) continue; // household has no meal with any tag in this group

    const duplicateIndex = assignedMealIds.findIndex(
      (id, idx) => assignedMealIds.indexOf(id) !== idx && !usedSwapIndices.has(idx),
    );
    const fallbackIndex = assignedMealIds.findIndex((_, idx) => !usedSwapIndices.has(idx));
    const swapIndex = duplicateIndex !== -1 ? duplicateIndex : fallbackIndex !== -1 ? fallbackIndex : 0;
    assignedMealIds[swapIndex] = candidate.id;
    usedSwapIndices.add(swapIndex);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- tests/unit/plan-algorithm.test.ts`
Expected: PASS — all tests in the file pass, including the new one and the two pre-existing `'healthy'` / `'fast to make'` tests (they still pass because those strings remain members of their groups).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts tests/unit/plan-algorithm.test.ts
git commit -m "feat: match tag-balance groups across en/hu synonyms"
```

---

### Task 2: Stop seeding default tags on household creation

**Files:**
- Modify: `src/lib/household.ts:1-29`
- Test: `tests/integration/household.test.ts`

- [ ] **Step 1: Update the failing integration test first**

Replace the test in `tests/integration/household.test.ts` (currently lines 21-35, the `describe('createHouseholdWithOwner', ...)` block) with:

```ts
describe('createHouseholdWithOwner', () => {
  it('creates a household with zero tags and assigns the owner', async () => {
    const owner = await prisma.user.create({
      data: { email: 'owner@household-test.example.com', name: 'Owner' },
    });

    const household = await createHouseholdWithOwner('Test Household A', owner.id);

    const tags = await prisma.tag.findMany({ where: { householdId: household.id } });
    expect(tags).toHaveLength(0);

    const updatedOwner = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(updatedOwner?.householdId).toBe(household.id);
  });
});
```

Also update the import at line 4 to drop `DEFAULT_TAGS`:

```ts
import { createHouseholdWithOwner, joinHouseholdByInviteCode } from '@/lib/household';
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npm run test:integration -- tests/integration/household.test.ts`
Expected: FAIL — `tags` has length 5 (the still-present `DEFAULT_TAGS` seeding), not 0.

(This step requires Docker/Postgres to be running per the project's `test:integration` setup — if unavailable in your environment, read `src/lib/household.ts:20-29` and confirm by inspection that the nested `tags: { create: ... }` write is still present before proceeding to Step 3.)

- [ ] **Step 3: Remove `DEFAULT_TAGS` and the nested tag-create from `createHouseholdWithOwner`**

In `src/lib/household.ts`, delete lines 4-10 (the `DEFAULT_TAGS` export):

```ts
export const DEFAULT_TAGS = [
  'child favourite',
  'absolute favourite',
  'parent favourite',
  'healthy',
  'fast to make',
];

```

Change `createHouseholdWithOwner` (lines 20-29) from:

```ts
export async function createHouseholdWithOwner(name: string, ownerUserId: string) {
  return prisma.household.create({
    data: {
      name,
      inviteCode: generateInviteCode(),
      tags: { create: DEFAULT_TAGS.map((tagName) => ({ name: tagName })) },
      users: { connect: { id: ownerUserId } },
    },
  });
}
```

to:

```ts
export async function createHouseholdWithOwner(name: string, ownerUserId: string) {
  return prisma.household.create({
    data: {
      name,
      inviteCode: generateInviteCode(),
      users: { connect: { id: ownerUserId } },
    },
  });
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npm run test:integration -- tests/integration/household.test.ts`
Expected: PASS — all 3 tests in the file pass (`creates a household with zero tags...`, `adds a user to an existing household`, `returns null for an invalid invite code`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/household.ts tests/integration/household.test.ts
git commit -m "feat: stop seeding default tags on household creation"
```

---

### Task 3: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: no errors (in particular, no unused-import warning for `DEFAULT_TAGS` anywhere — Task 1/2 already removed its only two references).

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS — all suites pass, including `tests/unit/plan-algorithm.test.ts`.

- [ ] **Step 3: Run the full integration suite**

Run: `npm run test:integration`
Expected: PASS — all suites pass, including `tests/integration/household.test.ts` and `tests/integration/meal.test.ts` (meal.test.ts creates its own tags explicitly via `createTag`, so it's unaffected by removing default seeding).

- [ ] **Step 4: Run e2e**

Run: `npm run test:e2e`
Expected: PASS. The e2e happy-path spec (`tests/e2e/happy-path.spec.ts`) creates a household, adds meals, and generates a week — it never asserts on default tags existing, so it's unaffected. Confirm "Generate week" still succeeds with a fresh household that now has zero tags (no default-tag dependency in that flow).

- [ ] **Step 5: Commit (only if any fixes were needed in prior steps)**

If Steps 1-4 all passed with no changes required, skip this step — Tasks 1 and 2 already committed the real changes. If any lint/test fix was needed, commit it now:

```bash
git add -A
git commit -m "fix: address lint/test fallout from default tag seeding removal"
```
