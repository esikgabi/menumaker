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
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; tags: Tag[] };

export function MealList({
  meals,
  allTags,
  activeTag,
  activeCategory,
}: {
  meals: Meal[];
  allTags: Tag[];
  activeTag?: string;
  activeCategory?: string;
}) {
  const t = useTranslations('Meals');
  const router = useRouter();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  function buildUrl(nextTag?: string, nextCategory?: string) {
    const params = new URLSearchParams();
    if (nextTag) params.set('tag', nextTag);
    if (nextCategory) params.set('category', nextCategory);
    const query = params.toString();
    return query ? `/meals?${query}` : '/meals';
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={activeTag ?? 'all'}
            onValueChange={(value) => router.push(buildUrl(value === 'all' ? undefined : value, activeCategory))}
          >
            <SelectTrigger className="w-full sm:w-48">
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
          <Select
            value={activeCategory ?? 'all'}
            onValueChange={(value) => router.push(buildUrl(activeTag, value === 'all' ? undefined : value))}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allCategories')}</SelectItem>
              <SelectItem value="main">{t('categoryMain')}</SelectItem>
              <SelectItem value="soup">{t('categorySoup')}</SelectItem>
            </SelectContent>
          </Select>
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
