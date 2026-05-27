"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/features", label: "產品優勢" },
  { href: "/solutions", label: "解決方案" },
  { href: "/integrations", label: "整合" },
  { href: "/pricing", label: "價格" },
  { href: "/stories", label: "客戶故事" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleClose = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--q-hairline)] bg-[var(--q-canvas)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-[var(--q-ink)]" onClick={handleClose}>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--q-surface-dark)] text-xs font-semibold text-[var(--q-on-dark)]">
            QW
          </span>
          <span className="font-serif text-lg font-medium">券問 QuanWen</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition ${
                  active ? "text-[var(--q-ink)]" : "text-[var(--q-muted)] hover:text-[var(--q-ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/auth/login" className="px-3 py-2 text-sm font-medium text-[var(--q-ink)]">
            登入
          </Link>
          <Link
            href="/auth/register"
            className="rounded-md bg-[var(--q-primary)] px-4 py-2 text-sm font-semibold text-[var(--q-on-primary)] transition hover:bg-[var(--q-primary-active)]"
          >
            免費開始
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--q-hairline)] text-[var(--q-ink)] md:hidden"
          aria-label="開啟導覽選單"
        >
          <span className="text-lg">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--q-hairline)] bg-[var(--q-canvas)] px-4 py-4 md:hidden">
          <nav className="space-y-1">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleClose}
                className="block rounded-md px-3 py-2 text-sm text-[var(--q-body-strong)] hover:bg-[var(--q-surface-card)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2">
            <Link
              href="/auth/login"
              onClick={handleClose}
              className="rounded-md border border-[var(--q-hairline)] px-3 py-2 text-center text-sm font-medium text-[var(--q-ink)]"
            >
              登入
            </Link>
            <Link
              href="/auth/register"
              onClick={handleClose}
              className="rounded-md bg-[var(--q-primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--q-on-primary)]"
            >
              免費開始
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
