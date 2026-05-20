'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMe, useLogout, isPlaceholderEmail } from '@/hooks/use-auth';
import { useUnreadCount } from '@/hooks/use-notifications';

function Avatar({ src, name }: { src: string | null | undefined; name: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={28}
        height={28}
        className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-border">
      {initials}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const { data: unread } = useUnreadCount();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Never show on auth / onboarding pages
  if (pathname.startsWith('/auth') || pathname.startsWith('/onboarding')) return null;

  // Show a thin skeleton bar while the user query is in flight so the page
  // doesn't jump when the navbar suddenly appears
  if (isLoading) {
    return (
      <div className="sticky top-0 z-50 h-[53px] border-b border-border bg-background/80 backdrop-blur-sm animate-pulse" />
    );
  }

  if (!me) return null;

  const isSurveyor = me.role === 'surveyor';
  const isAdmin = me.role === 'admin';
  const hasPlaceholderEmail = isPlaceholderEmail(me.email);

  const navLinks = isAdmin
    ? [
        { href: '/admin', label: '總覽' },
        { href: '/admin/surveys', label: '問卷審核' },
        { href: '/admin/responses', label: '可疑填答' },
        { href: '/admin/withdrawals', label: '提領審核' },
      ]
    : isSurveyor
    ? [
        { href: '/dashboard', label: '我的問卷' },
        { href: '/dashboard/surveys/new', label: '+ 新增' },
        { href: '/wallet', label: '錢包' },
        { href: '/dashboard/profile', label: '個人資料' },
        { href: '/settings/accounts', label: '帳號' },
      ]
    : [
        { href: '/tasks', label: '填問卷' },
        { href: '/earnings', label: '我的收益' },
        { href: '/wallet', label: '錢包' },
        { href: '/profile', label: '個人資料' },
        { href: '/settings/accounts', label: '帳號' },
      ];

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'));

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <Link
            href={isSurveyor ? '/dashboard' : isAdmin ? '/admin' : '/tasks'}
            className="text-base font-bold tracking-tight"
          >
            券問 <span className="text-primary">QuanWen</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive(link.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: notifications + user + hamburger */}
          <div className="flex items-center gap-2">
            {/* 通知鈴鐺 */}
            <Link href="/notifications" className="relative rounded-md p-1.5 hover:bg-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {(unread?.count ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                  {unread!.count > 9 ? '9+' : unread!.count}
                </span>
              )}
            </Link>

            {/* Avatar + name (desktop only) */}
            <div className="hidden sm:flex items-center gap-1.5">
              <Avatar src={me.avatarUrl} name={me.displayName} />
              <span className="text-sm text-muted-foreground truncate max-w-[100px]">
                {me.displayName}
              </span>
            </div>

            {/* Desktop logout */}
            <button
              onClick={logout}
              className="hidden sm:block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              登出
            </button>

            {/* Mobile: hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="sm:hidden rounded-md p-1.5 hover:bg-muted"
              aria-label={mobileOpen ? '關閉選單' : '開啟選單'}
            >
              {mobileOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-border bg-background px-4 py-3 space-y-1">
            {/* User row */}
            <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border">
              <Avatar src={me.avatarUrl} name={me.displayName} />
              <span className="text-sm font-medium truncate flex-1">{me.displayName}</span>
            </div>

            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={[
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(link.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {link.label}
              </Link>
            ))}

            <button
              onClick={() => { setMobileOpen(false); logout(); }}
              className="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              登出
            </button>
          </div>
        )}
      </nav>

      {/* Placeholder email warning banner */}
      {hasPlaceholderEmail && !isAdmin && pathname !== '/settings/security' && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-4">
            <p className="text-xs text-amber-700">
              你尚未設定電子郵件，若遺失第三方登入將無法取回帳號。
            </p>
            <Link
              href="/settings/security"
              className="shrink-0 text-xs font-medium text-amber-700 underline hover:no-underline"
            >
              立即設定 →
            </Link>
          </div>
        </div>
      )}

      {/* Account suspended banner */}
      {me.status === 'suspended' && (
        <div className="bg-destructive/10 border-b border-destructive/20">
          <div className="mx-auto max-w-5xl px-4 py-2">
            <p className="text-xs text-destructive">
              你的帳號已被停用。如有疑問，請聯絡客服。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
