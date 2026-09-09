import { prisma } from '@/lib/prisma';

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
