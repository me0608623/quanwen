import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: '管理後台', template: '%s · 券問 QuanWen' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
