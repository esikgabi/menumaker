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

/**
 * Returns the date keys of `getWeekDateKeys(reference)` that are `>= today`
 * — i.e. the current Mon-Sun week, restricted to today onward. `today`
 * defaults to `reference` (production call sites always pass `new Date()`
 * for both, since "the week" and "today" are the same instant); the
 * separate parameter exists so tests can pin the week and the cutoff
 * independently.
 */
export function getFutureWeekDateKeys(reference: Date, today: Date = reference): string[] {
  const todayKey = toDateKey(today);
  return getWeekDateKeys(reference).filter((k) => k >= todayKey);
}

export type PlanMeal = { id: string; name: string; tags: string[] };
export type CookedHistoryEntry = { mealId: string; dateKey: string };

const AVOID_REPEAT_WEEKS = 3;
// Synonym groups for the weekly-plan tag-balance pass below. Each group is
// one balancing concern (e.g. "healthy") with equivalent tag names across
// every supported locale (see src/i18n/config.ts SUPPORTED_LOCALES) — a
// household's meal just needs to carry ANY one of these exact tag names.
// Add a new entry to each group (not a new group) when SUPPORTED_LOCALES
// grows.
const BALANCE_TAG_GROUPS: string[][] = [
  ['healthy', 'egészséges'],
  ['fast to make', 'gyors'],
];

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
  for (const tagGroup of BALANCE_TAG_GROUPS) {
    const alreadyPresent = assignedMealIds.some((id) =>
      meals.find((m) => m.id === id)?.tags.some((tag) => tagGroup.includes(tag)),
    );
    if (alreadyPresent) continue;

    const candidate = ranked.find((m) => m.tags.some((tag) => tagGroup.includes(tag)));
    if (!candidate) continue; // household has no meal with any tag in this group

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

const MEAL_CATEGORIES = ['main', 'soup'] as const;

/** Ensures a main and soup PlanEntry row exists for every date key in the week, then returns them with meal+tags included. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const missing = weekDateKeys.flatMap((dateKey) =>
    MEAL_CATEGORIES.filter((category) => !existingKeys.has(`${dateKey}:${category}`)).map((category) => ({
      householdId,
      date: new Date(dateKey),
      category,
      status: 'planned' as const,
    })),
  );
  if (missing.length > 0) {
    await prisma.planEntry.createMany({
      data: missing,
      skipDuplicates: true, // concurrent calls for a brand-new week can race; skip rows created by the other call
    });
  }

  return prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: [{ date: 'asc' }, { category: 'asc' }],
  });
}

/** Regenerates suggestions for every day in the week that is not already `cooked` (immutable history), for both categories independently. */
export async function generateAndSaveWeeklyPlan(householdId: string, weekDateKeys: string[]) {
  const meals = await prisma.meal.findMany({
    where: { householdId },
    include: { tags: { include: { tag: true } } },
  });

  const cookedEntries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked', mealId: { not: null } },
    include: { meal: true },
  });

  await getOrCreateWeekPlan(householdId, weekDateKeys); // ensure rows exist first

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const updates = MEAL_CATEGORIES.flatMap((category) => {
    const categoryMeals: PlanMeal[] = meals
      .filter((m) => m.category === category)
      .map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name) }));
    const categoryCookedHistory: CookedHistoryEntry[] = cookedEntries
      .filter((e) => e.meal?.category === category)
      .map((e) => ({ mealId: e.mealId!, dateKey: toDateKey(e.date) }));

    const { assignments } = generateWeeklyPlan({
      meals: categoryMeals,
      cookedHistory: categoryCookedHistory,
      weekDateKeys,
    });

    return assignments
      .filter((a) => editableKeys.has(`${a.dateKey}:${category}`))
      .map((a) => ({ dateKey: a.dateKey, category, mealId: a.mealId }));
  });

  await Promise.all(
    updates.map((u) =>
      prisma.planEntry.updateMany({
        where: { householdId, date: new Date(u.dateKey), category: u.category, status: { not: 'cooked' } },
        data: { mealId: u.mealId, status: 'planned' },
      }),
    ),
  );
}

/** Per-day, per-category manual override, scoped to the caller's household. Pass `mealId: null` to clear a slot (only valid for optional categories like soup). */
export async function setPlanEntryMeal(
  householdId: string,
  dateKey: string,
  category: 'main' | 'soup',
  mealId: string | null,
) {
  if (mealId !== null) {
    const meal = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
    if (!meal) return null;
  }

  const existing = await prisma.planEntry.findUnique({
    where: { householdId_date_category: { householdId, date: new Date(dateKey), category } },
  });
  if (existing?.status === 'cooked') return null; // never silently un-cook immutable history

  return prisma.planEntry.upsert({
    where: { householdId_date_category: { householdId, date: new Date(dateKey), category } },
    update: { mealId, status: 'planned' },
    create: { householdId, date: new Date(dateKey), category, mealId, status: 'planned' },
  });
}

/** Returns cooked PlanEntry rows for a household, grouped by Monday-start week, most recent week first. */
export async function listCookedHistory(householdId: string) {
  const entries = await prisma.planEntry.findMany({
    where: { householdId, status: 'cooked' },
    include: { meal: { include: { tags: { include: { tag: true } } } } },
    orderBy: { date: 'desc' },
  });

  const weekMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const weekStartKey = getWeekDateKeys(entry.date)[0];
    const existing = weekMap.get(weekStartKey);
    if (existing) existing.push(entry);
    else weekMap.set(weekStartKey, [entry]);
  }

  return [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartKey, weekEntries]) => ({ weekStartKey, entries: weekEntries }));
}
