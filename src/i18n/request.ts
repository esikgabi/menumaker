import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './config';

export default getRequestConfig(async () => {
  const session = await getServerSession(authOptions);
  let locale = session?.user?.locale as Locale | undefined;

  if (!locale) {
    const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
      locale = cookieLocale as Locale;
    }
  }

  if (!locale) {
    const acceptLanguage = headers().get('accept-language') ?? '';
    const preferred = acceptLanguage.split(',')[0]?.split('-')[0];
    locale = SUPPORTED_LOCALES.includes(preferred as Locale) ? (preferred as Locale) : DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
