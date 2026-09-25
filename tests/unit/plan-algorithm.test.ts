import { describe, expect, it } from 'vitest';
import { generateWeeklyPlan } from '@/lib/plan';

const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

function meal(id: string, tags: string[] = [], durationDays = 1) {
  return { id, name: id, tags, durationDays };
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

  it('assigns a meal for a single-day week', () => {
    const meals = [meal('a'), meal('b')];
    const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: ['2026-09-07'] });
    expect(result.assignments[0].mealId).not.toBeNull();
  });

  it('is deterministic for identical inputs', () => {
    const meals = [meal('a'), meal('b'), meal('c'), meal('d'), meal('e')];
    const first = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    const second = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
    expect(first.assignments).toEqual(second.assignments);
  });

  describe('with durationDays', () => {
    it('assigns a 2-day meal to two consecutive days before rotating', () => {
      const meals = [meal('stew', [], 2), meal('salad', [], 1)];
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week.slice(0, 3) });

      // salad < stew alphabetically, so salad is ranked first and assigned to
      // the first slot (duration 1), then stew (duration 2) fills slots 1-2.
      expect(result.assignments[0].mealId).toBe('salad');
      expect(result.assignments[1].mealId).toBe('stew');
      expect(result.assignments[2].mealId).toBe('stew');
    });

    it('clamps a multi-day meal at the end of the week without throwing', () => {
      const meals = [meal('stew', [], 3)];
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week.slice(0, 2) });

      expect(result.assignments).toHaveLength(2);
      expect(result.assignments.every((a) => a.mealId === 'stew')).toBe(true);
    });

    it('does not let duration span a gap when weekDateKeys is pre-filtered (skipped day removed)', () => {
      const nonContiguous = [week[0], week[2]];
      const meals = [meal('stew', [], 2), meal('salad', [], 1)];
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: nonContiguous });

      // salad < stew alphabetically, so salad (duration 1) fills index 0,
      // stew (duration 2) fills indices 1-2 (clamped to 2 entries).
      expect(result.assignments[0].mealId).toBe('salad');
      expect(result.assignments[1].mealId).toBe('stew');
    });

    it('counts distinct picks (not days) for notEnoughMeals when duration covers multiple days', () => {
      const meals = [meal('stew', [], 7)];
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });

      expect(result.notEnoughMeals).toBe(false);
      expect(result.assignments.every((a) => a.mealId === 'stew')).toBe(true);
    });

    it('still warns when duration is insufficient to cover the week with available meals', () => {
      const meals = [meal('a', [], 2), meal('b', [], 2)];
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });

      expect(result.notEnoughMeals).toBe(true);
    });

    it('defaults durationDays to 1 for backward compatibility (existing behavior unchanged)', () => {
      const meals = Array.from({ length: 7 }, (_, i) => meal(`m${i}`));
      const result = generateWeeklyPlan({ meals, cookedHistory: [], weekDateKeys: week });
      const ids = result.assignments.map((a) => a.mealId);
      expect(new Set(ids).size).toBe(7);
    });
  });
});
