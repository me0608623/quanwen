import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "聯絡我們 — 券問 QuanWen",
  description: "有任何問題、合作提案或意見回饋？填寫表單，我們會盡快回覆。",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}