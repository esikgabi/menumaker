import { prisma } from '@/lib/prisma';

// ponytail: toDateKey is UTC on purpose — dates stored as @db.Date come back
// from Prisma as UTC-midnight instants, so UTC slicing round-trips exactly.
// Never use it to derive "today" from a wall clock; use localDateKey for that.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The local-calendar equivalent of toDateKey: for "now" and locally
// constructed Dates. Single server TZ; multi-timezone households would need a
// per-user TZ (upgrade path, not needed for one household per deployment).
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Returns the 7 date keys (Monday..Sunday) for the week containing `reference`, using the server's local calendar. */
export function getWeekDateKeys(reference: Date): string[] {
  const day = reference.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    reference.getFullYear(), reference.getMonth(), reference.getDate() - mondayOffset,
  );

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateKey(d);
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
  const todayKey = localDateKey(today);
  return getWeekDateKeys(reference).filter((k) => k >= todayKey);
}

/** 0=Mon..6=Sun, matching Household.activeWeekdays and getWeekDateKeys' ordering. */
function weekdayIndexOfDateKey(dateKey: string): number {
  const jsDay = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // convert to 0=Mon..6=Sun
}

export type PlanMeal = { id: string; name: string; tags: string[]; durationDays?: number };
export type CookedHistoryEntry = { mealId: string; dateKey: string };

const AVOID_REPEAT_WEEKS = 3;

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

  // Walk the days in order; when a meal is newly picked, it fills its own
  // durationDays consecutive slots (clamped to the remaining days) before the
  // next ranked, not-yet-used meal is picked. weekDateKeys is expected to
  // already be "active days only" — the caller (generateAndSaveWeeklyPlan)
  // filters out skipped days before calling this function, so duration never
  // spans a day that isn't actually in this array.
  const assignedMealIds: (string | null)[] = new Array(weekDateKeys.length).fill(null);
  let picksNeeded = 0;
  let i = 0;
  while (i < weekDateKeys.length) {
    const unused = ranked.find((m) => !assignedMealIds.includes(m.id));
    const chosen = unused ?? ranked[picksNeeded % ranked.length];
    picksNeeded += 1;
    const span = Math.max(1, chosen.durationDays ?? 1);
    for (let j = i; j < Math.min(i + span, weekDateKeys.length); j++) {
      assignedMealIds[j] = chosen.id;
    }
    i += span;
  }

  const notEnoughMeals = picksNeeded > meals.length;

  return {
    assignments: weekDateKeys.map((dateKey, idx) => ({ dateKey, mealId: assignedMealIds[idx] })),
    notEnoughMeals,
  };
}

/** Transitions past `planned` entries to `cooked` (if a meal was assigned) or `skipped` (if not). */
export async function transitionPastPlannedEntries(householdId: string) {
  const todayKey = localDateKey(new Date());

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

/** Ensures a main and soup PlanEntry row exists for every ACTIVE date key in the week, then returns them with meal+tags included. Inactive days (per household pattern or a one-off override) get no rows. */
export async function getOrCreateWeekPlan(householdId: string, weekDateKeys: string[]) {
  const activeDateKeys = await resolveActiveDateKeys(householdId, weekDateKeys);

  const existing = await prisma.planEntry.findMany({
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) } },
  });
  const existingKeys = new Set(existing.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const missing = activeDateKeys.flatMap((dateKey) =>
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
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) } },
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

  // Duration-spanning must walk active days only — a skipped day must not
  // consume a slot of a multi-day meal (see resolveActiveDateKeys).
  const activeDateKeys = await resolveActiveDateKeys(householdId, weekDateKeys);

  const editableEntries = await prisma.planEntry.findMany({
    where: { householdId, date: { in: activeDateKeys.map((k) => new Date(k)) }, status: { not: 'cooked' } },
  });
  const editableKeys = new Set(editableEntries.map((e) => `${toDateKey(e.date)}:${e.category}`));

  const updates = MEAL_CATEGORIES.flatMap((category) => {
    const categoryMeals: PlanMeal[] = meals
      .filter((m) => m.category === category)
      .map((m) => ({ id: m.id, name: m.name, tags: m.tags.map((mt) => mt.tag.name), durationDays: m.durationDays }));
    const categoryCookedHistory: CookedHistoryEntry[] = cookedEntries
      .filter((e) => e.meal?.category === category)
      .map((e) => ({ mealId: e.mealId!, dateKey: toDateKey(e.date) }));

    const { assignments } = generateWeeklyPlan({
      meals: categoryMeals,
      cookedHistory: categoryCookedHistory,
      weekDateKeys: activeDateKeys,
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

const CATEGORY_ORDER = { soup: 0, main: 1 } as const;

function groupByDay<T extends { date: Date; category: 'main' | 'soup' }>(entries: T[]) {
  const dayMap = new Map<string, T[]>();
  for (const entry of entries) {
    const key = toDateKey(entry.date);
    const existing = dayMap.get(key);
    if (existing) existing.push(entry);
    else dayMap.set(key, [entry]);
  }

  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // most recent day first
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      entries: [...dayEntries].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]),
    }));
}

/** Returns cooked PlanEntry rows for a household, grouped by Monday-start week
 *  (most recent week first) and then by day within the week (most recent day
 *  first, soup before main within a day). */
export async function listCookedHistory(householdId: string) {
  const entries = (
    await prisma.planEntry.findMany({
      where: { householdId, status: 'cooked' },
      include: { meal: { include: { tags: { include: { tag: true } } } } },
      orderBy: { date: 'desc' },
    })
  ).filter((e) => e.meal !== null); // deleting a meal nulls the FK (ON DELETE SET NULL); don't render anonymous history rows

  const weekMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const weekStartKey = getWeekDateKeys(entry.date)[0];
    const existing = weekMap.get(weekStartKey);
    if (existing) existing.push(entry);
    else weekMap.set(weekStartKey, [entry]);
  }

  return [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartKey, weekEntries]) => ({
      weekStartKey,
      days: groupByDay(weekEntries),
    }));
}

/** Pure merge: a date key is active if it has no override, or its override says so. */
export function mergeActiveDateKeys(
  weekDateKeys: string[],
  activeWeekdays: number[],
  overridesByDateKey: Map<string, boolean>,
): string[] {
  return weekDateKeys.filter((dateKey) => {
    const override = overridesByDateKey.get(dateKey);
    if (override !== undefined) return override;
    return activeWeekdays.includes(weekdayIndexOfDateKey(dateKey));
  });
}

/** Resolves which of `weekDateKeys` need a menu for this household: household pattern, overridden per-date. */
export async function resolveActiveDateKeys(householdId: string, weekDateKeys: string[]): Promise<string[]> {
  const [household, overrides] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { activeWeekdays: true } }),
    prisma.planDayOverride.findMany({
      where: { householdId, date: { in: weekDateKeys.map((k) => new Date(k)) } },
    }),
  ]);

  const overridesByDateKey = new Map(overrides.map((o) => [toDateKey(o.date), o.active]));
  return mergeActiveDateKeys(weekDateKeys, household.activeWeekdays, overridesByDateKey);
}

/** Sets or clears (active: null) a one-off day override, scoped to the caller's household. */
export async function setPlanDayOverride(householdId: string, dateKey: string, active: boolean | null) {
  if (active === null) {
    await prisma.planDayOverride.deleteMany({ where: { householdId, date: new Date(dateKey) } });
    return;
  }

  await prisma.planDayOverride.upsert({
    where: { householdId_date: { householdId, date: new Date(dateKey) } },
    update: { active },
    create: { householdId, date: new Date(dateKey), active },
  });
}
