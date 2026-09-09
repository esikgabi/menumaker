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
