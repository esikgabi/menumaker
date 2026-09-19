# Meals List — Category Chip Filter (match Tags) — Design

## Overview

The previous spec (`2026-09-18-meals-multi-tag-filter-design.md`) turned the
**tag filter** on the Meals page (`/meals`) into a multi-select row of
toggleable `Badge` chips. That left the two filters visually inconsistent:
Tags are chips, but the **category filter** is still a shadcn `Select`
dropdown (`src/app/meals/meal-list.tsx:74-86`, values All / Main / Soup).

This spec makes the category filter use the *same* chip control as Tags, so
both look and behave identically. To guarantee the consistency is structural
(not just visual), the "label + chip row" is extracted into one small shared
component that both filters render through.

## Scope

- The category filter becomes a multi-select row of toggleable `Badge` chips
  (**Main**, **Soup**), with OR semantics: a meal shows if its category is
  any of the selected. No chips selected = show all (same as Tags). Selecting
  both = all.
- The explicit "All categories" option is dropped — "no selection" already
  means all, exactly like the tag filter.
- A small `ChipFilter` component (label + wrapping row of toggle Badges) is
  extracted in `meal-list.tsx` and used by **both** the Tags and Category
  filters.
- `listMeals` moves from a single optional `category?: 'soup' | 'main'` to
  `categories?: ('soup' | 'main')[]`, filtering with
  `category: { in: categories }` (mirrors the existing `tagIds` pattern).
- Selected categories are encoded as repeated `?category=<value>` query
  params (e.g. `?category=main&category=soup`) — consistent with the
  repeated `?tag=` params, and Next.js already parses repeated keys into an
  array.

## Out of Scope

- The Add/Edit Meal form's category picker — it stays a single-select
  (a meal has exactly one category); only the *list filter* changes.
- Any schema/migration change — `Meal.category` stays a single
  `soup | main` enum value.
- Adding new category values — the chip list is driven by the two existing
  enum values; a future third category is one more chip + one more enum
  value, not a structural change.
- AND semantics for categories — rejected in favor of OR, matching Tags.

## Changes

### `src/app/meals/meal-list.tsx`

- Extract a `ChipFilter` component (module-local, not exported):
  ```tsx
  function ChipFilter({
    label,
    options,
    activeIds,
    onToggle,
  }: {
    label: string;
    options: { id: string; name: string }[];
    activeIds: string[];
    onToggle: (id: string) => void;
  }) {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Badge
              key={opt.id}
              variant={activeIds.includes(opt.id) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggle(opt.id)}
            >
              {opt.name}
            </Badge>
          ))}
        </div>
      </div>
    );
  }
  ```
- Prop change: `activeCategory?: string` → `activeCategories: string[]`.
- `buildUrl` takes `nextCategories: string[]` and appends one `category`
  param per value (mirrors the `tag` loop):
  ```ts
  function buildUrl(nextTagIds: string[], nextCategories: string[]) {
    const params = new URLSearchParams();
    nextTagIds.forEach((id) => params.append('tag', id));
    nextCategories.forEach((c) => params.append('category', c));
    const query = params.toString();
    return query ? `/meals?${query}` : '/meals';
  }
  ```
- Replace the tag chip block (lines 50–73) with
  `<ChipFilter label={t('tagsLabel')} options={allTags} activeIds={activeTagIds} onToggle={...} />`
  where `onToggle` recomputes the tag array and calls
  `router.push(buildUrl(nextTagIds, activeCategories))`.
- Replace the category `<Select>` (lines 74–86) with
  `<ChipFilter label={t('categoryLabel')} options={categoryOptions} activeIds={activeCategories} onToggle={...} />`
  where `categoryOptions` is the two enum values mapped to
  `{ id: 'main', name: t('categoryMain') }, { id: 'soup', name: t('categorySoup') }`
  and `onToggle` recomputes the category array and calls
  `router.push(buildUrl(activeTagIds, nextCategories))`.
- Remove the now-unused `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/
  `SelectValue` imports.
- Layout: the left container stacks the two `ChipFilter` groups vertically
  (Tags, then Category); the **Add meal** button stays on the right,
  top-aligned (`sm:items-start` on the outer row). Mobile stacks as today.

### `src/app/meals/page.tsx`

- `searchParams` type: `category?: string` → `category?: string | string[]`.
- Normalize to a `('soup' | 'main')[]` of valid values (mirrors the
  `activeTagIds` normalization; a type predicate keeps the union so it matches
  the `listMeals` param type):
  ```ts
  const rawCategories = searchParams.category
    ? Array.isArray(searchParams.category) ? searchParams.category : [searchParams.category]
    : [];
  const activeCategories = rawCategories.filter((c): c is 'soup' | 'main' => c === 'soup' || c === 'main');
  ```
- Pass `activeCategories` to
  `listMeals(householdId, activeTagIds, activeCategories)` and to
  `<MealList activeCategories={activeCategories} ... />` (renamed prop, was
  `activeCategory`).

### `src/lib/meal.ts`

- `listMeals(householdId: string, tagIds?: string[], categories?: ('soup' | 'main')[])`
  — replaces the `category?: 'soup' | 'main'` param.
- Filter clause becomes:
  ```ts
  ...(categories && categories.length > 0 ? { category: { in: categories } } : {})
  ```
  (OR semantics: `in` matches a meal whose category is any of the given
  values.)

### i18n (`messages/en.json`, `messages/hu.json`)

- Remove the now-unused `allCategories` key (`"All categories"` /
  `"Minden kategória"`) from the `Meals` block in both files — it was only
  the Select's "no filter" option, which no longer exists.
- No new keys needed — `categoryLabel` ("Category"/"Kategória") already
  exists and is reused as the heading above the category chip row.

## Tests

### `tests/integration/meal.test.ts`

- Line 173: `listMeals(household.id, undefined, 'soup')` →
  `listMeals(household.id, undefined, ['soup'])` (array form).
- Add a new case: create one `main` meal and one `soup` meal; assert
  `listMeals(household.id, undefined, ['main', 'soup'])` returns **both**
  (OR semantics) and `listMeals(household.id, undefined, ['main'])` returns
  only the main meal.

### `tests/e2e`

- No existing e2e spec interacts with the category `<Select>` (confirmed via
  grep) — no e2e changes required.

## Migration Notes

- No Prisma schema/migration change.
- No data migration — pure query/UI change on existing data.
- URL shape changes from a single `?category=main` to repeated
  `?category=main&category=soup`; old single-value links still parse (a lone
  `?category=main` normalizes to `['main']`), so no bookmark breakage.