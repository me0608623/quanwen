"use client";
import { usePathname } from "next/navigation";
import { Navbar } from "./navbar";
export function ConditionalNavbar(){
  const pathname=usePathname();
  // 公開頁面不需掛載 Navbar（避免觸發未認證 API 呼叫）
  const publicRoutes=["/","/features","/solutions","/pricing","/stories","/integrations","/intro","/onboarding"];
  if(pathname?.startsWith("/auth")) return null;
  if(publicRoutes.includes(pathname??"")) return null;
  return <Navbar/>;
}
