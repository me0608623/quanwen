import type { Metadata } from 'next';

export const metadata: Metadata = { title: '個人資料' };

export default function DashboardProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
