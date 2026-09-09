import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const DEFAULT_TAGS = [
  'child favourite',
  'absolute favourite',
  'parent favourite',
  'healthy',
  'fast to make',
];

export function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// ponytail: invite codes are not checked for collisions before insert (8-char
// keyspace is ~2.8e12, astronomically unlikely at this app's scale). If a
// collision ever happens, Prisma throws a unique-constraint error and the
// household is not created; add a retry loop if this is ever observed.
export async function createHouseholdWithOwner(name: string, ownerUserId: string) {
  return prisma.household.create({
    data: {
      name,
      inviteCode: generateInviteCode(),
      tags: { create: DEFAULT_TAGS.map((tagName) => ({ name: tagName })) },
      users: { connect: { id: ownerUserId } },
    },
  });
}

export async function joinHouseholdByInviteCode(inviteCode: string, userId: string) {
  const household = await prisma.household.findUnique({ where: { inviteCode } });
  if (!household) return null;

  await prisma.user.update({ where: { id: userId }, data: { householdId: household.id } });
  return household;
}

export const householdNameSchema = z.string().trim().min(1).max(100);

export async function renameHousehold(householdId: string, name: string) {
  return prisma.household.update({ where: { id: householdId }, data: { name } });
}

export async function listHouseholdMembers(householdId: string) {
  return prisma.user.findMany({
    where: { householdId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Removes the user from the household. If they were the last member, the
 * household itself (and, via schema-level cascading deletes, its meals,
 * tags, and plan entries) is deleted.
 */
export async function leaveHousehold(householdId: string, userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { householdId: null } });

  const remaining = await prisma.user.count({ where: { householdId } });
  if (remaining === 0) {
    await prisma.household.delete({ where: { id: householdId } });
  }
}
