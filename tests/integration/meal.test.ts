import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner } from '@/lib/household';
import { createMeal, createTag, listMeals, updateMeal, deleteMeal } from '@/lib/meal';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.mealTag.deleteMany();
  await prisma.planEntry.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@meal-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Meal Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeHousehold(suffix: string) {
  const owner = await prisma.user.create({
    data: { email: `owner-${suffix}@meal-test.example.com`, name: 'Owner' },
  });
  return createHouseholdWithOwner(`Meal Test Household ${suffix}`, owner.id);
}

describe('meal CRUD and household isolation', () => {
  it('creates a meal with tags scoped to its household', async () => {
    const household = await makeHousehold('A');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const tag = await createTag(household.id, 'healthy');

    const meal = await createMeal(household.id, owner.id, {
      name: 'Salmon Salad',
      note: '',
      tagIds: [tag!.id],
    });

    expect(meal.name).toBe('Salmon Salad');
    expect(meal.tags).toHaveLength(1);
    expect(meal.tags[0].tag.name).toBe('healthy');
  });

  it('does not attach a tag belonging to a different household', async () => {
    const householdA = await makeHousehold('I');
    const foreignTag = await createTag(householdA.id, 'foreign');

    const householdB = await makeHousehold('J');
    const ownerB = (await prisma.user.findFirst({ where: { householdId: householdB.id } }))!;

    const meal = await createMeal(householdB.id, ownerB.id, {
      name: 'Cross Household Meal',
      note: '',
      tagIds: [foreignTag!.id],
    });

    expect(meal.tags).toHaveLength(0);
  });

  it('does not return meals from another household', async () => {
    const householdA = await makeHousehold('B');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    await createMeal(householdA.id, ownerA.id, { name: 'Household A Meal', note: '', tagIds: [] });

    const householdB = await makeHousehold('C');

    const mealsForB = await listMeals(householdB.id);

    expect(mealsForB).toHaveLength(0);
  });

  it('filters meals by tag', async () => {
    const household = await makeHousehold('D');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const healthyTag = await createTag(household.id, 'healthy');
    const fastTag = await createTag(household.id, 'fast to make');

    await createMeal(household.id, owner.id, { name: 'Healthy Meal', note: '', tagIds: [healthyTag!.id] });
    await createMeal(household.id, owner.id, { name: 'Fast Meal', note: '', tagIds: [fastTag!.id] });

    const healthyMeals = await listMeals(household.id, healthyTag!.id);

    expect(healthyMeals).toHaveLength(1);
    expect(healthyMeals[0].name).toBe('Healthy Meal');
  });

  it('rejects updating a meal that belongs to a different household', async () => {
    const householdA = await makeHousehold('E');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'Protected Meal', note: '', tagIds: [] });

    const householdB = await makeHousehold('F');

    const result = await updateMeal(householdB.id, meal.id, { name: 'Hacked', note: '', tagIds: [] });

    expect(result).toBeNull();
  });

  it('rejects deleting a meal that belongs to a different household', async () => {
    const householdA = await makeHousehold('G');
    const ownerA = (await prisma.user.findFirst({ where: { householdId: householdA.id } }))!;
    const meal = await createMeal(householdA.id, ownerA.id, { name: 'Protected Meal 2', note: '', tagIds: [] });

    const householdB = await makeHousehold('H');

    const result = await deleteMeal(householdB.id, meal.id);

    expect(result).toBeNull();
  });
});
