import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

// ponytail: invite codes are not checked for collisions before insert (12-hex-char
// keyspace is 16^12 ≈ 2.8e14; pre-fix 8-hex codes were only ~4.3e9 and the join
// endpoint had no rate limit, so they were brute-forceable). If a collision ever
// happens, Prisma throws a unique-constraint error and the household is not
// created; add a retry loop if this is ever observed.
export async function createHouseholdWithOwner(name: string, ownerUserId: string) {
  return prisma.household.create({
    data: {
      name,
      inviteCode: generateInviteCode(),
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

// ponytail: renameHousehold and leaveHousehold below do not check the
// household/user exists first; every real caller derives these ids from an
// authenticated session (requireHousehold()) where they're already
// guaranteed valid. Add an existence check if these are ever called with
// unvalidated input.
export async function renameHousehold(householdId: string, name: string) {
  return prisma.household.update({ where: { id: householdId }, data: { name } });
}

export async function getHousehold(householdId: string) {
  return prisma.household.findUnique({ where: { id: householdId } });
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
    // deleteMany is idempotent (0 or 1 rows, never throws) which avoids a
    // P2025 crash if two members leave concurrently and both see remaining===0.
    await prisma.household.deleteMany({ where: { id: householdId } });
  }
}
