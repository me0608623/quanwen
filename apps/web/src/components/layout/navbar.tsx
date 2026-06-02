'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMe, useLogout, isPlaceholderEmail } from '@/hooks/use-auth';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useWallet } from '@/hooks/use-wallet';
import { useMyMutualPairs } from '@/hooks/use-mutual';

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

// 非 admin 共用 nav
const USER_TABS = [
  { href: '/dashboard', label: '發問卷', matches: ['/dashboard', '/surveys'] },
  { href: '/tasks',     label: '填問卷', matches: ['/tasks', '/earnings', '/shop'] },
  { href: '/mutual',    label: '互惠',   matches: ['/mutual'] },
  { href: '/spin',      label: '🎡 轉盤', matches: ['/spin'] },
  { href: '/dashboard/shop', label: '🛍️ 商店', matches: ['/dashboard/shop'] },
] as const;

// admin 專屬 nav
const ADMIN_TABS = [
  { href: '/admin',              label: '總覽',     matches: ['/admin'] as string[] },
  { href: '/admin/surveys',      label: '問卷審核', matches: ['/admin/surveys'] },
  { href: '/admin/responses',    label: '可疑填答', matches: ['/admin/responses'] },
  { href: '/admin/kyc',          label: 'KYC',     matches: ['/admin/kyc'] },
  { href: '/admin/withdrawals',  label: '提領審核', matches: ['/admin/withdrawals'] },
  { href: '/admin/appeals',      label: '申訴',     matches: ['/admin/appeals'] },
  { href: '/admin/mutual',       label: '互惠',     matches: ['/admin/mutual'] },
] as const;

function formatNT(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return `NT$${n.toLocaleString()}`;
}

export function Navbar() {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const { data: unread } = useUnreadCount();
  const { data: wallet } = useWallet();
  const { data: mutualPairs } = useMyMutualPairs();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Never show on auth / onboarding pages
  if (pathname.startsWith('/auth') || pathname.startsWith('/onboarding')) return null;

  // Show a thin skeleton bar while the user query is in flight
  if (isLoading) {
    return (
      <div className="sticky top-0 z-50 h-[53px] border-b border-border bg-background/80 backdrop-blur-sm animate-pulse" />
    );
  }

  if (!me) return null;

  const isAdmin = me.role === 'admin';
  const hasPlaceholderEmail = isPlaceholderEmail(me.email);

  // Pick the tab set + home destination based on role
  const tabs = isAdmin ? ADMIN_TABS : USER_TABS;
  const homeHref = isAdmin ? '/admin' : '/dashboard';

  const isActive = (matches: readonly string[]) =>
    matches.some((m) => pathname === m || pathname.startsWith(m + '/'));

  // 「輪到我填」的互惠配對數 — 顯示在 /mutual tab 右上角
  const mutualActionCount = (mutualPairs ?? []).filter((p) => p.nextAction === 'fill_other').length;
  const badgeFor = (href: string): number => {
    if (href === '/mutual') return mutualActionCount;
    return 0;
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          {/* Logo */}
          <Link href={homeHref} className="shrink-0 text-base font-bold tracking-tight">
            券問 <span className="text-primary">QuanWen</span>
          </Link>

          {/* Desktop primary tabs */}
          <div className="hidden sm:flex flex-1 items-center justify-center gap-1">
            {tabs.map((tab) => {
              const count = badgeFor(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={[
                    'relative rounded-md px-4 py-1.5 text-sm transition-colors',
                    isActive(tab.matches)
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right cluster: wallet + notifications + avatar menu */}
          <div className="flex items-center gap-2">
            {/* Wallet pill — only for non-admin */}
            {!isAdmin && (
              <Link
                href="/wallet"
                className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                錢包 {formatNT(wallet?.cashBalance)}
              </Link>
            )}

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

            {/* Avatar dropdown trigger (desktop only) */}
            <div className="hidden sm:block relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full hover:bg-muted px-1 py-1"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar src={me.avatarUrl} name={me.displayName} />
                <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  {/* click-away overlay */}
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-sm font-medium truncate">{me.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{me.email}</p>
                    </div>
                    <Link href="/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm hover:bg-muted">個人資料</Link>
                    <Link href="/wallet" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm hover:bg-muted">錢包</Link>
                    <Link href="/settings/accounts" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm hover:bg-muted">帳號設定</Link>
                    <Link href="/settings/security" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm hover:bg-muted">安全</Link>
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="block w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted border-t border-border"
                    >
                      登出
                    </button>
                  </div>
                </>
              )}
            </div>

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
            <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border">
              <Avatar src={me.avatarUrl} name={me.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{me.displayName}</p>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">錢包 {formatNT(wallet?.cashBalance)}</p>
                )}
              </div>
            </div>

            {tabs.map((tab) => {
              const count = badgeFor(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMobileOpen(false)}
                  className={[
                    'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                    isActive(tab.matches)
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </Link>
              );
            })}

            {!isAdmin && (
              <Link href="/wallet" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
                錢包
              </Link>
            )}
            <Link href="/profile" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              個人資料
            </Link>
            <Link href="/settings/accounts" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              帳號設定
            </Link>

            <button
              onClick={() => { setMobileOpen(false); logout(); }}
              className="w-full text-left rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"
            >
              登出
            </button>
          </div>
        )}
      </nav>

      {/* Placeholder email warning banner */}
      {hasPlaceholderEmail && !isAdmin && pathname !== '/settings/security' && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-4">
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
          <div className="mx-auto max-w-6xl px-4 py-2">
            <p className="text-xs text-destructive">
              你的帳號已被停用。如有疑問，請聯絡客服。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
