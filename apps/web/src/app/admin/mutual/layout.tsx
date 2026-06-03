import type { Metadata } from 'next';

export const metadata: Metadata = { title: '互惠管理' };

export default function AdminMutualLayout({ children }: { children: React.ReactNode }) {
  return children;
}
