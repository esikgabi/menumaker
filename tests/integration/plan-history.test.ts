import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal } from '@/lib/meal';
import { listCookedHistory, toDateKey, getWeekDateKeys } from '@/lib/plan';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@history-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'History Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeHousehold(suffix: string) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@history-test.example.com`, name: 'Owner' },
  });
  return { household: await createHouseholdWithOwner(`History Test Household ${suffix}`, owner.id), owner };
}

describe('listCookedHistory', () => {
  it('returns only cooked entries, grouped by week, most recent week first', async () => {
    const { household, owner } = await makeHousehold('A');
    const meal = await createMeal(household.id, owner.id, { name: 'Cooked Meal', note: '', tagIds: [] });

    const thisWeek = getWeekDateKeys(new Date());
    const lastWeek = getWeekDateKeys(new Date(new Date(thisWeek[0]).getTime() - 7 * 24 * 60 * 60 * 1000));

    await prisma.planEntry.createMany({
      data: [
        { householdId: household.id, date: new Date(thisWeek[0]), mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(thisWeek[1]), mealId: meal.id, status: 'planned' }, // excluded
        { householdId: household.id, date: new Date(lastWeek[0]), mealId: meal.id, status: 'cooked' },
        { householdId: household.id, date: new Date(lastWeek[1]), mealId: null, status: 'skipped' }, // excluded
      ],
    });

    const weeks = await listCookedHistory(household.id);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStartKey).toBe(thisWeek[0]); // most recent week first
    expect(weeks[0].entries).toHaveLength(1);
    expect(weeks[0].entries[0].meal?.name).toBe('Cooked Meal');
    expect(weeks[1].weekStartKey).toBe(lastWeek[0]);
    expect(weeks[1].entries).toHaveLength(1);
  });

  it('does not return another household’s history', async () => {
    const { household: householdA, owner: ownerA } = await makeHousehold('B');
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'A Meal', note: '', tagIds: [] });
    await prisma.planEntry.create({
      data: { householdId: householdA.id, date: new Date(toDateKey(new Date())), mealId: meal.id, status: 'cooked' },
    });

    const { household: householdB } = await makeHousehold('C');

    const weeks = await listCookedHistory(householdB.id);

    expect(weeks).toHaveLength(0);
  });
});
