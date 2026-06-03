import type { Metadata } from 'next';

export const metadata: Metadata = { title: '抽獎管理' };

export default function AdminLotteryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
