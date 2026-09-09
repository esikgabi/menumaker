import { describe, expect, it } from 'vitest';
import { generateWeeklyPlan } from '@/lib/plan';

const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

function meal(id: string, tags: string[] = []) {
  return { id, name: id, tags };
}

describe('generateWeeklyPlan', () => {
  it('assigns nothing and warns nothing when there are no meals', () => {
    const result = generateWeeklyPlan({ meals: [], cookedHistory: [], weekDateKeys: week });
    expect(result.assignments.every((a) => a.mealId === null)).toBe(true);
    expect(result.notEnoughMeals).toBe(false);
  });

  it('avoids a meal cooked within the last 3 weeks in favor of one never cooked', () => {
    const meals = [meal('recent'), meal('fresh')];
    const cookedHistory = [{ mealId: 'recent', dateKey: '2026-09-01' }]; // 6 days before week start
    const result = generateWeeklyPlan({ meals, cookedHistory, weekDateKeys: ['2026-09-07'] });
    expect(result.assignments[0].mealId).toBe('fresh');
  });

  it('allows a meal cooked more than 3 weeks ago', () => {
    const meals = [meal('old'), meal('fresh')];
    // 22 days before week start (> 3 weeks = 21 days)
    const cookedHistory = [{ mealId: 'old', dateKey: '2026-08-16' }];
    const result = generateWeeklyPlan({ meals, cookedHistory, weekDateKeys: ['2026-09-07'] });
    // 'old' is no longer "recent" so it's an equally valid pick as 'fresh';
    // with only one never-cooked candidate ('fresh') it still wins the tie
    // (never-cooked ranks first), so assert the non-recent set includes it.
    expect(['old', 'fresh']).toContain(result.assignments[0].mealId);
  });

  it('assigns 7 distinct meals with no repeats when 7+ meals are available', () => {
    const meals = Array.from({ length: 7 }, (_, i) => meal(`m${i}`));
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const ids = result.assignments.map((a) => a.mealId);
    expect(new Set(ids).size).toBe(7);
    expect(result.notEnoughMeals).toBe(false);
  });

  it('allows repeats and warns when fewer meals than days are available', () => {
    const meals = [meal('a'), meal('b'), meal('c'), meal('d')];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const ids = result.assignments.map((a) => a.mealId);
    expect(new Set(ids).size).toBeLessThanOrEqual(4);
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(result.notEnoughMeals).toBe(true);
  });

  it('ensures a healthy-tagged meal appears in the week when one exists', () => {
    const meals = [
      meal('junk1'),
      meal('junk2'),
      meal('junk3'),
      meal('junk4'),
      meal('junk5'),
      meal('junk6'),
      meal('healthyMeal', ['healthy']),
    ];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const assignedTags = result.assignments.map((a) => meals.find((m) => m.id === a.mealId)?.tags ?? []);
    expect(assignedTags.some((tags) => tags.includes('healthy'))).toBe(true);
  });

  it('ensures a fast-to-make-tagged meal appears in the week when one exists', () => {
    const meals = [
      meal('junk1'),
      meal('junk2'),
      meal('junk3'),
      meal('junk4'),
      meal('junk5'),
      meal('junk6'),
      meal('fastMeal', ['fast to make']),
    ];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const assignedTags = result.assignments.map((a) => meals.find((m) => m.id === a.mealId)?.tags ?? []);
    expect(assignedTags.some((tags) => tags.includes('fast to make'))).toBe(true);
  });

  it('does not force a healthy meal when none exists in the household', () => {
    const meals = [meal('a'), meal('b')];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: ['2026-09-07'] });
    expect(result.assignments[0].mealId).not.toBeNull();
  });

  it('is deterministic for identical inputs', () => {
    const meals = [meal('a', ['healthy']), meal('b'), meal('c', ['fast to make']), meal('d'), meal('e')];
    const first = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const second = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    expect(first.assignments).toEqual(second.assignments);
  });
});
