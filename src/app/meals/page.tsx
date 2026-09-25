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
          durationDays: m.durationDays,
          tags: m.tags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name })),
        }))}
        allTags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeTagIds={activeTagIds}
        activeCategories={activeCategories}
      />
    </div>
  );
}
