'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutList, UserCircle2 } from 'lucide-react';

const DASHBOARD_NAV = [
  { href: '/dashboard', label: '我的問卷', icon: LayoutList },
  { href: '/dashboard/profile', label: '個人資料', icon: UserCircle2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const showNav =
    pathname === '/dashboard' || pathname === '/dashboard/profile' || pathname === '/dashboard/shop';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {showNav && (
        <nav className="mb-6 flex gap-1 border-b border-border">
          {DASHBOARD_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  pathname === item.href
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {children}
    </div>
  );
}
