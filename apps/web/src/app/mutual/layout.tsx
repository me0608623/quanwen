import type { Metadata } from 'next';

export const metadata: Metadata = { title: '互惠問卷' };

export default function MutualLayout({ children }: { children: React.ReactNode }) {
  return children;
}
