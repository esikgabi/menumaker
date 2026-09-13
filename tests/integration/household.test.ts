import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, joinHouseholdByInviteCode, DEFAULT_TAGS } from '@/lib/household';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.mealTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@household-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('createHouseholdWithOwner', () => {
  it('seeds 5 default tags and assigns the owner', async () => {
    const owner = await prisma.user.create({
      data: { email: 'owner@household-test.example.com', name: 'Owner' },
    });

    const household = await createHouseholdWithOwner('Test Household A', owner.id);

    const tags = await prisma.tag.findMany({ where: { householdId: household.id } });
    expect(tags.map((t) => t.name).sort()).toEqual([...DEFAULT_TAGS].sort());

    const updatedOwner = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(updatedOwner?.householdId).toBe(household.id);
  });
});

describe('joinHouseholdByInviteCode', () => {
  it('adds a user to an existing household', async () => {
    const owner = await prisma.user.create({
      data: { email: 'owner2@household-test.example.com', name: 'Owner2' },
    });
    const household = await createHouseholdWithOwner('Test Household B', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner@household-test.example.com', name: 'Joiner' },
    });

    const joined = await joinHouseholdByInviteCode(household.inviteCode, joiner.id);

    expect(joined?.id).toBe(household.id);
    const updatedJoiner = await prisma.user.findUnique({ where: { id: joiner.id } });
    expect(updatedJoiner?.householdId).toBe(household.id);
  });

  it('returns null for an invalid invite code', async () => {
    const joiner = await prisma.user.create({
      data: { email: 'joiner2@household-test.example.com', name: 'Joiner2' },
    });

    const result = await joinHouseholdByInviteCode('NOPE0000', joiner.id);

    expect(result).toBeNull();
  });
});
