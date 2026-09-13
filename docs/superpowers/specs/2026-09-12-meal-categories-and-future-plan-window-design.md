# Meal Categories & Future-Only Plan Window — Design

## Overview

Post-launch feedback from first real usage identified three related gaps in
the weekly plan feature:

1. `/plan` and "Generate week" operate on the calendar week (Monday–Sunday)
   even when today is mid-week, so generation overwrites/targets days that
   already passed.
2. Only one meal slot exists per day, but households typically eat a soup
   plus a main course.
3. `Meal` has no notion of course/category, so there's no way to distinguish
   a soup from a main course for planning purposes.

This design introduces a fixed `MealCategory` (`soup`, `main`) on `Meal`,
splits `PlanEntry` into one row per `(day, category)` so each course is
tracked and overridden independently, and restricts the visible/generated
plan window to today through the end of the current week.

## Scope

- `MealCategory` enum: `soup`, `main`. Every meal has exactly one category
  (required field on the meal form).
- `PlanEntry` gains a `category` column; uniqueness becomes
  `(householdId, date, category)` — one row per slot per day.
- `/plan` shows two rows per day: **Main** (mandatory, same behavior as
  today's single slot) and **Soup** (optional — can be left empty, cleared,
  or overridden independently of main).
- "Generate week" fills main using the existing algorithm unchanged
  (recency avoidance + tag balancing) and fills soup using the same recency
  -avoidance ranking, scoped to soup-category meals, tracked against soup's
  own cooked history. Soup does **not** participate in tag balancing.
- If a household has no soup-category meals, the soup slot is simply left
  empty for every day (no warning — this is a normal "we don't track soups
  yet" state, distinct from `notEnoughMeals`).
- Plan generation and the `/plan` view are restricted to `[today, end of
  current week]`. Days before today are never shown on `/plan` and are
  never touched by "Generate week" (they're already `cooked`/`skipped`
  history by the time `transitionPastPlannedEntries` runs anyway).
- History view shows soup and main as separate lines per day, each with
  independent status.

## Out of Scope

- Dessert or any other category (schema is designed so adding one later is
  an enum value + no structural change, per the ceiling below — not built
  now).
- Configurable/custom categories per household (fixed enum only).
- Tag balancing for the soup slot.
- Rolling 7-day window (window is "rest of current Mon–Sun week", not
  "next 7 calendar days") — keeps history's week-grouping logic untouched.

## Data Model Changes

```prisma
enum MealCategory {
  soup
  main
}

model Meal {
  ...
  category MealCategory @default(main)
}

model PlanEntry {
  ...
  category MealCategory   // no default; every write must specify it

  @@unique([householdId, date, category])   // replaces @@unique([householdId, date])
}
```

**Migration**: existing `Meal` rows backfill to `category = main` (all
pre-existing meals were used for the single, main-course slot). Existing
`PlanEntry` rows backfill to `category = main` for the same reason — they
represent history/plans made when only one (main-course) slot existed.

## Weekly Plan Generation

`generateWeeklyPlan` (the pure, unit-tested function in `src/lib/plan.ts`)
is unchanged in shape; `generateAndSaveWeeklyPlan` calls it twice:

1. Once with `meals` filtered to `category = main` and `cookedHistory`
   filtered to main-category cooked entries — identical behavior to today,
   including tag balancing.
2. Once with `meals` filtered to `category = soup` and `cookedHistory`
   filtered to soup-category cooked entries — same recency-avoidance
   ranking, tag balancing skipped (soup is exempt from `BALANCE_TAGS`).

Both passes are restricted to `weekDateKeys` filtered to
`dateKey >= todayKey` before being run — a day that's already in the past
is never a generation target for either category.

If the soup pass has zero candidate meals, `generateWeeklyPlan` already
returns `mealId: null` for every day with `notEnoughMeals: false` (existing
behavior for an empty `meals` array) — this is exactly the "household
hasn't added soups yet" state and needs no special-casing.

`generateAndSaveWeeklyPlan` writes both passes' assignments, still skipping
any row whose status is already `cooked` (immutable history), independently
per category — a main can be `cooked` for a day while its soup sibling row
is still `planned`, and vice versa.

## Plan Window

`getWeekDateKeys(reference)` is unchanged (still used by history's
week-grouping and to compute the Monday..Sunday boundaries of the current
week). A new filter is applied at the call sites in `src/app/plan/page.tsx`
and `src/app/plan/actions.ts`:

```ts
const week = getWeekDateKeys(new Date()).filter((k) => k >= toDateKey(new Date()));
```

`/plan` renders only these days; "Generate week" only targets these days.
On a Monday this is all 7 days (unchanged from today); by Sunday it's just
Sunday.

## UI Changes

**`plan-view.tsx`**: each day card renders two rows instead of one:

- **Main** — `Select`, no "none" option (mirrors today's mandatory
  behavior), status badge when cooked/skipped.
- **Soup** — `Select` with an added "None" option that clears the slot
  (`mealId: null`), status badge when cooked/skipped independently of main.

**`meal-form.tsx`**: adds a required category `Select` (Soup / Main).

**`meal-list.tsx`**: shows category as a badge alongside tags; category
becomes a second filter dimension alongside the existing tag filter (simple
`?category=` query param, same pattern as the existing tag filter — no new
UI paradigm).

**History**: each day's entries render as separate main/soup lines with
independent status badges, using the existing per-entry rendering — no new
grouping logic needed since `listCookedHistory` already returns
`PlanEntry` rows and now each row already carries its own `category`.

## Testing Strategy

- **Unit** (`plan-algorithm.test.ts`): verify soup pass ranks independently
  of main pass (separate cooked-history inputs produce independent
  rankings); verify empty soup-meals input returns all-null soup
  assignments without `notEnoughMeals`; verify soup is exempt from tag
  balancing.
- **Unit** (`plan-dates.test.ts`): verify the today-onward window filter
  against a fixed reference date for each weekday (Monday through Sunday).
- **Integration** (`plan.test.ts`): generate a week, confirm both a soup
  and a main `PlanEntry` row exist per remaining day with the correct
  `category`; confirm clearing a soup slot sets `mealId: null` without
  touching the main row for that day; confirm a `cooked` main row is
  preserved while its sibling soup row is still regenerable.
- **Integration** (`plan-history.test.ts`): confirm history returns
  independent main/soup rows with correct categories after both transition
  to `cooked`.
- **E2E**: extend the existing happy-path test to add one soup meal and one
  main meal, generate a week, and assert both slots render.

## Migration & Compatibility Notes

- The `PlanEntry` unique constraint change
  (`(householdId, date) → (householdId, date, category)`) is additive (a
  superset of rows becomes valid, not a narrowing) — no existing row
  violates the new constraint after the `category = main` backfill.
- `mealInputSchema` (Zod) gains a required `category` field
  (`z.enum(['soup', 'main'])`); existing meal create/update Server Actions
  and forms need this field, matching the "required select" UX for tags.
- `messages/en.json` and `messages/hu.json` need new keys for: category
  labels (Soup/Main), the soup "None" option, the meal form's category
  field label, and any new empty-state copy for "no soup meals yet" (if
  distinct copy is wanted — otherwise the day simply shows "No meal
  assigned" for the soup row, reusing existing `noMealAssigned`).

## Ceiling / Future Extension

Adding `dessert` (or any further category) later is: one enum value, one
more `generateWeeklyPlan` pass in `generateAndSaveWeeklyPlan`, one more row
in the day card. No schema redesign — this is the payoff of the
`(day, category)` row shape over packing extra columns onto a single
`PlanEntry` row.
</content>
