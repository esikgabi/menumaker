'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { mealInputSchema, createMeal, updateMeal, deleteMeal, createTag } from '@/lib/meal';

function parseMealForm(formData: FormData) {
  return mealInputSchema.parse({
    name: formData.get('name'),
    note: formData.get('note') ?? '',
    tagIds: formData.getAll('tagIds').map(String),
    category: formData.get('category'),
    durationDays: formData.get('durationDays'),
  });
}

export async function createMealAction(formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  await createMeal(session.user.householdId!, session.user.id, input);
  revalidatePath('/meals');
}

export async function updateMealAction(mealId: string, formData: FormData) {
  const session = await requireHousehold();
  const input = parseMealForm(formData);
  const result = await updateMeal(session.user.householdId!, mealId, input);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function deleteMealAction(mealId: string) {
  const session = await requireHousehold();
  const result = await deleteMeal(session.user.householdId!, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/meals');
}

export async function createTagAction(name: string) {
  const session = await requireHousehold();
  const tag = await createTag(session.user.householdId!, name);
  revalidatePath('/meals');
  return tag;
}
