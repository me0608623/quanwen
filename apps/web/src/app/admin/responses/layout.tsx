import type { Metadata } from 'next';

export const metadata: Metadata = { title: '回應審核' };

export default function AdminResponsesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
