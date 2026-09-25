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
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; durationDays: number; tags: Tag[] };

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
