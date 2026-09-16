# Remove Default Tag Seeding — Design

## Overview

Tags are already fully household-scoped: `Tag.householdId` is a required FK,
`@@unique([householdId, name])` enforces per-household uniqueness, and every
query in `src/lib/meal.ts` (`listTags`, `createTag`, `renameTag`, `deleteTag`,
tag attachment on meals) filters or verifies ownership by `householdId`. No
cross-household tag leakage exists today (confirmed by reading every
`prisma.tag.*` call site and the existing integration tests, which assert
isolation).

The actual gap: every new household is auto-seeded with 5 hardcoded
**English** tag names (`DEFAULT_TAGS` in `src/lib/household.ts`) —
`child favourite`, `absolute favourite`, `parent favourite`, `healthy`,
`fast to make`. A household that operates in Hungarian gets English tags it
never chose and didn't ask for. Households should define their own tags from
a blank slate.

## Scope

- `createHouseholdWithOwner` no longer creates any `Tag` rows. New
  households start with zero tags; the tag-management UI already handles an
  empty tag list correctly (it's just a map over `allTags`, with an
  always-present "add tag" input) — no UI change needed.
- `DEFAULT_TAGS` is deleted (no remaining callers once seeding is removed).
- The weekly-plan tag-balancing algorithm (`src/lib/plan.ts`) currently
  tries to guarantee a `healthy`- and `fast to make`-tagged meal appear each
  week, matching by exact English string. Since no tags are seeded, a
  household must name a tag exactly `healthy` or `fast to make` (English)
  for balancing to engage today — that's an accident of the old seed data,
  not an intentional design choice. Replace the flat `BALANCE_TAGS` array
  with synonym groups covering both supported locales (`en`, `hu`), so a
  household using either language's word gets the same balancing behavior:

  ```ts
  const BALANCE_TAG_GROUPS: string[][] = [
    ['healthy', 'egészséges'],
    ['fast to make', 'gyors'],
  ];
  ```

  Matching stays a case-sensitive exact string match (same as today) against
  any member of the relevant group — no fuzzy matching, no per-household
  locale lookup (a household isn't restricted to only the words matching its
  own locale; either language's synonym engages balancing).

## Out of Scope

- Any change to the `Tag` schema, Prisma queries, or ownership checks — all
  already correctly household-scoped; this spec does not touch that code
  path.
- Reworking the tag-balancing algorithm's mechanics (swap logic, ranking,
  fallback behavior) — only the tag-name matching source changes.
- Removing or restructuring the tag-balancing feature.
- Any "no tags yet" empty-state UI — already handled by existing components.
- Adding synonym groups for locales beyond the two currently supported
  (`en`, `hu`) — add a group entry if `SUPPORTED_LOCALES` grows.

## Changes

### `src/lib/household.ts`

- Remove the `DEFAULT_TAGS` export.
- `createHouseholdWithOwner` drops the `tags: { create: ... }` nested write
  — the `household.create` call becomes just `name`, `inviteCode`, `users`.

### `src/lib/plan.ts`

- Replace `const BALANCE_TAGS = ['healthy', 'fast to make'];` with
  `BALANCE_TAG_GROUPS` (shown above).
- In the tag-balance pass inside `generateWeeklyPlan`, iterate
  `BALANCE_TAG_GROUPS` instead of `BALANCE_TAGS`; change the two
  `.includes(requiredTag)` checks to check membership across the current
  group (`group.some((t) => meal.tags.includes(t))` style) instead of a
  single tag name.

## Tests

- `tests/integration/household.test.ts`: update
  `'seeds 5 default tags and assigns the owner'` to assert **zero** `Tag`
  rows exist after `createHouseholdWithOwner` (rename the test
  accordingly); drop the `DEFAULT_TAGS` import.
- `tests/unit/plan-algorithm.test.ts`: no changes required — it builds
  `PlanMeal` fixtures with literal tag names `'healthy'` / `'fast to make'`,
  which remain valid members of the new groups, so existing assertions
  still hold. Optionally (not required) add one case using the Hungarian
  synonym (`'egészséges'` / `'gyors'`) to lock in the new behavior.

## Migration Notes

- No schema/migration change — `Tag` rows are just no longer created at
  household-creation time. Existing households keep whatever tags they
  already have (including any previously-seeded `DEFAULT_TAGS` rows, which
  are ordinary user-owned tags now and can be renamed/deleted like any
  other).
