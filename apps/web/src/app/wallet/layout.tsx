import type { Metadata } from 'next';

export const metadata: Metadata = { title: '我的錢包' };

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children;
}
