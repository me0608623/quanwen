import type { Metadata } from 'next';

export const metadata: Metadata = { title: '實名審核' };

export default function AdminKycLayout({ children }: { children: React.ReactNode }) {
  return children;
}
