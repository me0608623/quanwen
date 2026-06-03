import type { Metadata } from 'next';

export const metadata: Metadata = { title: '連結帳號' };

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
