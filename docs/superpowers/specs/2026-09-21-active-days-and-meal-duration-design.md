# Active Days & Multi-Day Meal Duration — Design

## Overview

Two related gaps in weekly plan generation:

1. There's no way to say "we don't need a menu on some days" — households
   that aren't home every evening still get a full 7-day plan generated and
   shown, with no way to skip a day short of manually clearing every slot.
2. Every meal is assumed to be eaten once, on one day. Many households
   actually cook a dish that covers 2+ days (e.g. a stew eaten Mon+Tue), but
   the generator has no notion of this and will pick a fresh meal every day.

This design adds:

- A recurring per-household "active weekdays" pattern (Settings), e.g.
  "we never need a menu on Fridays".
- A one-off per-date override for the current visible week (Plan page),
  e.g. "skip this specific Tuesday, we're traveling" — or the inverse,
  force a day back on even though the pattern says off.
- A per-meal `durationDays` field: how many consecutive *active* days one
  selection of that meal covers before the generator picks the next meal.

## Scope

- **Active weekdays pattern**: `Household.activeWeekdays`, an array of
  weekday indices (0=Monday..6=Sunday) that need a menu by default. Editable
  in Settings via 7 toggle chips. Must contain at least one day.
- **One-off day override**: a per-`(householdId, date)` boolean stored in a
  new `PlanDayOverride` table. `true` forces the day active even if the
  pattern says off; `false` forces it off even if the pattern says on.
  Settable only for dates currently visible on `/plan` (today through end of
  the current week — the same window "Generate week" already operates on).
- **Day-off is whole-day**: skipping a day skips both main and soup — there
  is no per-category skip. A skipped day has no `PlanEntry` rows at all.
- **Meal duration**: `Meal.durationDays` (default 1, minimum 1). When the
  generator picks a meal, it assigns that same meal to the next
  `durationDays - 1` *active* days as well (skipped days are not counted
  and do not consume any of the duration), before moving to the next ranked
  meal.
- **Manual overrides stay independent**: overriding one day's meal via the
  existing per-day `Select` does not cascade to adjacent days of a
  multi-day meal. Duration only drives generator suggestions, same as the
  existing 3-week repeat-avoidance being advisory, not enforced.

## Out of Scope

- Per-category (main vs. soup) day skipping — whole day only.
- Skip-day overrides for weeks beyond the currently visible window (matches
  existing `/plan` scope restriction).
- Any UI indicator of "day 1/2 of this meal" — the day cards already show
  the same meal name across consecutive days, which is sufficient signal.
- Enforcing/locking duration on manual overrides (e.g. preventing you from
  changing day 2 of a multi-day meal independently) — manual edits remain
  fully free-form as they are today.
- Carrying partial duration across week boundaries (if a 3-day meal starts
  on the last active day of the week, it doesn't reserve days into next
  week — next week's generation just sees it was recently cooked and
  applies the normal repeat-avoidance).

## Data Model Changes

```prisma
model Household {
  ...
  activeWeekdays Int[] @default([0, 1, 2, 3, 4, 5, 6]) // 0=Mon..6=Sun
}

model Meal {
  ...
  durationDays Int @default(1) // consecutive active days one pick covers
}

model PlanDayOverride {
  id          String    @id @default(cuid())
  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  date        DateTime  @db.Date
  active      Boolean   // true = force on, false = force off

  @@unique([householdId, date])
}
```

**Migration**: additive only — existing households backfill to all 7 days
active, existing meals backfill to `durationDays = 1`, matching current
behavior exactly. No existing row needs a data migration beyond the column
defaults.

## Weekly Plan Generation

### Resolving active days

New function in `src/lib/plan.ts`:

```ts
async function resolveActiveDateKeys(householdId: string, weekDateKeys: string[]): Promise<string[]>
```

For each `dateKey` in `weekDateKeys`: look up a `PlanDayOverride` row for
that exact date; if present, use its `active` value; otherwise fall back to
`household.activeWeekdays.includes(weekdayIndexOf(dateKey))`. Returns the
filtered subset of `weekDateKeys` that need a menu.

This runs once per call site (`generateAndSaveWeeklyPlan`, `getOrCreateWeekPlan`,
`/plan` page render) — all three need to agree on which days are active, so
this is the single source of truth for that resolution, keeping the
household-scoping pattern already used everywhere else in `plan.ts`.

### `generateWeeklyPlan` (pure function, unchanged signature)

`weekDateKeys` now always means "the active date keys for this week" —
callers filter before invoking it, so the pure function's inputs/outputs
and existing unit tests around ranking/repeat-avoidance need no change
there.

New behavior inside the assignment loop: track `PlanMeal.durationDays`
(add `durationDays: number` to the `PlanMeal` type). Walk `weekDateKeys` by
index; when a meal is newly picked at index `i`, assign it to indices
`i .. i + durationDays - 1` (clamped to the array), then advance past them.
`notEnoughMeals` is computed from the same simulation: count how many
*distinct* meal picks were needed; if that count exceeds the number of
distinct available meals, it's true. (Previously this was
`meals.length < weekDateKeys.length`; with duration, a shorter list of
picks can still cover more days, so the picks-needed count must be derived
from the same walk rather than a static formula.)

### `getOrCreateWeekPlan`

Only creates `PlanEntry` rows (main + soup) for active date keys — inactive
days get no rows at all, so they simply don't appear in the query result
used to render `/plan`.

### `generateAndSaveWeeklyPlan`

Resolves active date keys first, passes them (instead of the raw week) into
both the main and soup `generateWeeklyPlan` calls, and into
`getOrCreateWeekPlan`. Everything downstream (skip already-`cooked` rows,
per-category independence) is unchanged.

### Day override mutation

```ts
async function setPlanDayOverride(householdId: string, dateKey: string, active: boolean | null)
```

`active: null` deletes the override row (revert to pattern default).
Writing an override that flips a day from active→inactive does **not**
delete existing `PlanEntry` rows for that date (avoids destroying a
`cooked` row if this is ever called on a past-boundary date); it just stops
that date from being included in future `getOrCreateWeekPlan`/generation
calls. Since day overrides are only ever settable for the current window
before those days pass, in practice this only affects still-`planned` rows,
consistent with how `setPlanEntryMeal` already refuses to touch `cooked` rows.

### Active weekdays mutation

```ts
async function updateActiveWeekdays(householdId: string, weekdays: number[])
```

Validates: non-empty, all values in `0..6`, no duplicates (Zod schema,
mirroring `householdNameSchema`'s pattern in `src/lib/household.ts`).

## UI Changes

**`settings-view.tsx`**: new card "Active days" below the existing Tags
card. Seven toggle `Badge` chips (Mon..Sun, i18n day names — reuses the same
day-name message keys already defined under `Plan.*`), same
selected/unselected visual pattern as the tag-selection chips in
`meal-form.tsx`. Saves immediately on toggle via
`updateActiveWeekdaysAction`, client-side guard preventing deselecting the
last active day.

**`plan/page.tsx` / `plan-view.tsx`**: each day now carries a resolved
`active: boolean` flag (from `resolveActiveDateKeys`). Inactive days render
as a collapsed card: day name + "No menu (day off)" + a button to force it
back on. Active days render exactly as today, plus a small "Skip this day"
button in the card header that calls the new day-override action.
Toggling either direction calls the same `toggleDayOverrideAction` and
refreshes.

**`meal-form.tsx`**: new numeric input "Lasts how many days" next to the
category `Select`, default 1, `min={1}`. No enforced max in the schema (UI
`max` attribute of 5 as a soft guard is enough — no real household plans a
meal for 2+ weeks straight).

**`meal-list.tsx`**: no change required — duration isn't a filterable/browsable
attribute, just an editable field.

## Server Actions

- `src/app/settings/actions.ts`: `updateActiveWeekdaysAction(weekdays: number[])`
- `src/app/plan/actions.ts`: `toggleDayOverrideAction(dateKey: string, active: boolean | null)`
- `src/app/meals/actions.ts`: existing `createMealAction`/`updateMealAction`
  read `durationDays` from `FormData` via an extended `mealInputSchema` in
  `src/lib/meal.ts` (`z.coerce.number().int().min(1).default(1)`).

## Testing Strategy

- **Unit** (`plan-algorithm.test.ts`): a meal with `durationDays: 2` fills
  two consecutive slots before rotating; `notEnoughMeals` correctly reflects
  picks-needed-vs-available under duration; pre-filtered (non-contiguous)
  `weekDateKeys` — simulating skipped days removed by the caller — assigns
  correctly without treating gaps as part of any meal's duration.
- **Unit** (new `plan-dates.test.ts` cases or a new
  `resolveActiveDateKeys`-adjacent pure helper if the override-merge logic
  is extracted): pattern-only, override-forces-off, override-forces-on,
  override-clears-back-to-pattern.
- **Integration** (`plan.test.ts`): updating `activeWeekdays` changes which
  days get `PlanEntry` rows on next `getOrCreateWeekPlan`/generate; a
  one-off override excludes a specific date even though the pattern says
  active; a meal with `durationDays: 2` appears on two consecutive
  `PlanEntry` rows after generation.
- **E2E**: extend the happy-path test to toggle one day off in Settings,
  generate a week, and assert that day doesn't render a meal select.

## Migration & Compatibility Notes

- All three new columns/tables are additive with safe defaults
  (`activeWeekdays` = all days, `durationDays` = 1) — existing households
  and meals behave identically until someone opts in.
- `messages/en.json` / `messages/hu.json` need new keys: Settings active-days
  card title + day-off explanatory hint, Plan page "day off" label +
  skip/restore button labels, meal form duration field label.

## Ceiling / Future Extension

- `activeWeekdays` as a flat `Int[]` (rather than a join table) is fine
  because it's a single small set edited as a whole, never queried
  per-row — if per-user (not per-household) schedules are ever needed,
  that's a bigger redesign (schedules aren't household-wide anymore), not
  an incremental change to this column.
- `PlanDayOverride` only stores a boolean, not a reason/note — if
  households want to leave a reason ("traveling"), that's an additive
  nullable column later, not a schema change.
