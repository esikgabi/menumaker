import { prisma } from '@/lib/prisma';

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns the 7 date keys (Monday..Sunday) for the week containing `reference`. */
export function getWeekDateKeys(reference: Date): string[] {
  const day = reference.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - mondayOffset),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return toDateKey(d);
  });
}

export type PlanMeal = { id: string; name: string; tags: string[] };
export type CookedHistoryEntry = { mealId: string; dateKey: string };

const AVOID_REPEAT_WEEKS = 3;
const BALANCE_TAGS = ['healthy', 'fast to make'];

export function generateWeeklyPlan(input: {
  meals: PlanMeal[];
  cookedHistory: CookedHistoryEntry[];
  weekDateKeys: string[];
}): { assignments: { dateKey: string; mealId: string | null }[]; notEnoughMeals: boolean } {
  const { meals, cookedHistory, weekDateKeys } = input;

  if (meals.length === 0) {
    return {
      assignments: weekDateKeys.map((dateKey) => ({ dateKey, mealId: null })),
      notEnoughMeals: false,
    };
  }

  const cutoffKey = toDateKey(
    new Date(new Date(weekDateKeys[0]).getTime() - AVOID_REPEAT_WEEKS * 7 * 24 * 60 * 60 * 1000),
  );

  const lastCookedKey = new Map<string, string>();
  for (const entry of cookedHistory) {
    const existing = lastCookedKey.get(entry.mealId);
    if (!existing || entry.dateKey > existing) lastCookedKey.set(entry.mealId, entry.dateKey);
  }

  function isRecentlyCooked(mealId: string): boolean {
    const key = lastCookedKey.get(mealId);
    return key !== undefined && key >= cutoffKey;
  }

  // Rank candidates: never-cooked-or-not-recently-cooked meals first (oldest
  // cooked date first among them), recently-cooked meals last. Ties broken
  // alphabetically by name so the algorithm is deterministic and testable.
  const ranked = [...meals].sort((a, b) => {
    const aRecent = isRecentlyCooked(a.id);
    const bRecent = isRecentlyCooked(b.id);
    if (aRecent !== bRecent) return aRecent ? 1 : -1;
    const aLast = lastCookedKey.get(a.id) ?? '';
    const bLast = lastCookedKey.get(b.id) ?? '';
    if (aLast !== bLast) return aLast.localeCompare(bLast);
    return a.name.localeCompare(b.name);
  });

  const notEnoughMeals = meals.length < weekDateKeys.length;

  // First pass: no repeats while distinct candidates remain, then cycle.
  const assignedMealIds: string[] = [];
  for (let i = 0; i < weekDateKeys.length; i++) {
    const unused = ranked.find((m) => !assignedMealIds.includes(m.id));
    assignedMealIds.push(unused ? unused.id : ranked[i % ranked.length].id);
  }

  // Second pass: tag balance. Swap in a tagged candidate for the first day
  // that holds a *repeated* meal, preferring not to disturb days whose meal
  // is uniquely assigned that week.
  const usedSwapIndices = new Set<number>();
  for (const requiredTag of BALANCE_TAGS) {
    const alreadyPresent = assignedMealIds.some((id) => meals.find((m) => m.id === id)?.tags.includes(requiredTag));
    if (alreadyPresent) continue;

    const candidate = ranked.find((m) => m.tags.includes(requiredTag));
    if (!candidate) continue; // household has no meal with this tag at all

    const duplicateIndex = assignedMealIds.findIndex(
      (id, idx) => assignedMealIds.indexOf(id) !== idx && !usedSwapIndices.has(idx),
    );
    const fallbackIndex = assignedMealIds.findIndex((_, idx) => !usedSwapIndices.has(idx));
    const swapIndex = duplicateIndex !== -1 ? duplicateIndex : fallbackIndex !== -1 ? fallbackIndex : 0;
    assignedMealIds[swapIndex] = candidate.id;
    usedSwapIndices.add(swapIndex);
  }

  return {
    assignments: weekDateKeys.map((dateKey, i) => ({ dateKey, mealId: assignedMealIds[i] })),
    notEnoughMeals,
  };
}

/** Transitions past `planned` entries to `cooked` (if a meal was assigned) or `skipped` (if not). */
export async function transitionPastPlannedEntries(householdId: string) {
  const todayKey = toDateKey(new Date());

  await prisma.planEntry.updateMany({
    where: { householdId, status: 'planned', date: { lt: new Date(todayKey) }, mealId: { not: null } },
    data: { status: 'cooked' },
  });

  await prisma.planEntry.updateMany({
    where: { householdId, status: 'planned', date: { lt: new Date(todayKey) }, mealId: null },
    data: { status: 'skipped' },
  });
}

/** Ensures a PlanEntry row exists for every date key in the week, then returns them with meal+tags included. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => toDateKey(e.date)));

  const missingKeys = weekDateKeys.filter((k) => !existingKeys.has(k));
  if (missingKeys.length > 0) {
    await prisma.planEntry.createMany({
      data: missingKeys.map((dateKey) => ({ householdId, date: new Date(dateKey), status: 'planned' })),
    });
  }

  return prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: { date: 'asc' },
  });
}

/** Regenerates suggestions for every day in the week that is not already `cooked` (immutable history). */
export async function generateAndSaveWeeklyPlan(householdId: string, weekDateKeys: string[]) {
  const meals = await prisma.meal.findMany({
    where: { householdId },
    include: { tags: { include: { tag: true } } },
  });
  const planMeals: PlanMeal[] = meals.map((m) => ({
    id: m.id,
    name: m.name,
    tags: m.tags.map((mt) => mt.tag.name),
  }));

  const cookedEntries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked', mealId: { not: null } },
  });
  const cookedHistory: CookedHistoryEntry[] = cookedEntries.map((e) => ({
    mealId: e.mealId!,
    dateKey: toDateKey(e.date),
  }));

  const { assignments } = generateWeeklyPlan({ meals: planMeals, cookedHistory, weekDateKeys });

  await getOrCreateWeekPlan(householdId, weekDateKeys); // ensure rows exist first

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => toDateKey(e.date)));

  await Promise.all(
    assignments
      .filter((a) => editableKeys.has(a.dateKey))
      .map((a) =>
        prisma.planEntry.updateMany({
          where: { householdId, date: new Date(a.dateKey) },
          data: { mealId: a.mealId, status: 'planned' },
        }),
      ),
  );
}

/** Per-day manual override, scoped to the caller's household. */
export async function setPlanEntryMeal(householdId: string, dateKey: string, mealId: string) {
  const meal = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!meal) return null;

  return prisma.planEntry.upsert({
    where: { householdId_date: { householdId, date: new Date(dateKey) } },
    update: { mealId, status: 'planned' },
    create: { householdId, date: new Date(dateKey), mealId, status: 'planned' },
  });
}
