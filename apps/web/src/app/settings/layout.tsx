'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_NAV = [
  { href: '/settings/accounts', label: '連結帳號' },
  { href: '/settings/security', label: '帳號安全' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Settings nav tabs — horizontally scrollable on mobile */}
      <nav
        className="mb-6 flex gap-1 border-b border-border overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ WebkitOverflowScrolling: 'touch' }}
        aria-label="設定頁面導航"
      >
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              pathname === item.href
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
            aria-current={pathname === item.href ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
