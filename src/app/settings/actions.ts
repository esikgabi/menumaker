'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHousehold } from '@/lib/session';
import { householdNameSchema, renameHousehold, leaveHousehold, updateActiveWeekdays } from '@/lib/household';
import { createTag, renameTag, deleteTag } from '@/lib/meal';

export async function renameHouseholdAction(formData: FormData) {
  const session = await requireHousehold();
  const name = householdNameSchema.parse(formData.get('name'));
  await renameHousehold(session.user.householdId!, name);
  revalidatePath('/settings');
}

export async function leaveHouseholdAction() {
  const session = await requireHousehold();
  await leaveHousehold(session.user.householdId!, session.user.id);
  redirect('/onboarding');
}

export async function createTagAction(name: string) {
  const session = await requireHousehold();
  return createTag(session.user.householdId!, name);
}

export async function renameTagAction(tagId: string, name: string) {
  const session = await requireHousehold();
  const result = await renameTag(session.user.householdId!, tagId, name);
  if (!result) throw new Error('Tag not found or not in your household');
  revalidatePath('/settings');
  revalidatePath('/meals');
}

export async function deleteTagAction(tagId: string) {
  const session = await requireHousehold();
  const result = await deleteTag(session.user.householdId!, tagId);
  if (!result) throw new Error('Tag not found or not in your household');
  revalidatePath('/settings');
  revalidatePath('/meals');
}

export async function updateActiveWeekdaysAction(weekdays: number[]) {
  const session = await requireHousehold();
  await updateActiveWeekdays(session.user.householdId!, weekdays);
  revalidatePath('/settings');
  revalidatePath('/plan');
}
