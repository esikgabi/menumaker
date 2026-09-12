'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getFutureWeekDateKeys } from '@/lib/plan';

export async function generateWeekAction() {
  const session = await requireHousehold();
  const week = getFutureWeekDateKeys(new Date());
  await generateAndSaveWeeklyPlan(session.user.householdId!, week);
  revalidatePath('/plan');
}

export async function overrideDayAction(dateKey: string, category: 'main' | 'soup', mealId: string | null) {
  const session = await requireHousehold();
  const result = await setPlanEntryMeal(session.user.householdId!, dateKey, category, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/plan');
}
