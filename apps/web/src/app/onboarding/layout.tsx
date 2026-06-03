import type { Metadata } from 'next';

export const metadata: Metadata = { title: '歡迎設定' };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
