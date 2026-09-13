'use server';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { createHouseholdWithOwner, joinHouseholdByInviteCode } from '@/lib/household';

export async function createHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/onboarding?error=name-required');

  await createHouseholdWithOwner(name, session.user.id);
  redirect('/plan');
}

export async function joinHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');

  const code = String(formData.get('inviteCode') ?? '').trim().toUpperCase();
  if (!code) redirect('/onboarding?error=code-required');

  const household = await joinHouseholdByInviteCode(code, session.user.id);
  if (!household) redirect('/onboarding?error=invalid-code');

  redirect('/plan');
}
