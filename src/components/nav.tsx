import Link from 'next/link';

const links = [
  { href: '/plan', label: 'Weekly Plan' },
  { href: '/meals', label: 'Meals' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  return (
    <nav className="flex gap-4 border-b p-4">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
