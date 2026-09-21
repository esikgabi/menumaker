# Meals Category Chip Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Meals page category filter use the same multi-select `Badge` chip control as the tag filter, so both look and behave identically.

**Architecture:** Extract one small module-local `ChipFilter` component (label + wrapping row of toggle Badges) in `meal-list.tsx` and render both the Tags and Category filters through it. The category filter becomes multi-select with OR semantics (no selection = all; the explicit "All" option is dropped). `listMeals` moves from a single `category?` to `categories?` array (`{ in: ... }`), mirroring the existing `tagIds` pattern; selected categories are encoded as repeated `?category=` query params.

**Tech Stack:** Next.js 14 (App Router, Server Actions), React 18, TypeScript (strict), Prisma 6, shadcn/ui (`badge`, `label`), next-intl, Vitest (integration), Playwright (manual verify).

**Spec:** `docs/superpowers/specs/2026-09-19-meals-category-chip-filter-design.md`

---

### Task 1: Multi-category chip filter (data + UI)

**Files:**
- Modify: `src/lib/meal.ts:14-24` (`listMeals` signature + filter)
- Modify: `src/app/meals/page.tsx` (searchParams type, normalization, pass-through)
- Modify: `src/app/meals/meal-list.tsx` (ChipFilter, prop, buildUrl, replace Select, layout)
- Modify: `messages/en.json`, `messages/hu.json` (remove `allCategories`)
- Test: `tests/integration/meal.test.ts:167-177`

- [ ] **Step 1: Update the integration test to the array form + OR semantics**

In `tests/integration/meal.test.ts`, replace the existing `filters meals by category` test (lines 167-177) with:

```ts
  it('filters meals by category', async () => {
    const household = await makeHousehold('Q');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    await createMeal(household.id, owner.id, { name: 'Soup Meal', note: '', tagIds: [], category: 'soup' });
    await createMeal(household.id, owner.id, { name: 'Main Meal', note: '', tagIds: [], category: 'main' });

    const soupMeals = await listMeals(household.id, undefined, ['soup']);
    expect(soupMeals).toHaveLength(1);
    expect(soupMeals[0].name).toBe('Soup Meal');

    // OR semantics: selecting both categories returns both meals
    const both = await listMeals(household.id, undefined, ['main', 'soup']);
    expect(both).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL — `listMeals` still types its third param as a single `'soup' | 'main'`, so passing `['soup']` / `['main','soup']` is a type error (and the OR assertion would not hold).

- [ ] **Step 3: Update `listMeals` to accept a category array**

In `src/lib/meal.ts`, change the `listMeals` signature and filter (lines 14-24) to:

```ts
export async function listMeals(householdId: string, tagIds?: string[], categories?: ('soup' | 'main')[]) {
  return prisma.meal.findMany({
    where: {
      householdId,
      ...(tagIds && tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
      ...(categories && categories.length > 0 ? { category: { in: categories } } : {}),
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { name: 'asc' },
  });
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npm run test:integration`
Expected: PASS (the `filters meals by category` test now passes, including the OR assertion).

- [ ] **Step 5: Update `page.tsx` (type, normalization, pass-through)**

Replace the whole `src/app/meals/page.tsx` with:

```tsx
import { requireHousehold } from '@/lib/session';
import { listMeals, listTags } from '@/lib/meal';
import { getTranslations } from 'next-intl/server';
import { MealList } from './meal-list';

export default async function MealsPage({
  searchParams,
}: {
  searchParams: { tag?: string | string[]; category?: string | string[] };
}) {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Meals');

  const activeTagIds = searchParams.tag
    ? Array.isArray(searchParams.tag)
      ? searchParams.tag
      : [searchParams.tag]
    : [];

  const rawCategories = searchParams.category
    ? Array.isArray(searchParams.category)
      ? searchParams.category
      : [searchParams.category]
    : [];
  const activeCategories = rawCategories.filter((c): c is 'soup' | 'main' => c === 'soup' || c === 'main');

  const [meals, tags] = await Promise.all([
    listMeals(householdId, activeTagIds, activeCategories),
    listTags(householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <MealList
        meals={meals.map((m) => ({
          id: m.id,
          name: m.name,
          note: m.note,
          category: m.category,
          tags: m.tags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name })),
        }))}
        allTags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeTagIds={activeTagIds}
        activeCategories={activeCategories}
      />
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `meal-list.tsx` (ChipFilter + category chips)**

Replace the whole `src/app/meals/meal-list.tsx` with:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { deleteMealAction } from './actions';
import { MealForm } from './meal-form';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; tags: Tag[] };

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

export function MealList({
  meals,
  allTags,
  activeTagIds,
  activeCategories,
}: {
  meals: Meal[];
  allTags: Tag[];
  activeTagIds: string[];
  activeCategories: string[];
}) {
  const t = useTranslations('Meals');
  const router = useRouter();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const categoryOptions = [
    { id: 'main', name: t('categoryMain') },
    { id: 'soup', name: t('categorySoup') },
  ];

  function buildUrl(nextTagIds: string[], nextCategories: string[]) {
    const params = new URLSearchParams();
    nextTagIds.forEach((id) => params.append('tag', id));
    nextCategories.forEach((c) => params.append('category', c));
    const query = params.toString();
    return query ? `/meals?${query}` : '/meals';
  }

  function toggleTag(id: string) {
    const next = activeTagIds.includes(id) ? activeTagIds.filter((x) => x !== id) : [...activeTagIds, id];
    router.push(buildUrl(next, activeCategories));
  }

  function toggleCategory(id: string) {
    const next = activeCategories.includes(id)
      ? activeCategories.filter((x) => x !== id)
      : [...activeCategories, id];
    router.push(buildUrl(activeTagIds, next));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <ChipFilter label={t('tagsLabel')} options={allTags} activeIds={activeTagIds} onToggle={toggleTag} />
          <ChipFilter
            label={t('categoryLabel')}
            options={categoryOptions}
            activeIds={activeCategories}
            onToggle={toggleCategory}
          />
        </div>
        <Button onClick={() => setIsAdding(true)} className="w-full sm:w-auto">
          {t('addMeal')}
        </Button>
      </div>

      {meals.length === 0 && <p className="text-sm text-muted-foreground">{t('noMeals')}</p>}

      <ul className="flex flex-col gap-2">
        {meals.map((meal) => (
          <li key={meal.id} className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{meal.name}</p>
              {meal.note && <p className="text-sm text-muted-foreground">{meal.note}</p>}
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="default">{meal.category === 'soup' ? t('categorySoup') : t('categoryMain')}</Badge>
                {meal.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMeal(meal)}>
                {t('editMeal')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await deleteMealAction(meal.id);
                  router.refresh();
                }}
              >
                {t('delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {isAdding && (
        <MealForm
          allTags={allTags}
          onClose={() => {
            setIsAdding(false);
            router.refresh();
          }}
        />
      )}

      {editingMeal && (
        <MealForm
          meal={editingMeal}
          allTags={allTags}
          onClose={() => {
            setEditingMeal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

Note: the `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` imports are gone (the category dropdown is replaced by `ChipFilter`). The meal-list rendering and the two `MealForm` blocks are unchanged from the current file.

- [ ] **Step 7: Remove the now-unused `allCategories` i18n key**

In `messages/en.json`, delete the line `"allCategories": "All categories",` from the `Meals` block (and fix the trailing comma on the preceding line if it becomes the last key).
In `messages/hu.json`, delete the line `"allCategories": "Minden kategória",` from the `Meals` block (same comma fix).

- [ ] **Step 8: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass with no errors (confirms the `Select` import removal, the `activeCategories` prop rename, and the i18n key removal are all consistent).

- [ ] **Step 9: Commit**

```bash
git add src/lib/meal.ts src/app/meals/page.tsx src/app/meals/meal-list.tsx messages/en.json messages/hu.json tests/integration/meal.test.ts
git commit -m "Make meals category filter a multi-select chip row matching tags"
```

---

### Task 2: Full verification

- [ ] **Step 1: Run the full check suite**

Run: `npm run lint && npx tsc --noEmit && npm run test:unit && npm run test:integration`
Expected: all pass (unit 35, integration 42+1 new assertion, lint clean, tsc clean).

- [ ] **Step 2: Manual Playwright verification**

Start the dev server (`npm run dev`), sign in via the "Dev login (local only)" form, open `/meals`, and confirm:
- The **Category** filter now renders as a chip row (Main, Soup) with a "Category" heading, visually identical in style to the Tags chip row.
- Toggling one category chip filters the list; the URL gets `?category=main` (or `?category=soup`).
- Toggling both category chips → `?category=main&category=soup` → all meals show (OR).
- Deselecting a category chip removes its param.
- Category + tag filters combine (a meal must match the selected tag(s) AND the selected category).
- No console errors.

Then kill the dev server.