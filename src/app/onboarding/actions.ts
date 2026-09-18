'use server';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { createHouseholdWithOwner, joinHouseholdByInviteCode, householdNameSchema } from '@/lib/household';

export async function createHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan'); // the page guards too; the action must not be bypassable

  const parsed = householdNameSchema.safeParse(String(formData.get('name') ?? '').trim());
  if (!parsed.success) redirect('/onboarding?error=name-required');

  await createHouseholdWithOwner(parsed.data, session.user.id);
  redirect('/plan');
}

export async function joinHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan');

  const code = String(formData.get('inviteCode') ?? '').trim().toUpperCase();
  if (!code) redirect('/onboarding?error=code-required');

  const household = await joinHouseholdByInviteCode(code, session.user.id);
  if (!household) redirect('/onboarding?error=invalid-code');

  redirect('/plan');
}
