import { requireHousehold } from '@/lib/session';
import { listMeals } from '@/lib/meal';
import { getWeekDateKeys, getOrCreateWeekPlan, transitionPastPlannedEntries, toDateKey } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { PlanView } from './plan-view';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function PlanPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);

  const week = getWeekDateKeys(new Date());
  const [entries, meals] = await Promise.all([
    getOrCreateWeekPlan(householdId, week),
    listMeals(householdId),
  ]);

  const entryByDateKey = new Map(entries.map((e) => [toDateKey(e.date), e]));

  const days = week.map((dateKey, i) => {
    const entry = entryByDateKey.get(dateKey);
    return {
      dateKey,
      dayName: t(DAY_NAME_KEYS[i]),
      mealId: entry?.mealId ?? null,
      mealName: entry?.meal?.name ?? null,
      tags: entry?.meal?.tags.map((mt) => mt.tag.name) ?? [],
      status: (entry?.status ?? 'planned') as 'planned' | 'cooked' | 'skipped',
    };
  });

  return (
    <PlanView
      days={days}
      allMeals={meals.map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }))}
      hasMeals={meals.length > 0}
      notEnoughMeals={meals.length > 0 && meals.length < 7}
      mealCount={meals.length}
    />
  );
}
