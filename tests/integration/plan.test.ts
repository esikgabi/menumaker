import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, updateActiveWeekdays } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import {
  getWeekDateKeys,
  getOrCreateWeekPlan,
  generateAndSaveWeeklyPlan,
  localDateKey,
  resolveActiveDateKeys,
  setPlanDayOverride,
  setPlanEntryMeal,
  transitionPastPlannedEntries,
  toDateKey,
} from '@/lib/plan';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planDayOverride.deleteMany();
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@plan-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Plan Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeHouseholdWithMeals(
  suffix: string,
  mealSpecs: (string | { name: string; category: 'soup' | 'main' })[],
) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@plan-test.example.com`, name: 'Owner' },
  });
  const household = await createHouseholdWithOwner(`Plan Test Household ${suffix}`, owner.id);
  const meals = [];
  for (const spec of mealSpecs) {
    const { name, category } = typeof spec === 'string' ? { name: spec, category: 'main' as const } : spec;
    meals.push(await createMeal(household.id, owner.id, { name, note: '', tagIds: [], category }));
  }
  return { household, owner, meals };
}

describe('getOrCreateWeekPlan', () => {
  it('creates a main and soup entry per day for a new week and is idempotent', async () => {
    const { household } = await makeHouseholdWithMeals('A', []);
    const week = getWeekDateKeys(new Date());

    const first = await getOrCreateWeekPlan(household.id, week);
    expect(first).toHaveLength(14); // 7 days x 2 categories
    expect(first.every((e) => e.status === 'planned')).toBe(true);
    expect(first.filter((e) => e.category === 'main')).toHaveLength(7);
    expect(first.filter((e) => e.category === 'soup')).toHaveLength(7);

    const second = await getOrCreateWeekPlan(household.id, week);
    expect(second).toHaveLength(14); // no duplicates created
  });

  it('handles concurrent calls for a brand-new week without throwing', async () => {
    const { household } = await makeHouseholdWithMeals('L', []);
    const week = getWeekDateKeys(new Date());

    const [first, second] = await Promise.all([
      getOrCreateWeekPlan(household.id, week),
      getOrCreateWeekPlan(household.id, week),
    ]);

    expect(first).toHaveLength(14);
    expect(second).toHaveLength(14);
  });
});

describe('generateAndSaveWeeklyPlan', () => {
  it('assigns main meals for a household and does not touch another household', async () => {
    const { household } = await makeHouseholdWithMeals('B', ['Meal 1', 'Meal 2', 'Meal 3']);
    const { household: otherHousehold } = await makeHouseholdWithMeals('C', ['Other Meal']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.filter((e) => e.category === 'main' && e.mealId !== null).length).toBeGreaterThan(0);

    const otherEntries = await getOrCreateWeekPlan(otherHousehold.id, week);
    expect(otherEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('assigns soup meals independently of main meals', async () => {
    const { household } = await makeHouseholdWithMeals('SOUP1', [
      { name: 'Main A', category: 'main' },
      { name: 'Main B', category: 'main' },
      { name: 'Soup A', category: 'soup' },
      { name: 'Soup B', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    const soupEntries = entries.filter((e) => e.category === 'soup');
    const mainEntries = entries.filter((e) => e.category === 'main');
    expect(soupEntries.every((e) => e.meal?.category === 'soup')).toBe(true);
    expect(mainEntries.every((e) => e.meal?.category === 'main')).toBe(true);
    expect(soupEntries.some((e) => e.mealId !== null)).toBe(true);
  });

  it('leaves soup empty for every day when the household has no soup meals', async () => {
    const { household } = await makeHouseholdWithMeals('SOUP2', ['Main Only']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    const soupEntries = entries.filter((e) => e.category === 'soup');
    expect(soupEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('does not overwrite a day already marked cooked, independently per category', async () => {
    const { household, meals } = await makeHouseholdWithMeals('D', [
      { name: 'Meal X', category: 'main' },
      { name: 'Meal Y', category: 'main' },
      { name: 'Soup X', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    await generateAndSaveWeeklyPlan(household.id, week);

    const mainEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    expect(mainEntry?.mealId).toBe(meals[0].id);
    expect(mainEntry?.status).toBe('cooked');

    // the soup sibling row for the same day is still regenerable
    const soupEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'soup' } },
    });
    expect(soupEntry?.status).toBe('planned');
  });
});

describe('setPlanEntryMeal', () => {
  it('overrides a day with a chosen meal for the given category', async () => {
    const { household, meals } = await makeHouseholdWithMeals('E', [
      { name: 'Meal 1', category: 'main' },
      { name: 'Meal 2', category: 'main' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[2], 'main', meals[1].id);

    expect(result?.mealId).toBe(meals[1].id);
    expect(result?.category).toBe('main');
  });

  it('overrides a soup slot independently of the main slot on the same day', async () => {
    const { household, meals } = await makeHouseholdWithMeals('SOUP3', [
      { name: 'Main 1', category: 'main' },
      { name: 'Soup 1', category: 'soup' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await setPlanEntryMeal(household.id, week[0], 'main', meals[0].id);
    await setPlanEntryMeal(household.id, week[0], 'soup', meals[1].id);

    const mainEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    const soupEntry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'soup' } },
    });
    expect(mainEntry?.mealId).toBe(meals[0].id);
    expect(soupEntry?.mealId).toBe(meals[1].id);
  });

  it('rejects a meal that belongs to another household', async () => {
    const { household } = await makeHouseholdWithMeals('F', []);
    const { meals: otherMeals } = await makeHouseholdWithMeals('G', ['Foreign Meal']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[0], 'main', otherMeals[0].id);

    expect(result).toBeNull();
  });

  it('rejects an override on a day already marked cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('K', [
      { name: 'Meal 1', category: 'main' },
      { name: 'Meal 2', category: 'main' },
    ]);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    const result = await setPlanEntryMeal(household.id, week[0], 'main', meals[1].id);

    expect(result).toBeNull();
    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(week[0]), category: 'main' } },
    });
    expect(entry?.status).toBe('cooked');
    expect(entry?.mealId).toBe(meals[0].id);
  });
});

describe('transitionPastPlannedEntries', () => {
  it('marks a past planned entry with a meal as cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('H', ['Meal 1']);
    const pastDateKey = localDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), category: 'main', mealId: meals[0].id, status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(pastDateKey), category: 'main' } },
    });
    expect(entry?.status).toBe('cooked');
  });

  it('marks a past planned entry with no meal as skipped', async () => {
    const { household } = await makeHouseholdWithMeals('I', []);
    const pastDateKey = localDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), category: 'main', status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(pastDateKey), category: 'main' } },
    });
    expect(entry?.status).toBe('skipped');
  });

  it('does not touch a future planned entry', async () => {
    const { household } = await makeHouseholdWithMeals('J', []);
    const futureDateKey = toDateKey(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(futureDateKey), category: 'main', status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date_category: { householdId: household.id, date: new Date(futureDateKey), category: 'main' } },
    });
    expect(entry?.status).toBe('planned');
  });
});

describe('resolveActiveDateKeys', () => {
  it('returns every date key when the household has the default all-days pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT1', []);
    const week = getWeekDateKeys(new Date());

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toEqual(week);
  });

  it('excludes date keys whose weekday is not in the household pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT2', []);
    const week = getWeekDateKeys(new Date()); // Monday..Sunday
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Mon-Fri only

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toEqual(week.slice(0, 5));
  });

  it('a one-off override forcing a day off wins over the pattern saying on', async () => {
    const { household } = await makeHouseholdWithMeals('ACT3', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[2], false);

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).not.toContain(week[2]);
    expect(active).toHaveLength(6);
  });

  it('a one-off override forcing a day on wins over the pattern saying off', async () => {
    const { household } = await makeHouseholdWithMeals('ACT4', []);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Sat/Sun off by pattern
    await setPlanDayOverride(household.id, week[5], true); // force Saturday on

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toContain(week[5]);
    expect(active).not.toContain(week[6]);
  });

  it('clearing an override (active: null) reverts to the pattern default', async () => {
    const { household } = await makeHouseholdWithMeals('ACT5', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[0], false);
    await setPlanDayOverride(household.id, week[0], null);

    const active = await resolveActiveDateKeys(household.id, week);

    expect(active).toContain(week[0]);
  });
});

describe('getOrCreateWeekPlan with active-day filtering', () => {
  it('creates no rows for a day excluded by the household active-weekdays pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT6', []);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]); // Mon-Fri only

    const entries = await getOrCreateWeekPlan(household.id, week);

    const entryDateKeys = new Set(entries.map((e) => toDateKey(e.date)));
    expect(entryDateKeys.has(week[5])).toBe(false); // Saturday
    expect(entryDateKeys.has(week[6])).toBe(false); // Sunday
    expect(entries).toHaveLength(10); // 5 active days x 2 categories
  });

  it('creates no rows for a day excluded by a one-off override', async () => {
    const { household } = await makeHouseholdWithMeals('ACT7', []);
    const week = getWeekDateKeys(new Date());
    await setPlanDayOverride(household.id, week[2], false);

    const entries = await getOrCreateWeekPlan(household.id, week);

    const entryDateKeys = new Set(entries.map((e) => toDateKey(e.date)));
    expect(entryDateKeys.has(week[2])).toBe(false);
    expect(entries).toHaveLength(12); // 6 active days x 2 categories
  });
});

describe('generateAndSaveWeeklyPlan with active-day filtering', () => {
  it('does not assign a meal to a day excluded by the active-weekdays pattern', async () => {
    const { household } = await makeHouseholdWithMeals('ACT8', ['Meal 1', 'Meal 2']);
    const week = getWeekDateKeys(new Date());
    await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]);

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.some((e) => toDateKey(e.date) === week[5])).toBe(false);
  });

  it('assigns a multi-day meal to consecutive active PlanEntry rows', async () => {
    const { household, owner } = await makeHouseholdWithMeals('ACT9', []);
    const stew = await createMeal(household.id, owner.id, { name: 'Stew', note: '', tagIds: [], category: 'main', durationDays: 2 });
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const mainEntries = (await getOrCreateWeekPlan(household.id, week))
      .filter((e) => e.category === 'main')
      .sort((a, b) => toDateKey(a.date).localeCompare(toDateKey(b.date)));
    expect(mainEntries[0].mealId).toBe(stew.id);
    expect(mainEntries[1].mealId).toBe(stew.id);
  });

  it('carries a multi-day meal over a skipped weekday instead of wasting a duration slot on it', async () => {
    const { household, owner } = await makeHouseholdWithMeals('ACT10', []);
    const stew = await createMeal(household.id, owner.id, { name: 'AAA Stew', note: '', tagIds: [], category: 'main', durationDays: 3 });
    await createMeal(household.id, owner.id, { name: 'M2', note: '', tagIds: [], category: 'main', durationDays: 1 });
    await createMeal(household.id, owner.id, { name: 'M3', note: '', tagIds: [], category: 'main', durationDays: 1 });
    const week = getWeekDateKeys(new Date());
    // Turn off Wednesday (index 2). Stew picked Mon+Tue should land its 3rd
    // day on Thursday (the next *active* day), not be wasted on Wednesday —
    // which would bump every following pick one day earlier than correct.
    await updateActiveWeekdays(household.id, [0, 1, 3, 4, 5, 6]);

    await generateAndSaveWeeklyPlan(household.id, week);

    const mainEntries = (await getOrCreateWeekPlan(household.id, week))
      .filter((e) => e.category === 'main')
      .sort((a, b) => toDateKey(a.date).localeCompare(toDateKey(b.date)));
    const byKey = new Map(mainEntries.map((e) => [toDateKey(e.date), e.mealId]));

    expect(byKey.has(week[2])).toBe(false); // Wednesday has no row at all
    expect(byKey.get(week[0])).toBe(stew.id); // Monday: Stew day 1
    expect(byKey.get(week[1])).toBe(stew.id); // Tuesday: Stew day 2
    expect(byKey.get(week[3])).toBe(stew.id); // Thursday: Stew day 3, carried over Wednesday
  });
});
