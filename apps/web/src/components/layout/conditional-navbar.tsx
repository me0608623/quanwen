"use client";
import { usePathname } from "next/navigation";
import { Navbar } from "./navbar";

// 只有需要登入的頁面才掛載 Navbar（觸發 useMe 等認證 API 呼叫）
// 與 middleware.ts PROTECTED_PREFIXES 保持一致
const NAVBAR_PREFIXES = [
  "/dashboard",
  "/profile",
  "/tasks",
  "/earnings",
  "/wallet",
  "/settings",
  "/notifications",
  "/surveys",
  "/admin",
  "/shop",
  "/spin",
];

export function ConditionalNavbar() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (pathname.startsWith("/auth")) return null;
  // /onboarding 和 /intro 是登入後的引導流程，不需 Navbar
  if (pathname === "/onboarding" || pathname === "/intro") return null;
  // /mutual 需要登入但要 navbar
  if (pathname.startsWith("/mutual")) return <Navbar />;
  // 只有受保護路徑才掛載 Navbar
  if (NAVBAR_PREFIXES.some((p) => pathname.startsWith(p))) return <Navbar />;
  return null;
}
