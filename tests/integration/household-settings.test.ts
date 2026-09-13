import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, renameHousehold, listHouseholdMembers, leaveHousehold } from '@/lib/household';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@settings-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Settings Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('renameHousehold', () => {
  it('updates the household name', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner@settings-test.example.com', name: 'Owner' } });
    const household = await createHouseholdWithOwner('Settings Test Household A', owner.id);

    const updated = await renameHousehold(household.id, 'Renamed Household');

    expect(updated.name).toBe('Renamed Household');
  });
});

describe('listHouseholdMembers', () => {
  it('lists all members of the household, not other households', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner2@settings-test.example.com', name: 'Owner2' } });
    const household = await createHouseholdWithOwner('Settings Test Household B', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner@settings-test.example.com', name: 'Joiner', householdId: household.id },
    });
    const otherOwner = await prisma.user.create({ data: { email: 'other@settings-test.example.com', name: 'Other' } });
    await createHouseholdWithOwner('Settings Test Household C', otherOwner.id);

    const members = await listHouseholdMembers(household.id);

    expect(members.map((m) => m.id).sort()).toEqual([owner.id, joiner.id].sort());
  });
});

describe('leaveHousehold', () => {
  it('clears the leaving user’s householdId but keeps the household when other members remain', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner3@settings-test.example.com', name: 'Owner3' } });
    const household = await createHouseholdWithOwner('Settings Test Household D', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner2@settings-test.example.com', name: 'Joiner2', householdId: household.id },
    });

    await leaveHousehold(household.id, joiner.id);

    const updatedJoiner = await prisma.user.findUnique({ where: { id: joiner.id } });
    expect(updatedJoiner?.householdId).toBeNull();
    const stillExists = await prisma.household.findUnique({ where: { id: household.id } });
    expect(stillExists).not.toBeNull();
  });

  it('deletes the household when the last member leaves', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner4@settings-test.example.com', name: 'Owner4' } });
    const household = await createHouseholdWithOwner('Settings Test Household E', owner.id);

    await leaveHousehold(household.id, owner.id);

    const gone = await prisma.household.findUnique({ where: { id: household.id } });
    expect(gone).toBeNull();
  });

  it('cascades meal/tag/plan-entry deletion when the last member leaves', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner5@settings-test.example.com', name: 'Owner5' } });
    const household = await createHouseholdWithOwner('Settings Test Household F', owner.id);
    const meal = await prisma.meal.create({ data: { householdId: household.id, name: 'Doomed Meal' } });

    await leaveHousehold(household.id, owner.id);

    const mealGone = await prisma.meal.findUnique({ where: { id: meal.id } });
    expect(mealGone).toBeNull();
  });
});
