'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getWeekDateKeys } from '@/lib/plan';

export async function generateWeekAction() {
  const session = await requireHousehold();
  const week = getWeekDateKeys(new Date());
  await generateAndSaveWeeklyPlan(session.user.householdId!, week);
  revalidatePath('/plan');
}

export async function overrideDayAction(dateKey: string, mealId: string) {
  const session = await requireHousehold();
  const result = await setPlanEntryMeal(session.user.householdId!, dateKey, mealId);
  if (!result) throw new Error('Meal not found or not in your household');
  revalidatePath('/plan');
}
