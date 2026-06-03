import type { Metadata } from 'next';
import { DashboardNav } from './_components/dashboard-nav';

export const metadata: Metadata = {
  title: { default: '我的問卷', template: '%s · 券問 QuanWen' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <DashboardNav />
      {children}
    </div>
  );
}
