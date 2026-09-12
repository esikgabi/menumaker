import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()),
  category: z.enum(['soup', 'main']),
});

export type MealInput = z.infer<typeof mealInputSchema>;

export async function listMeals(householdId: string, tagId?: string) {
  return prisma.meal.findMany({
    where: {
      householdId,
      ...(tagId ? { tags: { some: { tagId } } } : {}),
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function listTags(householdId: string) {
  return prisma.tag.findMany({ where: { householdId }, orderBy: { name: 'asc' } });
}

async function ownedTagIds(householdId: string, tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const owned = await prisma.tag.findMany({
    where: { id: { in: tagIds }, householdId },
    select: { id: true },
  });
  return owned.map((t) => t.id);
}

export async function createMeal(householdId: string, createdById: string, input: MealInput) {
  const tagIds = await ownedTagIds(householdId, input.tagIds);
  return prisma.meal.create({
    data: {
      householdId,
      createdById,
      name: input.name,
      note: input.note || null,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function updateMeal(householdId: string, mealId: string, input: MealInput) {
  // ponytail: verifies household ownership by scoping the update's WHERE
  // clause instead of a separate SELECT-then-check. If Prisma's updateMany
  // affects 0 rows the caller (Server Action) treats it as "not found /
  // not yours" — no separate authorization check needed at this scale.
  const owned = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!owned) return null;

  await prisma.mealTag.deleteMany({ where: { mealId } });

  const tagIds = await ownedTagIds(householdId, input.tagIds);

  return prisma.meal.update({
    where: { id: mealId },
    data: {
      name: input.name,
      note: input.note || null,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: { tags: { include: { tag: true } } },
  });
}

export async function deleteMeal(householdId: string, mealId: string) {
  const owned = await prisma.meal.findFirst({ where: { id: mealId, householdId } });
  if (!owned) return null;

  await prisma.meal.delete({ where: { id: mealId } });
  return true;
}

export async function createTag(householdId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return prisma.tag.upsert({
    where: { householdId_name: { householdId, name: trimmed } },
    update: {},
    create: { householdId, name: trimmed },
  });
}

export async function renameTag(householdId: string, tagId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const owned = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!owned) return null;

  try {
    return await prisma.tag.update({ where: { id: tagId }, data: { name: trimmed } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export async function deleteTag(householdId: string, tagId: string) {
  const owned = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!owned) return null;

  await prisma.tag.delete({ where: { id: tagId } }); // MealTag rows cascade per Phase 1 schema
  return true;
}
