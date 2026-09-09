'use server';

import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

export async function setLocale(locale: string) {
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) return;

  cookies().set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });

  const session = await getServerSession(authOptions);
  if (session?.user) {
    await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  }
}
