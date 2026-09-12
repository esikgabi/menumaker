import { requireHousehold } from '@/lib/session';
import { listMeals } from '@/lib/meal';
import { getWeekDateKeys, getFutureWeekDateKeys, getOrCreateWeekPlan, transitionPastPlannedEntries, toDateKey } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { PlanView } from './plan-view';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function PlanPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);

  const fullWeek = getWeekDateKeys(new Date());
  const futureWeek = getFutureWeekDateKeys(new Date());
  const [entries, meals] = await Promise.all([
    getOrCreateWeekPlan(householdId, futureWeek),
    listMeals(householdId),
  ]);

  const entryByKey = new Map(entries.map((e) => [`${toDateKey(e.date)}:${e.category}`, e]));
  const mainMeals = meals.filter((m) => m.category === 'main');
  const soupMeals = meals.filter((m) => m.category === 'soup');

  const days = futureWeek.map((dateKey) => {
    const dayIndex = fullWeek.indexOf(dateKey);
    const mainEntry = entryByKey.get(`${dateKey}:main`);
    const soupEntry = entryByKey.get(`${dateKey}:soup`);
    return {
      dateKey,
      dayName: t(DAY_NAME_KEYS[dayIndex]),
      main: {
        mealId: mainEntry?.mealId ?? null,
        mealName: mainEntry?.meal?.name ?? null,
        tags: mainEntry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
        status: (mainEntry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
      },
      soup: {
        mealId: soupEntry?.mealId ?? null,
        mealName: soupEntry?.meal?.name ?? null,
        tags: soupEntry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
        status: (soupEntry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
      },
    };
  });

  return (
    <PlanView
      days={days}
      mainMeals={mainMeals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      soupMeals={soupMeals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      hasMeals={mainMeals.length > 0}
      notEnoughMeals={mainMeals.length > 0 && mainMeals.length < 7}
      mealCount={mainMeals.length}
    />
  );
}
