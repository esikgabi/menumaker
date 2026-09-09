# MenuMaker Phase 4: Meals & Tags CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Meals list screen: add/edit/delete a meal (name + optional note + tags), filter by tag, all scoped to the signed-in user's household. Custom tags can be created inline when tagging a meal.

**Architecture:** Server Actions in `src/app/meals/actions.ts` call pure, testable functions in `src/lib/meal.ts` (validation + Prisma calls), all scoped by `householdId` taken from the session. The Meals page is a Server Component that reads `?tag=` from the URL for filtering; a client `MealForm` dialog (shadcn `Dialog`) handles create/edit.

**Tech Stack:** builds on Phases 1–3 (Next.js, Prisma, Auth.js, next-intl). Zod 3.25.76 for input validation (already a transitive dependency of `shadcn`, adding it directly as a first-class dependency here since we validate meal input).

**Depends on:** Phase 1 (Prisma schema: `Meal`, `Tag`, `MealTag`), Phase 2 (auth/session), Phase 3 (`requireHousehold()`, i18n).

---

### Task 1: Install Zod for input validation

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `npm install zod@3.25.76`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod for input validation"
```

---

### Task 2: Meal/tag data-access library (with unit + integration tests)

**Files:**
- Create: `src/lib/meal.ts`
- Test: `tests/unit/meal.test.ts`, `tests/integration/meal.test.ts`

- [ ] **Step 1: Write the failing unit test for validation**

`tests/unit/meal.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mealInputSchema } from '@/lib/meal';

describe('mealInputSchema', () => {
  it('accepts a valid meal with tags', () => {
    const result = mealInputSchema.safeParse({
      name: 'Spaghetti Bolognese',
      note: 'Kids love this one',
      tagIds: ['tag_1', 'tag_2'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a meal with no note and no tags', () => {
    const result = mealInputSchema.safeParse({ name: 'Grilled Cheese', tagIds: [] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = mealInputSchema.safeParse({ name: '', tagIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    const result = mealInputSchema.safeParse({ name: 'a'.repeat(101), tagIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a note over 500 characters', () => {
    const result = mealInputSchema.safeParse({ name: 'X', note: 'a'.repeat(501), tagIds: [] });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/meal.test.ts`
Expected: FAIL — `Cannot find module '@/lib/meal'`.

- [ ] **Step 3: Implement `src/lib/meal.ts`**

```ts
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()),
});

export type MealInput = z.infer<typeof mealInputSchema>;

export async function listMeals(householdId: string, tagId?: string) {
  return prisma.meal.findMany({
    where: {
      householdId,
      ...(tagId ? { tags: { some: { tagId } } } : {}),
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function listTags(householdId: string) {
  return prisma.tag.findMany({ where: { householdId }, orderBy: { name: 'asc' } });
}

export async function createMeal(householdId: string, createdById: string, input: MealInput) {
  return prisma.meal.create({
    data: {
      householdId,
      createdById,
      name: input.name,
      note: input.note || null,
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function updateMeal(householdId: string, mealId: string, input: MealInput) {
  // ponytail: verifies household ownership by scoping the update's WHERE
  // clause instead of a separate SELECT-then-check. If Prisma's updateMany
  // affects 0 rows the caller (Server Action) treats it as "not found /
  // not yours" — no separate authorization check needed at this scale.
  const owned = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!owned) return null;

  await prisma.mealTag.deleteMany({ where: { mealId } });

  return prisma.meal.update({
    where: { id: mealId },
    data: {
      name: input.name,
      note: input.note || null,
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function deleteMeal(householdId: string, mealId: string) {
  const owned = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!owned) return null;

  await prisma.meal.delete({ where: { id: mealId } });
  return true;
}

export async function createTag(householdId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return prisma.tag.upsert({
    where: { householdId_name: { householdId, name: trimmed } },
    update: {},
    create: { householdId, name: trimmed },
  });
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `npm run test:unit -- tests/unit/meal.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the integration test (household isolation is the critical behavior to verify)**

`tests/integration/meal.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal, createTag, listMeals, updateMeal, deleteMeal } from '@/lib/meal';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.mealTag.deleteMany();
  await prisma.planEntry.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@meal-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Meal Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeHousehold(suffix: string) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@meal-test.example.com`, name: 'Owner' },
  });
  return createHouseholdWithOwner(`Meal Test Household ${suffix}`, owner.id);
}

describe('meal CRUD and household isolation', () => {
  it('creates a meal with tags scoped to its household', async () => {
    const household = await makeHousehold('A');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const tag = await createTag(household.id, 'healthy');

    const meal = await createMeal(household.id, owner.id, {
      name: 'Salmon Salad',
      note: '',
      tagIds: [tag!.id],
    });

    expect(meal.name).toBe('Salmon Salad');
    expect(meal.tags).toHaveLength(1);
    expect(meal.tags[0].tag.name).toBe('healthy');
  });

  it('does not return meals from another household', async () => {
    const householdA = await makeHousehold('B');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    await createMeal(householdA.id, ownerA.id, { name: 'Household A Meal', note: '', tagIds: [] });

    const householdB = await makeHousehold('C');

    const mealsForB = await listMeals(householdB.id);

    expect(mealsForB).toHaveLength(0);
  });

  it('filters meals by tag', async () => {
    const household = await makeHousehold('D');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const healthyTag = await createTag(household.id, 'healthy');
    const fastTag = await createTag(household.id, 'fast to make');

    await createMeal(household.id, owner.id, { name: 'Healthy Meal', note: '', tagIds: [healthyTag!.id] });
    await createMeal(household.id, owner.id, { name: 'Fast Meal', note: '', tagIds: [fastTag!.id] });

    const healthyMeals = await listMeals(household.id, healthyTag!.id);

    expect(healthyMeals).toHaveLength(1);
    expect(healthyMeals[0].name).toBe('Healthy Meal');
  });

  it('rejects updating a meal that belongs to a different household', async () => {
    const householdA = await makeHousehold('E');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'Protected Meal', note: '', tagIds: [] });

    const householdB = await makeHousehold('F');

    const result = await updateMeal(householdB.id, meal.id, { name: 'Hacked', note: '', tagIds: [] });

    expect(result).toBeNull();
  });

  it('rejects deleting a meal that belongs to a different household', async () => {
    const householdA = await makeHousehold('G');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'Protected Meal 2', note: '', tagIds: [] });

    const householdB = await makeHousehold('H');

    const result = await deleteMeal(householdB.id, meal.id);

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add meal/tag data-access library with household-isolation tests"
```

---

### Task 3: Server Actions for the Meals page

**Files:**
- Create: `src/app/meals/actions.ts`

- [ ] **Step 1: Implement actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { mealInputSchema, createMeal, updateMeal, deleteMeal, createTag } from '@/lib/meal';

function parseMealForm(formData: FormData) {
  return mealInputSchema.parse({
    name: formData.get('name'),
    note: formData.get('note') ?? '',
    tagIds: formData.getAll('tagIds').map(String),
  });
}

export async function createMealAction(formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  await createMeal(session.user.householdId!, session.user.id, input);
  revalidatePath('/meals');
}

export async function updateMealAction(mealId: string, formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  const result = await updateMeal(session.user.householdId!, mealId, input);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function deleteMealAction(mealId: string) {
  const session = await requireHousehold();
  const result = await deleteMeal(session.user.householdId!, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function createTagAction(name: string) {
  const session = await requireHousehold();
  const tag = await createTag(session.user.householdId!, name);
  revalidatePath('/meals');
  return tag;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Server Actions for meal and tag CRUD"
```

---

### Task 4: Meals list page with tag filter

**Files:**
- Modify: `src/app/meals/page.tsx`
- Create: `src/app/meals/meal-list.tsx`, `src/app/meals/meal-form.tsx`
- Modify: `messages/en.json`, `messages/hu.json`

- [ ] **Step 1: Add translations**

Add to `messages/en.json`:
```json
"Meals": {
  "title": "Meals",
  "addMeal": "Add meal",
  "editMeal": "Edit meal",
  "nameLabel": "Name",
  "noteLabel": "Note (optional)",
  "tagsLabel": "Tags",
  "newTagPlaceholder": "New tag name",
  "addTag": "Add tag",
  "save": "Save",
  "delete": "Delete",
  "cancel": "Cancel",
  "allTags": "All tags",
  "noMeals": "No meals yet. Add your first meal to get started."
}
```

Add to `messages/hu.json`:
```json
"Meals": {
  "title": "Ételek",
  "addMeal": "Étel hozzáadása",
  "editMeal": "Étel szerkesztése",
  "nameLabel": "Név",
  "noteLabel": "Megjegyzés (opcionális)",
  "tagsLabel": "Címkék",
  "newTagPlaceholder": "Új címke neve",
  "addTag": "Címke hozzáadása",
  "save": "Mentés",
  "delete": "Törlés",
  "cancel": "Mégse",
  "allTags": "Minden címke",
  "noMeals": "Még nincs étel. Adj hozzá egyet a kezdéshez."
}
```

- [ ] **Step 2: Page (Server Component) — fetch data, render filter + list + add button**

`src/app/meals/page.tsx`:
```tsx
import { requireHousehold } from '@/lib/session';
import { listMeals, listTags } from '@/lib/meal';
import { getTranslations } from 'next-intl/server';
import { MealList } from './meal-list';

export default async function MealsPage({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Meals');

  const [meals, tags] = await Promise.all([
    listMeals(householdId, searchParams.tag),
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
          tags: m.tags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name })),
        }))}
        allTags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeTag={searchParams.tag}
      />
    </div>
  );
}
```

- [ ] **Step 3: Client list component with filter dropdown and edit/delete actions**

`src/app/meals/meal-list.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deleteMealAction } from './actions';
import { MealForm } from './meal-form';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; tags: Tag[] };

export function MealList({
  meals,
  allTags,
  activeTag,
}: {
  meals: Meal[];
  allTags: Tag[];
  activeTag?: string;
}) {
  const t = useTranslations('Meals');
  const router = useRouter();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Select
          value={activeTag ?? 'all'}
          onValueChange={(value) => router.push(value === 'all' ? '/meals' : `/meals?tag=${value}`)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTags')}</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setIsAdding(true)}>{t('addMeal')}</Button>
      </div>

      {meals.length === 0 && <p className="text-sm text-muted-foreground">{t('noMeals')}</p>}

      <ul className="flex flex-col gap-2">
        {meals.map((meal) => (
          <li key={meal.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{meal.name}</p>
              {meal.note && <p className="text-sm text-muted-foreground">{meal.note}</p>}
              <div className="mt-1 flex gap-1">
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

- [ ] **Step 4: Meal form dialog (create + edit + inline tag creation)**

`src/app/meals/meal-form.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createMealAction, updateMealAction, createTagAction } from './actions';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; tags: Tag[] };

export function MealForm({
  meal,
  allTags,
  onClose,
}: {
  meal?: Meal;
  allTags: Tag[];
  onClose: () => void;
}) {
  const t = useTranslations('Meals');
  const [tags, setTags] = useState<Tag[]>(allTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(meal?.tags.map((tg) => tg.id) ?? []);
  const [newTagName, setNewTagName] = useState('');

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await createTagAction(newTagName.trim());
    if (tag) {
      setTags((prev) => [...prev, tag]);
      setSelectedTagIds((prev) => [...prev, tag.id]);
    }
    setNewTagName('');
  }

  async function handleSubmit(formData: FormData) {
    selectedTagIds.forEach((id) => formData.append('tagIds', id));
    if (meal) {
      await updateMealAction(meal.id, formData);
    } else {
      await createMealAction(formData);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meal ? t('editMeal') : t('addMeal')}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">{t('nameLabel')}</Label>
            <Input id="name" name="name" defaultValue={meal?.name} required maxLength={100} />
          </div>

          <div>
            <Label htmlFor="note">{t('noteLabel')}</Label>
            <Input id="note" name="note" defaultValue={meal?.note ?? ''} maxLength={500} />
          </div>

          <div>
            <Label>{t('tagsLabel')}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder={t('newTagPlaceholder')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={handleAddTag}>
                {t('addTag')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, sign in, go to `/meals`.
Expected: "No meals yet" message. Click "Add meal", fill in a name, toggle the 5 seeded default tags, add a custom tag, save. The new meal appears with its tags. Edit it, change the name, save — updates in place. Filter by a tag using the dropdown — only matching meals show. Delete a meal — it disappears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement Meals list screen with add/edit/delete/filter"
```

---

## Self-Review Notes

- **Spec coverage:** Meals list screen (spec Screens #4) — "all household meals with their tags; add/edit/delete meal; filter by tag" — fully implemented. Meal fields limited to name + tags + optional note (no ingredients/recipes/photos), matching the v1 scope. Custom tags — "households may add their own custom tags" — implemented via inline tag creation in the meal form.
- **Household isolation:** every data-access function in `src/lib/meal.ts` takes `householdId` as an explicit first argument and scopes both reads and writes (update/delete verify ownership before mutating) — verified by the integration tests in Task 2, Step 5.
- **Type consistency:** `Meal`/`Tag` client-side types in `meal-list.tsx` and `meal-form.tsx` match the shape returned by `src/app/meals/page.tsx`'s mapping of Prisma's `listMeals`/`listTags` results.
- **Deferred:** The weekly-plan suggestion algorithm that reads these meals/tags is Phase 5.
