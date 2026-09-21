# Meals List — Multi-Select Tag Filter — Design

## Overview

The Meals page (`/meals`) already supports multiple tags **per meal** — the
Add/Edit form (`src/app/meals/meal-form.tsx:38-47,101-125`) stores
`selectedTagIds: string[]` and toggles tags as `Badge` chips; the schema
(`MealTag` join table) and `mealInputSchema.tagIds: z.array(z.string())`
already back this. No change needed there.

The single-select gap is the **tag filter** at the top of the Meals list:
today it's a shadcn `Select` (`src/app/meals/meal-list.tsx:49-64`) bound to
one URL param (`?tag=<id>`), and `listMeals` (`src/lib/meal.ts:14-24`) only
ever filters by one `tagId`. This spec makes that filter multi-select.

## Scope

- Meals list tag filter becomes multi-select: clicking multiple tags shows
  meals matching **any** of them (OR semantics — a meal with just one of
  the selected tags still shows).
- Filter control is rebuilt as toggleable `Badge` chips (`variant="default"`
  selected / `variant="outline"` unselected), reusing the exact pattern
  already used in `meal-form.tsx` for tag selection. No new UI primitives —
  this repo has no Popover/Checkbox component installed yet
  (`src/components/ui/` only has `badge`, `button`, `card`, `dialog`,
  `input`, `label`, `select`), so this avoids adding
  `@radix-ui/react-popover` / a new shadcn Checkbox for one filter.
- Selected tags are encoded as repeated `?tag=<id>` query params (e.g.
  `?tag=abc&tag=xyz`) — consistent with the existing single-value param name,
  and Next.js's `searchParams` already parses repeated keys into an array.
- `listMeals` moves from a single optional `tagId?: string` to
  `tagIds?: string[]`, filtering with `tags: { some: { tagId: { in: tagIds } } }`.
- The category filter (`meal-list.tsx:65-77`) is untouched.

## Out of Scope

- The Add/Edit Meal form's tag picker — already multi-select, not touched.
- Any schema/migration change — the `MealTag` join table already supports
  N–N meal/tag relationships.
- AND semantics ("meal must have all selected tags") — explicitly rejected
  in favor of OR, per user decision.
- A separate "clear all" button — toggling each chip off is already one
  click each; add a clear-all control later if it turns out to be needed
  with many tags selected.
- Popover/checkbox-based filter UI — rejected in favor of reusing the
  existing Badge-toggle pattern, avoiding new dependencies.

## Changes

### `src/lib/meal.ts`

- `listMeals(householdId: string, tagIds?: string[], category?: 'soup' | 'main')`
  — replaces the `tagId?: string` param.
- Filter clause becomes:
  ```ts
  ...(tagIds && tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {})
  ```
  (OR semantics: `some` + `in` matches a meal that has at least one of the
  given tags.)

### `src/app/meals/page.tsx`

- `searchParams` type changes from `{ tag?: string; category?: string }` to
  `{ tag?: string | string[]; category?: string }` (Next.js gives a plain
  string when there's exactly one `?tag=`, and a `string[]` when there are
  multiple — never normalizes this itself).
- Normalize to a `string[]` right after destructuring, e.g.:
  ```ts
  const activeTagIds = searchParams.tag
    ? Array.isArray(searchParams.tag) ? searchParams.tag : [searchParams.tag]
    : [];
  ```
- Pass `activeTagIds` to `listMeals(householdId, activeTagIds, category)` and
  to `<MealList activeTagIds={activeTagIds} ... />` (renamed prop, was
  `activeTag`).

### `src/app/meals/meal-list.tsx`

- Prop rename: `activeTag?: string` → `activeTagIds: string[]`.
- `buildUrl` takes `nextTagIds: string[]` instead of `nextTag?: string`,
  and appends one `tag` param per id:
  ```ts
  function buildUrl(nextTagIds: string[], nextCategory?: string) {
    const params = new URLSearchParams();
    nextTagIds.forEach((id) => params.append('tag', id));
    if (nextCategory) params.set('category', nextCategory);
    const query = params.toString();
    return query ? `/meals?${query}` : '/meals';
  }
  ```
- Replace the tag `<Select>` (lines 49–64) with a chip row:
  ```tsx
  <div className="flex flex-wrap gap-2">
    {allTags.map((tag) => (
      <Badge
        key={tag.id}
        variant={activeTagIds.includes(tag.id) ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() =>
          router.push(
            buildUrl(
              activeTagIds.includes(tag.id)
                ? activeTagIds.filter((id) => id !== tag.id)
                : [...activeTagIds, tag.id],
              activeCategory,
            ),
          )
        }
      >
        {tag.name}
      </Badge>
    ))}
  </div>
  ```
- Category `<Select>`'s `onValueChange` call site updates to pass
  `activeTagIds` instead of `activeTag` (signature change only, same
  behavior).
- If `allTags` is empty, the chip row renders nothing — same as today's
  empty-tags handling in the form (no explicit empty-state needed).

### i18n (`messages/en.json`, `messages/hu.json`)

- Remove the now-unused `allTags` key (`"All tags"` / `"Minden címke"`) from
  the `Meals` block in both files — it was only used as the Select's
  "no filter" option, which no longer exists once selection is
  by chip toggle. Confirmed via grep it has no other call sites.
- No new keys needed — `tagsLabel` ("Tags"/"Címkék") already exists and
  is reused as a small heading above the filter chip row (the old Select
  had no visible label at all).

## Tests

### `tests/integration/meal.test.ts`

- Line 87: `listMeals(household.id, healthyTag!.id)` →
  `listMeals(household.id, [healthyTag!.id])`.
- Line 157: `listMeals(household.id, undefined, 'soup')` unchanged in shape
  (still `undefined` for the tags arg — signature accepts `tagIds?: string[]`).
- Add a new case: create two meals, each with one distinct tag (A, B), and a
  third meal with neither; assert `listMeals(household.id, [tagA.id, tagB.id])`
  returns exactly the two tagged meals (OR semantics) and excludes the
  untagged one.

### `tests/e2e`

- Confirmed (via grep) that no existing e2e spec interacts with the tag
  filter `<Select>` — no e2e changes required.

## Migration Notes

- No Prisma schema/migration change.
- No data migration — this is a pure query/UI change on existing data.
