import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function Nav() {
  const t = await getTranslations('Nav');
  const links = [
    { href: '/plan', label: t('plan') },
    { href: '/meals', label: t('meals') },
    { href: '/history', label: t('history') },
    { href: '/settings', label: t('settings') },
  ];

  return (
    <nav className="flex items-center justify-between gap-4 border-b p-4">
      <div className="flex gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
      <LocaleSwitcher />
    </nav>
  );
}
