import type { Metadata } from 'next';

export const metadata: Metadata = { title: '帳號安全' };

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
