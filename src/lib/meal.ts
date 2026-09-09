import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  tagIds: z.array(z.string()),
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
