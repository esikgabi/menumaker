'use server';

import { revalidatePath } from 'next/cache';
import { requireHousehold } from '@/lib/session';
import { generateAndSaveWeeklyPlan, setPlanEntryMeal, getFutureWeekDateKeys, setPlanDayOverride } from '@/lib/plan';

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

export async function toggleDayOverrideAction(dateKey: string, active: boolean | null) {
  const session = await requireHousehold();
  await setPlanDayOverride(session.user.householdId!, dateKey, active);
  revalidatePath('/plan');
}
