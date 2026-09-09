import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export async function requireHousehold() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (!session.user.householdId) redirect('/onboarding');
  return session;
}

export async function requireSessionNoHousehold() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan');
  return session;
}
