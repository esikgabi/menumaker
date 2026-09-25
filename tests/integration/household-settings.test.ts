import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, renameHousehold, listHouseholdMembers, leaveHousehold, updateActiveWeekdays } from '@/lib/household';

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

describe('updateActiveWeekdays', () => {
  it('defaults to all 7 weekdays for a new household', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner6@settings-test.example.com', name: 'Owner6' } });
    const household = await createHouseholdWithOwner('Settings Test Household G', owner.id);

    expect(household.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('persists a restricted set of weekdays', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner7@settings-test.example.com', name: 'Owner7' } });
    const household = await createHouseholdWithOwner('Settings Test Household H', owner.id);

    const updated = await updateActiveWeekdays(household.id, [0, 1, 2, 3, 4]);

    expect(updated.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects an empty array and leaves the existing value untouched', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner8@settings-test.example.com', name: 'Owner8' } });
    const household = await createHouseholdWithOwner('Settings Test Household I', owner.id);

    await expect(updateActiveWeekdays(household.id, [])).rejects.toThrow();

    const unchanged = await prisma.household.findUnique({ where: { id: household.id } });
    expect(unchanged?.activeWeekdays.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
