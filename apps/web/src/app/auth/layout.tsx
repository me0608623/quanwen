import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登入",
  description: "券問是一個媒合「想發問卷的人」與「願意填問卷的人」的雙邊平台。",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
