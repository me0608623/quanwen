'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DASHBOARD_NAV = [
  { href: '/dashboard',         label: '我的問卷' },
  { href: '/dashboard/profile', label: '個人資料' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Hide the sub-nav on deep survey pages (editor, fill-preview, etc.)
  const showNav = pathname === '/dashboard' || pathname === '/dashboard/profile';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {showNav && (
        <nav className="mb-6 flex gap-1 border-b border-border">
          {DASHBOARD_NAV.map((item) => (
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
      )}

      {children}
    </div>
  );
}
