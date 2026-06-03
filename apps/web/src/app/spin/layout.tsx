import type { Metadata } from 'next';

export const metadata: Metadata = { title: '轉盤抽獎' };

export default function SpinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
