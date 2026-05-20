'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_NAV = [
  { href: '/settings/accounts', label: '帳號連結' },
  { href: '/settings/security', label: '帳號安全' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Settings nav tabs */}
      <nav className="mb-6 flex gap-1 border-b border-border">
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              pathname === item.href
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
