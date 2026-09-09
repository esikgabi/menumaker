import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import {
  getWeekDateKeys,
  getOrCreateWeekPlan,
  generateAndSaveWeeklyPlan,
  setPlanEntryMeal,
  transitionPastPlannedEntries,
  toDateKey,
} from '@/lib/plan';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
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

async function makeHouseholdWithMeals(suffix: string, mealNames: string[]) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@plan-test.example.com`, name: 'Owner' },
  });
  const household = await createHouseholdWithOwner(`Plan Test Household ${suffix}`, owner.id);
  const meals = [];
  for (const name of mealNames) {
    meals.push(await createMeal(household.id, owner.id, { name, note: '', tagIds: [] }));
  }
  return { household, owner, meals };
}

describe('getOrCreateWeekPlan', () => {
  it('creates 7 planned entries for a new week and is idempotent', async () => {
    const { household } = await makeHouseholdWithMeals('A', []);
    const week = getWeekDateKeys(new Date());

    const first = await getOrCreateWeekPlan(household.id, week);
    expect(first).toHaveLength(7);
    expect(first.every((e) => e.status === 'planned')).toBe(true);

    const second = await getOrCreateWeekPlan(household.id, week);
    expect(second).toHaveLength(7); // no duplicates created
  });

  it('handles concurrent calls for a brand-new week without throwing', async () => {
    const { household } = await makeHouseholdWithMeals('L', []);
    const week = getWeekDateKeys(new Date());

    const [first, second] = await Promise.all([
      getOrCreateWeekPlan(household.id, week),
      getOrCreateWeekPlan(household.id, week),
    ]);

    expect(first).toHaveLength(7);
    expect(second).toHaveLength(7);
  });
});

describe('generateAndSaveWeeklyPlan', () => {
  it('assigns meals for a household and does not touch another household', async () => {
    const { household } = await makeHouseholdWithMeals('B', ['Meal 1', 'Meal 2', 'Meal 3']);
    const { household: otherHousehold } = await makeHouseholdWithMeals('C', ['Other Meal']);
    const week = getWeekDateKeys(new Date());

    await generateAndSaveWeeklyPlan(household.id, week);

    const entries = await getOrCreateWeekPlan(household.id, week);
    expect(entries.filter((e) => e.mealId !== null).length).toBeGreaterThan(0);

    const otherEntries = await getOrCreateWeekPlan(otherHousehold.id, week);
    expect(otherEntries.every((e) => e.mealId === null)).toBe(true);
  });

  it('does not overwrite a day already marked cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('D', ['Meal X', 'Meal Y']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    await generateAndSaveWeeklyPlan(household.id, week);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
    });
    expect(entry?.mealId).toBe(meals[0].id);
    expect(entry?.status).toBe('cooked');
  });
});

describe('setPlanEntryMeal', () => {
  it('overrides a day with a chosen meal', async () => {
    const { household, meals } = await makeHouseholdWithMeals('E', ['Meal 1', 'Meal 2']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[2], meals[1].id);

    expect(result?.mealId).toBe(meals[1].id);
  });

  it('rejects a meal that belongs to another household', async () => {
    const { household } = await makeHouseholdWithMeals('F', []);
    const { meals: otherMeals } = await makeHouseholdWithMeals('G', ['Foreign Meal']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    const result = await setPlanEntryMeal(household.id, week[0], otherMeals[0].id);

    expect(result).toBeNull();
  });

  it('rejects an override on a day already marked cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('K', ['Meal 1', 'Meal 2']);
    const week = getWeekDateKeys(new Date());
    await getOrCreateWeekPlan(household.id, week);

    await prisma.planEntry.update({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
      data: { status: 'cooked', mealId: meals[0].id },
    });

    const result = await setPlanEntryMeal(household.id, week[0], meals[1].id);

    expect(result).toBeNull();
    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(week[0]) } },
    });
    expect(entry?.status).toBe('cooked');
    expect(entry?.mealId).toBe(meals[0].id);
  });
});

describe('transitionPastPlannedEntries', () => {
  it('marks a past planned entry with a meal as cooked', async () => {
    const { household, meals } = await makeHouseholdWithMeals('H', ['Meal 1']);
    const pastDateKey = toDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), mealId: meals[0].id, status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(pastDateKey) } },
    });
    expect(entry?.status).toBe('cooked');
  });

  it('marks a past planned entry with no meal as skipped', async () => {
    const { household } = await makeHouseholdWithMeals('I', []);
    const pastDateKey = toDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(pastDateKey), status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(pastDateKey) } },
    });
    expect(entry?.status).toBe('skipped');
  });

  it('does not touch a future planned entry', async () => {
    const { household } = await makeHouseholdWithMeals('J', []);
    const futureDateKey = toDateKey(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    await prisma.planEntry.create({
      data: { householdId: household.id, date: new Date(futureDateKey), status: 'planned' },
    });

    await transitionPastPlannedEntries(household.id);

    const entry = await prisma.planEntry.findUnique({
      where: { householdId_date: { householdId: household.id, date: new Date(futureDateKey) } },
    });
    expect(entry?.status).toBe('planned');
  });
});
