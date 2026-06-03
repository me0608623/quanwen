import type { Metadata } from 'next';

export const metadata: Metadata = { title: '問卷審核' };

export default function AdminSurveysLayout({ children }: { children: React.ReactNode }) {
  return children;
}
